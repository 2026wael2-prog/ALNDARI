import React, { useMemo, useState, Fragment } from 'react';
import {
  useAccounts,
  useAccountMutations,
  useCashboxes,
  useExchangeCompanies,
} from '../../hooks/index';
import { isTreasuryAccount } from '../../services/reportService';
import { formatCurrency } from '../../../../core/utils';
import { Wallet, Landmark, Loader2, Globe, ChevronRight, Building2 } from 'lucide-react';
import { cn } from '../../../../core/utils';
import Button from '../../../../ui/base/Button';
import { AddTreasuryEntityModal } from './AddTreasuryEntityModal';
import type { Account } from '../../types/models';

interface Props {
  onSelectAccount: (id: string) => void;
  selectedAccountId: string | null;
}

/** عقدة شجرة الحسابات (بنية حساب + أبناء). */
interface AccountNode extends Account {
  children: AccountNode[];
}

// Recursive Sidebar Item Component
const SidebarItem: React.FC<{
  node: AccountNode;
  depth?: number;
  onSelect: (id: string) => void;
  selectedId: string | null;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}> = ({ node, depth = 0, onSelect, selectedId, expandedIds, onToggle }) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;

  const getIcon = () => {
    if (hasChildren) return <Globe size={14} />;
    const upperCode = node.code.trim().toUpperCase();
    if (
      upperCode.startsWith('101') ||
      upperCode.startsWith('111') ||
      upperCode.startsWith('MZ-13')
    ) {
      return <Wallet size={14} />;
    }
    return <Landmark size={14} />;
  };

  return (
    <Fragment>
      <button
        onClick={e => {
          e.stopPropagation();
          if (hasChildren) {
            onToggle(node.id);
          }
          onSelect(node.id);
        }}
        className={cn(
          'group relative flex w-full items-center justify-between text-start transition-colors',
          isSelected
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
            : 'text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]',
          depth === 0
            ? 'border-b border-[var(--app-border)] p-3 max-md:p-2'
            : 'p-2 ps-4 max-md:p-1.5'
        )}
        style={{ paddingInlineStart: `${depth * 12 + 12}px` }}
      >
        <div className="flex items-center gap-2 max-md:gap-1">
          {hasChildren && (
            <div
              className={cn(
                'rounded-full p-0.5 transition-transform hover:bg-black/10 dark:hover:bg-white/10 max-md:p-0',
                isExpanded && 'rotate-90'
              )}
              onClick={e => {
                e.stopPropagation();
                onToggle(node.id);
              }}
            >
              <ChevronRight size={12} />
            </div>
          )}

          {!hasChildren && <div className="w-4" />}

          <div
            className={cn(
              'rounded-md p-1.5 max-md:p-1',
              isSelected
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                : 'bg-[var(--app-surface-hover)] text-[var(--app-text-secondary)]'
            )}
          >
            {getIcon()}
          </div>
          <span
            className={cn(
              'flex items-center gap-1.5 font-bold tracking-tight',
              depth === 0 ? 'text-[11px] uppercase' : 'text-[10px]'
            )}
          >
            <span>{node.name}</span>
            {node.currency_code && node.currency_code !== 'SAR' && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {node.currency_code}
              </span>
            )}
          </span>
        </div>

        <div className="flex flex-col items-end pe-2 text-start">
          <span
            dir="ltr"
            className={cn(
              'font-mono font-bold',
              isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-[var(--app-text)]',
              depth === 0 ? 'text-sm' : 'text-xs'
            )}
          >
            {!hasChildren &&
            node.currency_code &&
            node.currency_code !== 'SAR' &&
            node.foreign_balance !== undefined
              ? formatCurrency(node.foreign_balance, node.currency_code)
              : formatCurrency(node.balance, 'SAR')}
          </span>
          {!hasChildren && node.currency_code && node.currency_code !== 'SAR' && (
            <span dir="ltr" className="text-muted-foreground font-mono text-[10px] opacity-75">
              ≈ {formatCurrency(node.balance, 'SAR')}
            </span>
          )}
        </div>

        {isSelected && <div className="absolute bottom-0 end-0 top-0 w-1 bg-blue-500" />}
      </button>

      {hasChildren && isExpanded && (
        <div className="me-4 border-s-2 border-[var(--app-border)]">
          {node.children.map((child: AccountNode) => (
            <SidebarItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </Fragment>
  );
};

const TreasurySidebar: React.FC<Props> = ({ onSelectAccount, selectedAccountId }) => {
  const { data: accounts, isLoading } = useAccounts();
  const { data: cashboxes } = useCashboxes();
  const { data: exchanges } = useExchangeCompanies();
  const { migrateCashboxBalances, isMigratingCashbox } = useAccountMutations();
  const [treasuryModalType, setTreasuryModalType] = useState<'cashbox' | 'exchange' | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const linkedAccountIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of cashboxes || []) {
      if (c.account_id) ids.add(c.account_id);
    }
    for (const e of exchanges || []) {
      if (e.account_id) ids.add(e.account_id);
    }
    return ids;
  }, [cashboxes, exchanges]);

  // Auto-expand all parent categories by default
  React.useEffect(() => {
    if (accounts && accounts.length > 0) {
      setExpandedIds(prev => {
        if (prev.size > 0) return prev;
        const parentIds = new Set(
          accounts.filter(a => accounts.some(c => c.parent_id === a.id)).map(a => a.id)
        );
        return parentIds;
      });
    }
  }, [accounts]);

  const treasuryAccounts = useMemo(() => {
    if (!accounts || accounts.length === 0) return [];
    const byId = new Map(accounts.map(acc => [acc.id, acc]));
    const matchedIds = new Set<string>();
    const EXCLUDED_ROOTS = new Set(['1', '1000', 'MZ-1']);

    for (const acc of accounts) {
      if (isTreasuryAccount(acc, linkedAccountIds, acc.id)) {
        matchedIds.add(acc.id);
        let parentId = acc.parent_id;
        while (parentId) {
          const parent = byId.get(parentId);
          if (!parent || EXCLUDED_ROOTS.has(parent.code.trim().toUpperCase())) break;
          matchedIds.add(parent.id);
          parentId = parent.parent_id;
        }
      }
    }

    return accounts
      .filter(acc => matchedIds.has(acc.id))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [accounts, linkedAccountIds]);

  const treasuryTree = useMemo(() => {
    // Build Map
    const map = new Map<string, AccountNode>();
    treasuryAccounts.forEach(acc => map.set(acc.id, { ...acc, children: [] }));

    // Build Tree
    const roots: AccountNode[] = [];
    treasuryAccounts.forEach(acc => {
      if (acc.parent_id && map.has(acc.parent_id)) {
        map.get(acc.parent_id)!.children.push(map.get(acc.id)!);
      } else {
        // If no parent_id OR parent_id exists but parent is not in our filtered map (e.g. 1000)
        // Treat as Root
        roots.push(map.get(acc.id)!);
      }
    });

    // Calculate Totals Recursively
    const calculateTotal = (node: AccountNode): number => {
      if (node.children.length > 0) {
        const childrenSum = node.children.reduce(
          (sum: number, child: AccountNode) => sum + calculateTotal(child),
          0
        );
        node.balance = childrenSum + (Number(node.balance) || 0);
        return node.balance;
      }
      return Number(node.balance) || 0;
    };

    // Sort deterministically across numeric and Mizan alphanumeric codes (e.g. MZ-1301)
    const sortNodes = (nodes: AccountNode[]) => {
      nodes.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      nodes.forEach(n => {
        if (n.children.length > 0) sortNodes(n.children);
      });
    };

    roots.forEach(calculateTotal);
    sortNodes(roots);
    return roots;
  }, [treasuryAccounts]);

  const hasSubCashboxes = useMemo(() => {
    // Check if sub cashbox (101001) exists
    return accounts?.some(acc => acc.code === '101001');
  }, [accounts]);

  const needsMigration = useMemo(() => {
    // We need migration if the main cashbox (1010) has a non-zero balance BUT it has children (101001)
    const main = accounts?.find(a => a.code === '1010');
    return hasSubCashboxes && main && Number(main.balance) > 0;
  }, [accounts, hasSubCashboxes]);

  const totalLiquidity = useMemo(() => {
    return treasuryTree.reduce((sum, node) => sum + (Number(node.balance) || 0), 0);
  }, [treasuryTree]);

  const currencyBreakdown = useMemo<Array<{ code: string; amount: number }>>(() => {
    if (!accounts || accounts.length === 0 || treasuryAccounts.length === 0) {
      return [{ code: 'SAR', amount: 0 }];
    }
    const parentIds = new Set(accounts.map(a => a.parent_id).filter(Boolean));
    const leaves = treasuryAccounts.filter(a => !parentIds.has(a.id));

    const totals = new Map<string, number>();
    for (const acc of leaves) {
      const code = (acc.currency_code || 'SAR').toUpperCase();
      const amt =
        code === 'SAR'
          ? Number(acc.balance) || 0
          : Number(acc.foreign_balance ?? acc.balance) || 0;
      totals.set(code, (totals.get(code) ?? 0) + amt);
    }

    const entries = Array.from(totals.entries())
      .filter(([code, amount]) => code === 'SAR' || Math.abs(amount) > 0.001)
      .map(([code, amount]) => ({ code, amount }));

    return entries.length > 0 ? entries : [{ code: 'SAR', amount: 0 }];
  }, [accounts, treasuryAccounts]);

  const toggleExpand = (id: string): void => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  if (isLoading)
    return (
      <div className="p-10 text-center max-md:p-5">
        <Loader2 className="animate-spin text-blue-500" />
      </div>
    );

  return (
    <div className="flex h-full flex-col border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm">
      <div className="shrink-0 border-b border-[var(--app-border)] bg-slate-900 p-3 text-white max-md:p-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-50">
            إجمالي السيولة المتاحة (معادل SAR)
          </p>
        </div>
        <h3
          dir="ltr"
          className="font-mono text-xl font-bold tracking-tight text-emerald-400 max-md:text-base"
        >
          {formatCurrency(totalLiquidity, 'SAR')}
        </h3>

        {/* Currency breakdown summary for quick physical cash verification */}
        {accounts && accounts.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-800/80 pt-2 font-mono text-[10px]">
            {currencyBreakdown.map(({ code, amount }) => (
              <span
                key={code}
                className={cn(
                  'rounded bg-slate-800 px-2 py-0.5 font-bold',
                  code === 'SAR' ? 'text-amber-300' : 'text-emerald-300'
                )}
              >
                {code}: {formatCurrency(amount, code)}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {treasuryTree.map(node => (
          <SidebarItem
            key={node.id}
            node={node}
            onSelect={onSelectAccount}
            selectedId={selectedAccountId}
            expandedIds={expandedIds}
            onToggle={toggleExpand}
          />
        ))}
      </div>

      <div className="shrink-0 space-y-1 border-t border-[var(--app-border)] bg-[var(--app-surface-hover)] p-2 max-md:p-1.5">
        <div className="grid grid-cols-2 gap-1 max-md:gap-0.5">
          <Button
            onClick={() => {
              setTreasuryModalType('cashbox');
            }}
            variant="secondary"
            size="sm"
            className="w-full"
            leftIcon={<Wallet size={12} />}
          >
            صندوق جديد
          </Button>
          <Button
            onClick={() => {
              setTreasuryModalType('exchange');
            }}
            variant="secondary"
            size="sm"
            className="w-full"
            leftIcon={<Building2 size={12} />}
          >
            شركة صرافة
          </Button>
        </div>
        {needsMigration && (
          <Button
            onClick={() => {
              migrateCashboxBalances();
            }}
            isLoading={isMigratingCashbox}
            variant="outline"
            size="sm"
            className="w-full border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-900/40"
            leftIcon={<Landmark size={12} />}
          >
            تسوية رصيد الكاش القديم للسعودي
          </Button>
        )}
      </div>

      {treasuryModalType && (
        <AddTreasuryEntityModal
          type={treasuryModalType}
          onClose={() => {
            setTreasuryModalType(null);
          }}
        />
      )}
    </div>
  );
};

export default TreasurySidebar;
