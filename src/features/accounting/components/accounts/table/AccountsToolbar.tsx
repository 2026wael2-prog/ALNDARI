import React from 'react';
import {
  Archive,
  ChevronsDownUp,
  ChevronsUpDown,
  Filter,
  Plus,
  Scale,
  Search,
} from 'lucide-react';
import { cn } from '../../../../../core/utils';
import Button from '../../../../../ui/base/Button';
import type { AccountType } from '../../../types/index';

interface AccountsToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  typeFilter: AccountType | 'all';
  onTypeFilterChange: (value: AccountType | 'all') => void;
  hideZeroBalances: boolean;
  onToggleHideZeroBalances: () => void;
  hasLegacyArchive: boolean;
  hideLegacyArchive: boolean;
  onToggleHideLegacyArchive: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  visibleCount: number;
  totalCount: number;
  onOpenOpeningBalances: () => void;
  onAddNew: () => void;
}

export const AccountsToolbar: React.FC<AccountsToolbarProps> = ({
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  hideZeroBalances,
  onToggleHideZeroBalances,
  hasLegacyArchive,
  hideLegacyArchive,
  onToggleHideLegacyArchive,
  onExpandAll,
  onCollapseAll,
  visibleCount,
  totalCount,
  onOpenOpeningBalances,
  onAddNew,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-xs">
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] max-w-xs flex-1">
        <Search
          size={13}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)]"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={e => {
            onSearchChange(e.target.value);
          }}
          placeholder="بحث بالرمز أو اسم الحساب..."
          className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] py-1.5 pl-3 pr-8 text-xs text-[var(--app-text)] outline-none focus:border-[var(--accent)]"
        />
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1">
        <Filter size={12} className="text-[var(--app-text-secondary)]" />
        <select
          value={typeFilter}
          onChange={e => {
            onTypeFilterChange(e.target.value as AccountType | 'all');
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

      <button
        type="button"
        onClick={onToggleHideZeroBalances}
        className={cn(
          'rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors',
          hideZeroBalances
            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
            : 'border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
        )}
      >
        ذات حركة فقط
      </button>

      {hasLegacyArchive && (
        <button
          type="button"
          onClick={onToggleHideLegacyArchive}
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

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onExpandAll}
          className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-1.5 text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
          title="توسيع الكل"
        >
          <ChevronsUpDown size={13} />
        </button>
        <button
          type="button"
          onClick={onCollapseAll}
          className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-1.5 text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
          title="طي الكل"
        >
          <ChevronsDownUp size={13} />
        </button>
      </div>

      <span className="rounded-md bg-[var(--app-surface-hover)] px-2 py-1 font-mono text-[10px] font-bold text-[var(--app-text-secondary)]">
        {visibleCount.toLocaleString()} / {totalCount.toLocaleString()} حساب
      </span>
    </div>

    <div className="flex items-center gap-2">
      <Button
        onClick={onOpenOpeningBalances}
        variant="secondary"
        size="sm"
        leftIcon={<Scale size={12} />}
      >
        أرصدة افتتاحية
      </Button>
      <Button onClick={onAddNew} variant="primary" size="sm" leftIcon={<Plus size={12} />}>
        حساب جديد
      </Button>
    </div>
  </div>
);
