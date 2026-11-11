/**
 * FollowUpExcelGrid — جدول الديون والتحصيل كشبكة إكسل معيارية (ExcelTable).
 *
 * يدعم تخصيص الأعمدة الكامل (إظهار وإلغاء أي عمود عبر نافذة الإعدادات)،
 * مع أعمدة مخصصة للعملة الأساسية، المسؤول عن التحصيل، والديون الحرجة.
 */
import React, { useMemo, useState } from 'react';
import { SlidersHorizontal, Eye } from 'lucide-react';
import ExcelTable, { type Column } from '../../../ui/common/ExcelTable';
import { useCompany, useCurrencies } from '../../settings/hooks';
import { useDebtCollectorAssignments } from '../hooks/useDebtQueries';
import {
  formatCurrency,
  toBaseCurrency,
  resolveAutoExchangeRate,
} from '../../../core/utils/currencyUtils';
import {
  ActionsCell,
  BaseCurrencyCell,
  CollectorCell,
  CriticalCell,
  EscalationCell,
  MoneyCell,
  PartyCell,
  PromiseCell,
  ReminderWithDateCell,
  ShortCell,
  StatusWithDaysCell,
} from './FollowUpExcelGridCells';
import {
  ColumnSettingsModal,
  DEFAULT_COLUMNS,
  ALL_COLUMNS,
} from './ColumnSettingsModal';
import { currencyCount, debtRowId, totalsLabel } from '../lib/currencyTotals';
import type { DebtRowActionHandlers } from '../lib/rowActions';
import type { FollowUpDashboardRow } from '../types';

type DebtRow = FollowUpDashboardRow;

interface FollowUpExcelGridProps {
  rows: FollowUpDashboardRow[];
  isLoading?: boolean;
  handlers: DebtRowActionHandlers;
}

const STORAGE_KEY = 'debts_followup_visible_columns';

export const FollowUpExcelGrid: React.FC<FollowUpExcelGridProps> = ({
  rows,
  isLoading = false,
  handlers,
}) => {
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set<string>());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 1. الشركة والعملات الأساسية وأسعار الصرف
  const { data: company } = useCompany();
  const { currencies, rates } = useCurrencies();
  const companyCurrency = company?.base_currency;
  const baseCurrency = companyCurrency !== undefined && companyCurrency !== '' ? companyCurrency : 'SAR';

  // 2. إسنادات المحصلين للعملاء
  const { data: collectorAssignments } = useDebtCollectorAssignments();

  // 3. الأعمدة المرئية المخزنة
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return DEFAULT_COLUMNS;
  });

  const handleSaveColumns = (newCols: string[]) => {
    setVisibleColumns(newCols);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newCols));
    } catch {
      // ignore
    }
  };

  const handleResetDefaults = () => {
    handleSaveColumns(DEFAULT_COLUMNS);
  };

  const currencyList = currencies?.data as
    | Array<{ code: string; exchange_operator?: 'multiply' | 'divide' }>
    | undefined;

  // 4. حساب الإجمالي الكلي المحول للعملة الأساسية
  const totalInBaseCurrency = useMemo(() => {
    return rows.reduce((sum, row) => {
      if (!row.currency_code || row.currency_code.toUpperCase() === baseCurrency.toUpperCase()) {
        return sum + (row.outstanding_balance || 0);
      }
      const rate = resolveAutoExchangeRate(row.currency_code, rates?.data, currencyList);
      try {
        const converted = toBaseCurrency({
          amount: row.outstanding_balance,
          currency_code: row.currency_code,
          exchange_rate: rate,
        });
        return sum + converted;
      } catch {
        return sum + (row.outstanding_balance || 0);
      }
    }, 0);
  }, [rows, baseCurrency, rates?.data, currencyList]);

  // 5. بناء الأعمدة ديناميكياً حسب اختيار المستخدم
  const columns = useMemo(() => {
    const isVisible = (id: string) => visibleColumns.includes(id);
    const cols: Array<Column<DebtRow>> = [];

    // العميل (دائماً أول عمود)
    if (isVisible('party')) {
      cols.push({
        header: 'العميل',
        accessor: row => <PartyCell row={row} />,
        sortKey: 'party_name',
        width: 'w-52',
        align: 'right',
      });
    }

    // الرصيد المستحق (بالعملة الأصلية)
    if (isVisible('outstanding_balance')) {
      cols.push({
        header: 'الرصيد المستحق',
        accessor: row => <MoneyCell row={row} />,
        sortKey: 'outstanding_balance',
        width: 'w-36',
        align: 'left',
        className: 'font-mono',
        footer: () => totalsLabel(rows),
      });
    }

    // المعادل بالعملة الأساسية
    if (isVisible('base_balance')) {
      cols.push({
        header: `المعادل (${baseCurrency})`,
        accessor: row => (
          <BaseCurrencyCell
            row={row}
            baseCurrency={baseCurrency}
            rates={rates?.data}
            currencies={currencyList}
          />
        ),
        sortKey: 'outstanding_balance',
        width: 'w-36',
        align: 'left',
        className: 'font-mono',
        footer: () => (rows.length === 0 ? '' : formatCurrency(totalInBaseCurrency, baseCurrency)),
      });
    }

    // الديون الحرجة
    if (isVisible('critical')) {
      cols.push({
        header: 'الديون الحرجة',
        accessor: row => <CriticalCell row={row} />,
        sortKey: 'has_broken_promise',
        width: 'w-28',
        align: 'center',
      });
    }

    // المسؤول عن المتابعة
    if (isVisible('collector')) {
      cols.push({
        header: 'المسؤول',
        accessor: row => (
          <CollectorCell
            partyId={row.party_id}
            {...(collectorAssignments ? { assignments: collectorAssignments } : {})}
          />
        ),
        width: 'w-32',
        align: 'center',
      });
    }

    // الحالة وأيام التأخير
    if (isVisible('status_days')) {
      cols.push({
        header: 'الحالة والتأخير',
        accessor: row => <StatusWithDaysCell row={row} />,
        sortKey: 'days_overdue',
        width: 'w-36',
        align: 'center',
        footer: () => (rows.length === 0 ? '' : `عدد: ${String(rows.length)}`),
      });
    }

    // المتابعة والتذكير
    if (isVisible('reminder')) {
      cols.push({
        header: 'المتابعة والتذكير',
        accessor: row => <ReminderWithDateCell row={row} />,
        sortKey: 'reminder_status',
        width: 'w-32',
        align: 'center',
      });
    }

    // وعد السداد
    if (isVisible('promise')) {
      cols.push({
        header: 'وعد السداد',
        accessor: row => <PromiseCell row={row} />,
        sortKey: 'pending_promise_date',
        width: 'w-32',
        align: 'center',
      });
    }

    // أقدم استحقاق
    if (isVisible('oldest_due_date')) {
      cols.push({
        header: 'أقدم استحقاق',
        accessor: row => <ShortCell value={row.oldest_due_date} />,
        sortKey: 'oldest_due_date',
        width: 'w-24',
        align: 'center',
      });
    }

    // آخر تواصل
    if (isVisible('last_contact_date')) {
      cols.push({
        header: 'آخر تواصل',
        accessor: row => <ShortCell value={row.last_contact_date} />,
        sortKey: 'last_contact_date',
        width: 'w-24',
        align: 'center',
      });
    }

    // مرحلة التصعيد
    if (isVisible('escalation_stage')) {
      cols.push({
        header: 'مرحلة التصعيد',
        accessor: row => <EscalationCell stage={row.escalation_stage} />,
        sortKey: 'escalation_stage',
        width: 'w-24',
        align: 'center',
      });
    }

    // الإجراءات والتحصيل (دائماً آخر عمود)
    if (isVisible('actions')) {
      cols.push({
        header: 'الإجراءات والتحصيل',
        accessor: row => <ActionsCell row={row} handlers={handlers} />,
        width: 'w-44',
        align: 'center',
      });
    }

    return cols;
  }, [visibleColumns, rows, baseCurrency, rates?.data, currencies?.data, collectorAssignments, totalInBaseCurrency, handlers]);

  const selectedRows = useMemo(
    () => rows.filter(row => selectedRowIds.has(debtRowId(row))),
    [rows, selectedRowIds]
  );
  const gridCurrencies = useMemo(() => currencyCount(rows), [rows]);

  return (
    <div className="hidden flex-col gap-2 md:flex print:flex">
      {/* شريط الإجراءات والتحكم بالأعمدة */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold text-[var(--app-text)]">
            جدول متابعة وتحصيل الديون
          </span>
          <span className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--app-text-muted)]">
            {rows.length} مدين
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-bold text-[var(--app-text)] shadow-xs transition hover:border-blue-500/40 hover:bg-[var(--app-surface-hover)]"
          title="تخصيص الأعمدة المعروضة (إظهار وإلغاء أعمدة)"
        >
          <SlidersHorizontal size={13} className="text-blue-500" />
          <span>تخصيص الأعمدة</span>
          <span className="rounded-md bg-blue-500/10 px-1.5 py-0.2 font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400">
            {columns.length} / {ALL_COLUMNS.length}
          </span>
        </button>
      </div>

      <div className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-xs">
        <ExcelTable
          columns={columns}
          data={rows}
          title="جدول الديون والتحصيل"
          resizeStorageKey="debts_followup_grid_custom"
          colorTheme="orange"
          isRTL
          showSearch={false}
          enableSelection
          enableResize
          enablePagination
          pageSize={25}
          isLoading={isLoading}
          emptyMessage="لا توجد سجلات في هذا التصنيف"
          getRowId={debtRowId}
          selectedRowIds={selectedRowIds}
          onSelectionChange={setSelectedRowIds}
          onRowDoubleClick={handlers.onTimeline}
        />
      </div>

      {/* شريط الحالة المالي السفلي */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-hover)] px-3 py-1.5 text-[11px] font-bold text-[var(--app-text-secondary)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            عدد السجلات: <span className="font-mono text-[var(--app-text)]">{rows.length}</span>
          </span>
          <span>
            المحدد: <span className="font-mono text-[var(--app-text)]">{selectedRows.length}</span>
          </span>
          <span className="flex items-center gap-1.5">
            مجموع المحدد:
            <span className="font-mono text-[var(--app-text)]" dir="ltr">
              {totalsLabel(selectedRows)}
            </span>
          </span>
          {currencies.data && (
            <span className="flex items-center gap-1 font-mono text-[var(--app-text)]" dir="ltr">
              المعادل الإجمالي: {formatCurrency(totalInBaseCurrency, baseCurrency)}
            </span>
          )}
          {gridCurrencies > 1 && (
            <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
              عملات متعددة
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline dark:text-blue-400"
        >
          <Eye size={12} />
          <span>تعديل الأعمدة المعروضة</span>
        </button>
      </div>

      {/* نافذة تخصيص الأعمدة */}
      <ColumnSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        visibleColumns={visibleColumns}
        onChangeColumns={handleSaveColumns}
        onResetDefaults={handleResetDefaults}
      />
    </div>
  );
};

export default FollowUpExcelGrid;
