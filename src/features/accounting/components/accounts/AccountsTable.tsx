import React, { useMemo, useState } from 'react';
import { Layers, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { useAccounts, useAccountMutations } from '../../hooks/index';
import { useAuthStore } from '../../../auth/store';
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
  collectExpandableIds,
  countTreeNodes,
  filterAccountTree,
} from '../../utils/accountTree';
import { AccountTreeRow } from './table/AccountTreeRow';
import { AccountsToolbar } from './table/AccountsToolbar';

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

  const fullAccountTree = useMemo(
    () => (accounts ? buildAccountTree(accounts) : []),
    [accounts]
  );

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

  const effectiveExpandedIds = useMemo(
    () => (searchQuery.trim() !== '' ? collectExpandableIds(accountTree) : expandedNodes),
    [searchQuery, accountTree, expandedNodes]
  );

  const toggleNode = (id: string): void => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    if (!deleteConfirm) return;
    deleteAccount(
      { id: deleteConfirm.id, isSystem: deleteConfirm.isSystem },
      {
        onSuccess: () => {
          setDeleteConfirm(null);
        },
      }
    );
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
              <Button
                onClick={() => {
                  setIsModalOpen(true);
                }}
                variant="secondary"
                leftIcon={<Plus size={16} />}
              >
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
      <AccountsToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        hideZeroBalances={hideZeroBalances}
        onToggleHideZeroBalances={() => {
          setHideZeroBalances(prev => !prev);
        }}
        hasLegacyArchive={hasLegacyArchive}
        hideLegacyArchive={hideLegacyArchive}
        onToggleHideLegacyArchive={() => {
          setHideLegacyArchive(prev => !prev);
        }}
        onExpandAll={() => {
          setExpandedNodes(collectExpandableIds(accountTree));
        }}
        onCollapseAll={() => {
          setExpandedNodes(new Set());
        }}
        visibleCount={visibleCount}
        totalCount={accounts.length}
        onOpenOpeningBalances={() => {
          setIsOpeningBalanceModalOpen(true);
        }}
        onAddNew={() => {
          setIsModalOpen(true);
        }}
      />

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

export default AccountsTable;
