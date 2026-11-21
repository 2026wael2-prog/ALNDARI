/* eslint-disable max-lines-per-function, complexity -- شجرة دليل الحسابات مع شريط البحث والفلترة وأعمدة المدين والدائن */
import React, { useState, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  Plus,
  ShieldCheck,
  Loader2,
  Trash2,
  ChevronRight,
  Lock,
  FileText,
  Scale,
  Search,
  ChevronsDownUp,
  ChevronsUpDown,
  Archive,
  Filter,
} from 'lucide-react';
import { useAccounts, useAccountMutations } from '../../hooks/index';
import { useAuthStore } from '../../../auth/store';
import { formatCurrency, cn } from '../../../../core/utils';
import AddAccountModal from './AddAccountModal';
import OpeningBalancesModal from './OpeningBalancesModal';
import EmptyState from '../../../../ui/base/EmptyState';
import Button from '../../../../ui/base/Button';
import type { AccountFormData, AccountType } from '../../types/index';
import { useFeedbackStore } from '../../../../features/feedback/store';
import { ConfirmModal } from '../../../../ui/base/ConfirmModal';
import { CustomizableTableWrapper } from '@/ui/table-settings/TableSettingsButton';
import {
  buildAccountTree,
  filterAccountTree,
  collectExpandableIds,
  countTreeNodes,
  type AccountNode,
} from '../../utils/accountTree';

// ==========================================
// 1. Recursive Row Rendering Component
// ==========================================
const AccountTreeRow: React.FC<{
  node: AccountNode;
  level: number;
  onToggle: (id: string) => void;
  expandedIds: Set<string>;
  canDeleteAccounts: boolean;
  onDelete: (id: string, isSystem: boolean) => void;
}> = ({ node, level, onToggle, expandedIds, canDeleteAccounts, onDelete }) => {
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
        {/* Account Name & Hierarchy Controls */}
        <td className="border-b border-[var(--app-border)] p-2">
          <div
            className="flex items-center gap-1"
            style={{ paddingInlineStart: `${level * 1.5}rem` }}
          >
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
                'ms-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold',
                isParent
                  ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  : 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
              )}
            >
              {isParent ? 'تجميعي' : 'تحليلي'}
            </span>
          </div>
        </td>
        {/* Code */}
        <td
          dir="ltr"
          className="border-b border-[var(--app-border)] p-2 font-mono text-[11px] font-bold text-[var(--app-text)]"
        >
          {node.code}
        </td>
        {/* Type */}
        <td className="border-b border-[var(--app-border)] p-2">
          <span className={`border px-2 py-0.5 text-[10px] font-bold ${getTypeColor(node.type)}`}>
            {getTypeLabel(node.type)}
          </span>
        </td>
        {/* Rolled Debit */}
        <td
          dir="ltr"
          className="hidden border-b border-[var(--app-border)] p-2 text-start font-mono text-[11px] text-[var(--app-text-secondary)] lg:table-cell"
        >
          {node.rolled_debit > 0 ? formatCurrency(node.rolled_debit) : '—'}
        </td>
        {/* Rolled Credit */}
        <td
          dir="ltr"
          className="hidden border-b border-[var(--app-border)] p-2 text-start font-mono text-[11px] text-[var(--app-text-secondary)] lg:table-cell"
        >
          {node.rolled_credit > 0 ? formatCurrency(node.rolled_credit) : '—'}
        </td>
        {/* Net Normalized Balance */}
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
        {/* Actions */}
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

// ==========================================
// 2. Main AccountsTable Component
// ==========================================
const AccountsTable: React.FC = () => {
  const { user } = useAuthStore();
  const { data: accounts, isLoading } = useAccounts();
  const { seedAccounts, isSeeding, deleteAccount, createAccount, isCreating } =
    useAccountMutations();
  const { showToast } = useFeedbackStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOpeningBalanceModalOpen, setIsOpeningBalanceModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountType | 'all'>('all');
  const [hideZeroBalances, setHideZeroBalances] = useState(false);
  const [hideLegacyArchive, setHideLegacyArchive] = useState(false);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; isSystem: boolean } | null>(
    null
  );

  const canDeleteAccounts = user?.role === 'owner' || user?.role === 'admin';
  const hasLegacyArchive = useMemo(
    () => (accounts ?? []).some(a => a.code.startsWith('MZ-')),
    [accounts]
  );

  const fullAccountTree = useMemo(() => {
    if (!accounts) return [];
    return buildAccountTree(accounts);
  }, [accounts]);

  const accountTree = useMemo(
    () =>
      filterAccountTree(fullAccountTree, {
        query: searchQuery,
        typeFilter,
        hideZeroBalances,
        hideLegacyArchive,
      }),
    [fullAccountTree, searchQuery, typeFilter, hideZeroBalances, hideLegacyArchive]
  );

  const visibleCount = useMemo(() => countTreeNodes(accountTree), [accountTree]);

  // عند البحث أو التصفية، افتح العقد المطابقة تلقائياً لإظهار النتائج فوراً
  const effectiveExpandedIds = useMemo(() => {
    if (searchQuery.trim() !== '') {
      return collectExpandableIds(accountTree);
    }
    return expandedNodes;
  }, [searchQuery, accountTree, expandedNodes]);

  const toggleNode = (id: string): void => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handleExpandAll = (): void => {
    setExpandedNodes(collectExpandableIds(accountTree));
  };

  const handleCollapseAll = (): void => {
    setExpandedNodes(new Set());
  };

  const handleAddNew = (): void => {
    setIsModalOpen(true);
  };

  const handleCreate = (data: AccountFormData): void => {
    createAccount(data, {
      onSuccess: () => {
        setIsModalOpen(false);
      },
    });
  };

  const handleDelete = (id: string, isSystem: boolean): void => {
    if (isSystem) {
      showToast('لا يمكن حذف حساب نظام', 'warning');
      return;
    }
    setDeleteConfirm({ id, isSystem });
  };

  const confirmDelete = (): void => {
    if (deleteConfirm) {
      deleteAccount(
        { id: deleteConfirm.id, isSystem: deleteConfirm.isSystem },
        {
          onSuccess: () => {
            setDeleteConfirm(null);
          },
        }
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm">
        <Loader2 className="animate-spin text-[var(--accent)]" size={32} />
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <>
        <EmptyState
          icon={Layers}
          title="لا توجد حسابات مضافة"
          description="لم يتم إعداد شجرة الحسابات بعد. يمكنك البدء بإضافة حسابات يدوياً أو إنشاء الدليل المحاسبي القياسي الموصى به."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => {
                  seedAccounts();
                }}
                disabled={isSeeding}
                variant="success"
                isLoading={isSeeding}
                leftIcon={<ShieldCheck size={16} />}
              >
                إنشاء الدليل القياسي
              </Button>
              <Button onClick={handleAddNew} variant="secondary" leftIcon={<Plus size={16} />}>
                إضافة حساب يدوياً
              </Button>
            </div>
          }
        />
        <AddAccountModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
          }}
          onSubmit={handleCreate}
          isSubmitting={isCreating}
          accounts={accounts}
        />
      </>
    );
  }

  return (
    <div className="space-y-2 transition-colors duration-300">
      {/* Toolbar: Search, Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
              }}
              placeholder="بحث بالرمز أو اسم الحساب..."
              className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] py-1.5 pl-3 pr-8 text-xs text-[var(--app-text)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Account Type Filter */}
          <div className="flex items-center gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1">
            <Filter size={12} className="text-[var(--app-text-secondary)]" />
            <select
              value={typeFilter}
              onChange={e => {
                setTypeFilter(e.target.value as AccountType | 'all');
              }}
              className="bg-transparent text-xs font-bold text-[var(--app-text)] outline-none"
              aria-label="تصفية حسب نوع الحساب"
            >
              <option value="all">كل الأنواع</option>
              <option value="asset">أصول</option>
              <option value="liability">خصوم</option>
              <option value="equity">حقوق ملكية</option>
              <option value="revenue">إيرادات</option>
              <option value="expense">مصروفات</option>
            </select>
          </div>

          {/* Hide Zero Balances */}
          <button
            type="button"
            onClick={() => {
              setHideZeroBalances(prev => !prev);
            }}
            className={cn(
              'rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors',
              hideZeroBalances
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                : 'border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
            )}
          >
            ذات حركة فقط
          </button>

          {/* Toggle Legacy MZ Archive */}
          {hasLegacyArchive && (
            <button
              type="button"
              onClick={() => {
                setHideLegacyArchive(prev => !prev);
              }}
              className={cn(
                'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors',
                hideLegacyArchive
                  ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
              )}
              title="إخفاء أو إظهار حسابات أرشيف الميزان (MZ-*)"
            >
              <Archive size={12} />
              <span>{hideLegacyArchive ? 'إظهار أرشيف الميزان' : 'إخفاء أرشيف الميزان'}</span>
            </button>
          )}

          {/* Expand / Collapse */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleExpandAll}
              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-1.5 text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
              title="توسيع الكل"
            >
              <ChevronsUpDown size={13} />
            </button>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-1.5 text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
              title="طي الكل"
            >
              <ChevronsDownUp size={13} />
            </button>
          </div>

          <span className="rounded-md bg-[var(--app-surface-hover)] px-2 py-1 font-mono text-[10px] font-bold text-[var(--app-text-secondary)]">
            {visibleCount.toLocaleString()} / {accounts.length.toLocaleString()} حساب
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setIsOpeningBalanceModalOpen(true);
            }}
            variant="secondary"
            size="sm"
            leftIcon={<Scale size={12} />}
          >
            أرصدة افتتاحية
          </Button>
          <Button onClick={handleAddNew} variant="primary" size="sm" leftIcon={<Plus size={12} />}>
            حساب جديد
          </Button>
        </div>
      </div>

      <CustomizableTableWrapper tableId="accounting.accounts" tableTitle="شجرة الحسابات">
        <div className="overflow-x-auto border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm">
          <table className="w-full">
            <thead className="border-b-2 border-[var(--app-border)] bg-[var(--app-surface-hover)]">
              <tr className="text-[10px] font-bold uppercase text-[var(--app-text-secondary)]">
                <th className="p-2.5 text-start">اسم الحساب</th>
                <th className="w-32 p-2.5 text-start">الرمز</th>
                <th className="w-28 p-2.5 text-start">النوع</th>
                <th className="hidden w-36 p-2.5 text-end lg:table-cell">إجمالي المدين</th>
                <th className="hidden w-36 p-2.5 text-end lg:table-cell">إجمالي الدائن</th>
                <th className="w-44 p-2.5 text-end">الرصيد الإجمالي</th>
                <th className="w-24 p-2.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {accountTree.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-8 text-center text-xs font-bold text-[var(--app-text-secondary)]"
                  >
                    لا توجد حسابات مطابقة لمعايير البحث والتصفية الحالية
                  </td>
                </tr>
              ) : (
                accountTree.map(node => (
                  <AccountTreeRow
                    key={node.id}
                    node={node}
                    level={0}
                    onToggle={toggleNode}
                    expandedIds={effectiveExpandedIds}
                    canDeleteAccounts={canDeleteAccounts}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </CustomizableTableWrapper>

      <AddAccountModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
        }}
        onSubmit={handleCreate}
        isSubmitting={isCreating}
        accounts={accounts}
      />

      <OpeningBalancesModal
        isOpen={isOpeningBalanceModalOpen}
        onClose={() => {
          setIsOpeningBalanceModalOpen(false);
        }}
      />

      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => {
          setDeleteConfirm(null);
        }}
        onConfirm={confirmDelete}
        title="حذف حساب محاسبي"
        message="سيتم حذف الحساب منطقياً من دليل الحسابات (يرفض النظام الحذف تلقائياً إذا كان الحساب نظامياً أو يحتوي على قيود مرحَّلة أو حسابات فرعية). هل تريد الاستمرار؟"
        variant="danger"
        confirmLabel="نعم، حذف الحساب"
      />
    </div>
  );
};

// ==========================================
// 3. Helper Functions for Styling
// ==========================================
function getTypeLabel(type: string): string {
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

function getTypeColor(type: string): string {
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

export default AccountsTable;
