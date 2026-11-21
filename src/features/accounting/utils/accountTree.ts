import type { Account, AccountType } from '../types/index';
import { normalizeSearch } from '../../../core/utils/search';

export interface AccountNode extends Account {
  children: AccountNode[];
  /** الرصيد الخام الموحد الإشارة (المدين - الدائن) قبل التطبيع حسب نوع الحساب */
  raw_balance: number;
  rolled_debit: number;
  rolled_credit: number;
}

export interface AccountTreeFilterOptions {
  query?: string;
  typeFilter?: AccountType | 'all';
  hideZeroBalances?: boolean;
  hideLegacyArchive?: boolean;
}

export const isCreditNormalAccount = (type: AccountType | string): boolean =>
  type === 'liability' || type === 'equity' || type === 'revenue';

/**
 * يستخرج الرصيد الخام الموحَّد الإشارة (مدين - دائن) للحساب الواحد قبل التجميع الهرمي،
 * بحيث لا يحدث خطأ انقلاب الإشارة المضاعف عند تجميع شجرة الحسابات.
 */
const getLeafRawBalance = (acc: Account): number => {
  if (acc.total_debit !== undefined && acc.total_credit !== undefined) {
    return (Number(acc.total_debit) || 0) - (Number(acc.total_credit) || 0);
  }
  const normalized = Number(acc.balance) || 0;
  return isCreditNormalAccount(acc.type) ? -normalized : normalized;
};

/**
 * يبني شجرة دليل الحسابات ويجمع الأرصدة والمدين والدائن من الأوراق إلى الجذور
 * باستخدام الرصيد الخام الموحد الإشارة (Dr - Cr) ثم يطبّق طبيعة كل عقدة عند العرض فقط.
 */
export const buildAccountTree = (accounts: Account[]): AccountNode[] => {
  const map = new Map<string, AccountNode>();
  const roots: AccountNode[] = [];

  for (const acc of accounts) {
    const rawBalance = getLeafRawBalance(acc);
    map.set(acc.id, {
      ...acc,
      children: [],
      raw_balance: rawBalance,
      rolled_debit: Number(acc.total_debit) || 0,
      rolled_credit: Number(acc.total_credit) || 0,
    });
  }

  for (const acc of accounts) {
    const node = map.get(acc.id);
    if (!node) continue;
    if (acc.parent_id !== null && acc.parent_id !== undefined && acc.parent_id !== '') {
      const parent = map.get(acc.parent_id);
      if (parent && parent.id !== node.id) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  const rollup = (node: AccountNode): { raw: number; dr: number; cr: number } => {
    let raw = node.raw_balance;
    let dr = node.rolled_debit;
    let cr = node.rolled_credit;

    for (const child of node.children) {
      const childTotals = rollup(child);
      raw += childTotals.raw;
      dr += childTotals.dr;
      cr += childTotals.cr;
    }

    node.raw_balance = raw;
    node.rolled_debit = dr;
    node.rolled_credit = cr;
    node.total_debit = dr;
    node.total_credit = cr;
    node.balance = isCreditNormalAccount(node.type) ? -raw : raw;

    return { raw, dr, cr };
  };

  for (const root of roots) {
    rollup(root);
  }

  return roots;
};

const EPSILON = 0.005;

export const filterAccountTree = (
  roots: AccountNode[],
  options: AccountTreeFilterOptions
): AccountNode[] => {
  const {
    query = '',
    typeFilter = 'all',
    hideZeroBalances = false,
    hideLegacyArchive = false,
  } = options;

  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);

  const filterNode = (node: AccountNode): AccountNode | null => {
    if (hideLegacyArchive && node.code.startsWith('MZ-')) {
      return null;
    }

    const filteredChildren = node.children
      .map(filterNode)
      .filter((c): c is AccountNode => c !== null);

    const matchesType = typeFilter === 'all' || node.type === typeFilter;
    const hasActivity =
      Math.abs(node.balance) >= EPSILON ||
      Math.abs(node.rolled_debit) >= EPSILON ||
      Math.abs(node.rolled_credit) >= EPSILON;
    const matchesZero = !hideZeroBalances || hasActivity;

    const searchable = normalizeSearch(`${node.code} ${node.name}`);
    const matchesQuery =
      tokens.length === 0 || tokens.every(token => searchable.includes(token));

    const selfMatches = matchesType && matchesZero && matchesQuery;

    if (selfMatches || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      };
    }

    return null;
  };

  return roots.map(filterNode).filter((n): n is AccountNode => n !== null);
};

export const collectExpandableIds = (roots: AccountNode[]): Set<string> => {
  const ids = new Set<string>();
  const walk = (nodes: AccountNode[]) => {
    for (const node of nodes) {
      if (node.children.length > 0) {
        ids.add(node.id);
        walk(node.children);
      }
    }
  };
  walk(roots);
  return ids;
};

export const countTreeNodes = (roots: AccountNode[]): number => {
  let count = 0;
  const walk = (nodes: AccountNode[]) => {
    for (const node of nodes) {
      count += 1;
      if (node.children.length > 0) walk(node.children);
    }
  };
  walk(roots);
  return count;
};
