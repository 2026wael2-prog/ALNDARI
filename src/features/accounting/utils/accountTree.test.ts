import { describe, it, expect } from 'vitest';
import type { Account } from '../types/index';
import {
  buildAccountTree,
  filterAccountTree,
  collectExpandableIds,
  countTreeNodes,
} from './accountTree';

const makeAcc = (
  overrides: Partial<Account> & Pick<Account, 'id' | 'code' | 'name' | 'type'>
): Account => ({
  company_id: 'comp-1',
  balance: 0,
  currency_code: 'SAR',
  is_system: false,
  parent_id: null,
  allow_posting: true,
  ...overrides,
});

describe('accountTree — Scientific Accounting Tree Rollup & Filtering', () => {
  it('rolls up debit, credit, and normalized balances accurately for standard hierarchies', () => {
    const accounts: Account[] = [
      makeAcc({ id: 'a1', code: '1', name: 'الأصول', type: 'asset', allow_posting: false }),
      makeAcc({
        id: 'a11',
        code: '1010',
        name: 'الصناديق',
        type: 'asset',
        parent_id: 'a1',
        allow_posting: false,
      }),
      makeAcc({
        id: 'a111',
        code: '101001',
        name: 'الصندوق العام',
        type: 'asset',
        parent_id: 'a11',
        balance: 1000,
        total_debit: 1500,
        total_credit: 500,
      }),
      makeAcc({
        id: 'a112',
        code: '101002',
        name: 'صندوق المبيعات',
        type: 'asset',
        parent_id: 'a11',
        balance: 2500,
        total_debit: 3000,
        total_credit: 500,
      }),
      makeAcc({ id: 'l1', code: '2', name: 'الخصوم', type: 'liability', allow_posting: false }),
      makeAcc({
        id: 'l11',
        code: '2100',
        name: 'الموردون',
        type: 'liability',
        parent_id: 'l1',
        balance: 800,
        total_debit: 200,
        total_credit: 1000,
      }),
    ];

    const roots = buildAccountTree(accounts);
    expect(roots).toHaveLength(2);

    const assetsRoot = roots.find(r => r.id === 'a1')!;
    expect(assetsRoot.balance).toBe(3500);
    expect(assetsRoot.rolled_debit).toBe(4500);
    expect(assetsRoot.rolled_credit).toBe(1000);

    const liabRoot = roots.find(r => r.id === 'l1')!;
    expect(liabRoot.balance).toBe(800);
    expect(liabRoot.rolled_debit).toBe(200);
    expect(liabRoot.rolled_credit).toBe(1000);
  });

  it('prevents double sign-flip corruption even if a legacy subtree has mixed account types', () => {
    const accounts: Account[] = [
      makeAcc({
        id: 'p',
        code: 'MZ-12201',
        name: 'ذمم مدينة مختلفة',
        type: 'asset',
        allow_posting: false,
      }),
      makeAcc({
        id: 'c1',
        code: 'MZ-1210864',
        name: 'صندوق الفائض',
        type: 'asset',
        parent_id: 'p',
        balance: 3000,
        total_debit: 3000,
        total_credit: 0,
      }),
      makeAcc({
        id: 'c2',
        code: 'MZ-2112',
        name: 'مسحوبات',
        type: 'equity',
        parent_id: 'p',
        balance: -1000,
        total_debit: 1000,
        total_credit: 0,
      }),
    ];

    const [parent] = buildAccountTree(accounts);
    expect(parent.raw_balance).toBe(4000);
    expect(parent.balance).toBe(4000);
    expect(parent.rolled_debit).toBe(4000);
  });

  it('filters by query, type, zero balances, and legacy MZ archive while preserving ancestor paths', () => {
    const accounts: Account[] = [
      makeAcc({ id: 'a1', code: '1', name: 'الأصول', type: 'asset', allow_posting: false }),
      makeAcc({
        id: 'a11',
        code: '101001',
        name: 'الصندوق العام',
        type: 'asset',
        parent_id: 'a1',
        balance: 500,
        total_debit: 500,
        total_credit: 0,
      }),
      makeAcc({
        id: 'a12',
        code: '101004',
        name: 'صندوق فارغ',
        type: 'asset',
        parent_id: 'a1',
        balance: 0,
        total_debit: 0,
        total_credit: 0,
      }),
      makeAcc({ id: 'mz1', code: 'MZ-1', name: 'اصول الميزان', type: 'asset', allow_posting: false }),
      makeAcc({
        id: 'mz11',
        code: 'MZ-135',
        name: 'صندوق سعودي',
        type: 'asset',
        parent_id: 'mz1',
        balance: 100,
        total_debit: 100,
        total_credit: 0,
      }),
    ];

    const tree = buildAccountTree(accounts);

    const noMz = filterAccountTree(tree, { hideLegacyArchive: true });
    expect(noMz.map(r => r.code)).toEqual(['1']);

    const nonZero = filterAccountTree(tree, { hideZeroBalances: true, hideLegacyArchive: true });
    expect(countTreeNodes(nonZero)).toBe(2);

    const searched = filterAccountTree(tree, { query: '101001' });
    expect(searched).toHaveLength(1);
    expect(searched[0].children).toHaveLength(1);
    expect(searched[0].children[0].code).toBe('101001');

    const expandable = collectExpandableIds(tree);
    expect(expandable.has('a1')).toBe(true);
    expect(expandable.has('mz1')).toBe(true);
    expect(expandable.has('a11')).toBe(false);
  });
});
