import React, { Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileText, Lock, Trash2 } from 'lucide-react';
import { cn, formatCurrency } from '../../../../../core/utils';
import { EntityInfoDot } from '../../../../entity-inspector';
import type { AccountNode } from '../../../utils/accountTree';

export function getAccountTypeLabel(type: string): string {
  switch (type) {
    case 'asset':
      return 'أصول';
    case 'liability':
      return 'خصوم';
    case 'equity':
      return 'حقوق ملكية';
    case 'revenue':
      return 'إيرادات';
    case 'expense':
      return 'مصروفات';
    default:
      return type;
  }
}

export function getAccountTypeColor(type: string): string {
  switch (type) {
    case 'asset':
      return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900';
    case 'liability':
      return 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-900';
    case 'equity':
      return 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-900';
    case 'revenue':
      return 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900';
    case 'expense':
      return 'bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-400 border-orange-100 dark:border-orange-900';
    default:
      return 'bg-[var(--app-surface-hover)] text-[var(--app-text-secondary)]';
  }
}

interface AccountTreeRowProps {
  node: AccountNode;
  level: number;
  onToggle: (id: string) => void;
  expandedIds: Set<string>;
  canDeleteAccounts: boolean;
  onDelete: (id: string, isSystem: boolean) => void;
}

export const AccountTreeRow: React.FC<AccountTreeRowProps> = ({
  node,
  level,
  onToggle,
  expandedIds,
  canDeleteAccounts,
  onDelete,
}) => {
  const isExpanded = expandedIds.has(node.id);
  const navigate = useNavigate();
  const isParent = node.children.length > 0 || node.allow_posting === false;
  const canDeleteNode = canDeleteAccounts && !node.is_system && node.children.length === 0;

  return (
    <Fragment>
      <tr
        className={cn(
          'group transition-colors hover:bg-blue-50/20 dark:hover:bg-blue-950/20',
          isParent && level === 0 && 'bg-[var(--app-surface-hover)]/40'
        )}
      >
        <td className="border-b border-[var(--app-border)] p-2">
          <div className="flex items-center gap-1" style={{ paddingInlineStart: `${level * 1.5}rem` }}>
            {node.children.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  onToggle(node.id);
                }}
                className="rounded-full p-1 hover:bg-[var(--app-surface-hover)]"
                aria-label={isExpanded ? 'طي الحساب' : 'توسيع الحساب'}
              >
                <ChevronRight
                  size={14}
                  className={cn('transition-transform', isExpanded && 'rotate-90')}
                />
              </button>
            ) : (
              <span className="inline-block w-5 shrink-0" />
            )}
            {node.is_system && (
              <span title="حساب نظام محمي">
                <Lock size={12} className="ms-1 text-amber-500/80" />
              </span>
            )}
            <EntityInfoDot
              type="account"
              id={node.id}
              label={`${node.code} — ${node.name}`}
              size="xs"
              className="ms-1"
            />
            <span
              className={cn(
                'text-[11px] text-[var(--app-text)]',
                isParent ? 'font-black' : 'font-semibold'
              )}
            >
              {node.name}
            </span>
            <span
              className={cn(
                'ms-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold',
                isParent
                  ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  : 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
              )}
            >
              {isParent ? 'تجميعي' : 'تحليلي'}
            </span>
          </div>
        </td>
        <td
          dir="ltr"
          className="border-b border-[var(--app-border)] p-2 font-mono text-[11px] font-bold text-[var(--app-text)]"
        >
          {node.code}
        </td>
        <td className="border-b border-[var(--app-border)] p-2">
          <span
            className={`border px-2 py-0.5 text-[10px] font-bold ${getAccountTypeColor(node.type)}`}
          >
            {getAccountTypeLabel(node.type)}
          </span>
        </td>
        <td
          dir="ltr"
          className="hidden border-b border-[var(--app-border)] p-2 text-start font-mono text-[11px] text-[var(--app-text-secondary)] lg:table-cell"
        >
          {node.rolled_debit > 0 ? formatCurrency(node.rolled_debit) : '—'}
        </td>
        <td
          dir="ltr"
          className="hidden border-b border-[var(--app-border)] p-2 text-start font-mono text-[11px] text-[var(--app-text-secondary)] lg:table-cell"
        >
          {node.rolled_credit > 0 ? formatCurrency(node.rolled_credit) : '—'}
        </td>
        <td
          dir="ltr"
          className={`border-b border-[var(--app-border)] p-2 text-start font-mono text-[11px] font-bold ${
            node.balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--app-text)]'
          }`}
        >
          <div>
            {node.children.length === 0 &&
            node.currency_code &&
            node.currency_code !== 'SAR' &&
            node.foreign_balance !== undefined
              ? formatCurrency(node.foreign_balance, node.currency_code)
              : formatCurrency(node.balance || 0)}
          </div>
          {node.children.length === 0 && node.currency_code && node.currency_code !== 'SAR' && (
            <div className="text-muted-foreground font-mono text-[10px] opacity-75">
              ≈ {formatCurrency(node.balance || 0, 'SAR')}
            </div>
          )}
        </td>
        <td className="border-b border-[var(--app-border)] p-2 text-center">
          <div className="flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
            <button
              type="button"
              onClick={() => {
                navigate(`/accounting?tab=ledger&accountId=${encodeURIComponent(node.id)}`);
              }}
              className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              title="عرض كشف الحساب"
            >
              <FileText size={12} />
            </button>
            {canDeleteNode && (
              <button
                type="button"
                onClick={() => {
                  onDelete(node.id, node.is_system);
                }}
                className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                title="حذف الحساب"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </td>
      </tr>
      {isExpanded &&
        node.children.map((child: AccountNode) => (
          <AccountTreeRow
            key={child.id}
            node={child}
            level={level + 1}
            onToggle={onToggle}
            expandedIds={expandedIds}
            canDeleteAccounts={canDeleteAccounts}
            onDelete={onDelete}
          />
        ))}
    </Fragment>
  );
};
