import React from 'react';
import { FileSpreadsheet, Printer, Calendar, Filter } from 'lucide-react';
import type { FilterState, DateRange, ReturnsType } from '../../hooks/useReturnsReport';

interface Props {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  handleExportExcel: () => void;
  handlePrint: () => void;
}

const ReturnsFilterBar: React.FC<Props> = ({
  filters,
  setFilters,
  handleExportExcel,
  handlePrint,
}) => {
  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-sm sm:rounded-xl sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2 sm:mb-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 sm:mb-0.5 sm:gap-2">
            <div className="h-3.5 w-1 rounded-full bg-rose-500 sm:h-4 sm:w-1.5" />
            <h3 className="truncate text-xs font-bold tracking-tight text-slate-800 dark:text-white sm:text-base">
              تحليل المرتجعات
            </h3>
          </div>
          <p className="hidden text-[10px] font-semibold text-slate-400 sm:block">
            تصفية حركات مرتجعات المبيعات والمشتريات
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            onClick={handleExportExcel}
            className="flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2 text-[10px] font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 sm:h-9 sm:gap-1.5 sm:px-3 sm:text-xs"
          >
            <FileSpreadsheet size={13} />
            <span>إكسل</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex h-7 items-center gap-1 rounded-lg bg-slate-100 px-2 text-[10px] font-bold text-slate-700 transition-all hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:h-9 sm:gap-1.5 sm:px-3 sm:text-xs"
          >
            <Printer size={13} />
            <span>طباعة</span>
          </button>
        </div>
      </div>

      {/* Filter Grid — 4 filters in 1 single bar on mobile! */}
      <div className="grid grid-cols-4 gap-1 sm:gap-2.5">
        {/* Period Filter */}
        <div className="min-w-0">
          <label className="mb-0.5 hidden truncate text-[10px] font-bold text-slate-400 sm:block">النطاق الزمني</label>
          <div className="relative">
            <Calendar
              size={12}
              className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 text-slate-400 sm:block"
            />
            <select
              value={filters.dateRange}
              onChange={e => {
                setFilters({ ...filters, dateRange: e.target.value as DateRange });
              }}
              aria-label="النطاق الزمني"
              className="h-7 w-full appearance-none rounded-md border border-[var(--app-border)] bg-[var(--app-surface-hover)] px-1.5 text-[10px] font-bold outline-none transition-colors focus:border-rose-500 dark:text-white sm:h-9 sm:rounded-lg sm:pl-3 sm:pr-7 sm:text-xs"
            >
              <option value="today">اليوم</option>
              <option value="week">7 أيام</option>
              <option value="month">30 يوم</option>
              <option value="year">السنة</option>
              <option value="custom">مخصص</option>
            </select>
          </div>
        </div>

        {/* Flow Type Filter */}
        <div className="min-w-0">
          <label className="mb-0.5 hidden truncate text-[10px] font-bold text-slate-400 sm:block">نوع التدفق</label>
          <div className="relative">
            <Filter
              size={12}
              className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 text-slate-400 sm:block"
            />
            <select
              value={filters.type}
              onChange={e => {
                setFilters({ ...filters, type: e.target.value as ReturnsType });
              }}
              aria-label="نوع التدفق"
              className="h-7 w-full appearance-none rounded-md border border-[var(--app-border)] bg-[var(--app-surface-hover)] px-1.5 text-[10px] font-bold outline-none transition-colors focus:border-rose-500 dark:text-white sm:h-9 sm:rounded-lg sm:pl-3 sm:pr-7 sm:text-xs"
            >
              <option value="all">التدفق</option>
              <option value="sales">مبيعات</option>
              <option value="purchase">مشتريات</option>
            </select>
          </div>
        </div>

        {/* Status Filter */}
        <div className="min-w-0">
          <label className="mb-0.5 hidden truncate text-[10px] font-bold text-slate-400 sm:block">الحالة</label>
          <select
            value={filters.status}
            onChange={e => {
              setFilters({ ...filters, status: e.target.value });
            }}
            aria-label="الحالة"
            className="h-7 w-full appearance-none rounded-md border border-[var(--app-border)] bg-[var(--app-surface-hover)] px-1.5 text-[10px] font-bold outline-none transition-colors focus:border-rose-500 dark:text-white sm:h-9 sm:rounded-lg sm:px-3 sm:text-xs"
          >
            <option value="all">الحالة</option>
            <option value="draft">مسودة</option>
            <option value="posted">معتمد</option>
            <option value="paid">مدفوع</option>
            <option value="cancelled">ملغي</option>
          </select>
        </div>

        {/* Causation Filter */}
        <div className="min-w-0">
          <label className="mb-0.5 hidden truncate text-[10px] font-bold text-slate-400 sm:block">سبب الإرجاع</label>
          <select
            value={filters.reason}
            onChange={e => {
              setFilters({ ...filters, reason: e.target.value });
            }}
            aria-label="سبب الإرجاع"
            className="h-7 w-full appearance-none rounded-md border border-[var(--app-border)] bg-[var(--app-surface-hover)] px-1.5 text-[10px] font-bold outline-none transition-colors focus:border-rose-500 dark:text-white sm:h-9 sm:rounded-lg sm:px-3 sm:text-xs"
          >
            <option value="all">السبب</option>
            <option value="defective">تالف</option>
            <option value="not_as_described">غير مطابق</option>
            <option value="wrong_item">صنف خاطئ</option>
            <option value="quality_issue">جودة</option>
            <option value="changed_mind">تغيير رأي</option>
            <option value="expired">منتهي</option>
            <option value="other">أخرى</option>
          </select>
        </div>
      </div>

      {/* Dynamic Custom Date Picker */}
      {filters.dateRange === 'custom' && (
        <div className="animate-in slide-in-from-top-2 mt-3 grid grid-cols-2 gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-hover)] p-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">من تاريخ</label>
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={e => {
                setFilters({ ...filters, startDate: e.target.value });
              }}
              className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 font-mono text-xs font-bold outline-none focus:border-rose-500 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">إلى تاريخ</label>
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={e => {
                setFilters({ ...filters, endDate: e.target.value });
              }}
              className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 font-mono text-xs font-bold outline-none focus:border-rose-500 dark:text-white"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnsFilterBar;
