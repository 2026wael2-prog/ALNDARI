import React from 'react';
import {
  Calendar,
  Clock,
  FileText,
  Loader2,
  Package,
  Phone,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { CustomizableTableWrapper } from '@/ui/table-settings/TableSettingsButton';
import { formatCurrency } from '@/core/utils';
import type { QuotationStatus } from '@/features/sales/types/quotation';
import QuotationActionIcons, {
  type QuotationRowAction,
} from '@/features/sales/components/quotations/QuotationActionIcons';
import {
  currencyBadgeStyle,
  FILTER_TABS,
  getDaysRemaining,
  STATUS_CONFIG,
} from './quotationsTabHelpers';

interface QuotationsFilterBarProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
  countsByStatus: Record<string, number>;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export const QuotationsFilterBar: React.FC<QuotationsFilterBarProps> = ({
  statusFilter,
  onStatusChange,
  countsByStatus,
  searchTerm,
  onSearchChange,
}) => (
  <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-[var(--app-surface)] p-2.5 shadow-sm dark:border-slate-800 sm:flex-row sm:items-center">
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100/90 p-1 dark:bg-slate-900/70">
      {FILTER_TABS.map(tab => {
        const count = countsByStatus[tab.key] ?? 0;
        const active = statusFilter === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              onStatusChange(tab.key);
            }}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              active
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                active
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200'
                  : 'bg-slate-200/80 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>

    <div className="relative w-full sm:max-w-xs">
      <Search
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        type="text"
        value={searchTerm}
        onChange={e => {
          onSearchChange(e.target.value);
        }}
        placeholder="بحث برقم العرض، اسم العميل، الهاتف..."
        aria-label="بحث في عروض الأسعار"
        className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-8 pr-9 text-xs font-medium text-slate-800 transition-colors focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:focus:bg-slate-800"
      />
      {searchTerm !== '' && (
        <button
          type="button"
          onClick={() => {
            onSearchChange('');
          }}
          aria-label="مسح البحث"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700"
        >
          <X size={13} />
        </button>
      )}
    </div>
  </div>
);

interface QuotationsTableProps {
  loading: boolean;
  filtered: any[];
  hasActiveFilter: boolean;
  onCreateNew: () => void;
  onOpenDetails: (id: string, action: QuotationRowAction | null) => void;
}

export const QuotationsTable: React.FC<QuotationsTableProps> = ({
  loading,
  filtered,
  hasActiveFilter,
  onCreateNew,
  onOpenDetails,
}) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-[var(--app-surface)] py-16 dark:border-slate-800">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
        <span className="text-xs font-medium text-slate-400">جارٍ تحميل عروض الأسعار...</span>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-[var(--app-surface)] py-14 text-center dark:border-slate-700">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-400">
          <FileText size={28} />
        </div>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          {hasActiveFilter ? 'لا توجد عروض أسعار مطابقة للبحث أو التصفية' : 'لا توجد عروض أسعار بعد'}
        </p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          {hasActiveFilter
            ? 'جرّب تغيير معايير التصفية أو مسح البحث'
            : 'ابدأ بإنشاء أول عرض سعر احترافي لعملائك مع طباعة رسمية فورية'}
        </p>
        <button
          type="button"
          onClick={onCreateNew}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700"
        >
          <Plus size={16} />
          عرض سعر جديد
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-[var(--app-surface)] shadow-sm dark:border-slate-800">
      <CustomizableTableWrapper tableId="sales.quotations" tableTitle="عروض الأسعار">
        <div className="custom-scrollbar scroll-x-hint-surface table-scroll-viewport">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/90 text-xs font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-400">
                <th className="px-4 py-3 text-right">رقم العرض</th>
                <th className="px-4 py-3 text-right">العميل</th>
                <th className="px-4 py-3 text-right">تاريخ الإصدار</th>
                <th className="px-4 py-3 text-right">الصلاحية</th>
                <th className="px-4 py-3 text-right">الإجمالي</th>
                <th className="px-4 py-3 text-right">الحالة</th>
                <th className="px-4 py-3 text-center">الأصناف</th>
                <th className="px-4 py-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filtered.map(q => {
                const statusConf = STATUS_CONFIG[q.status as QuotationStatus] || STATUS_CONFIG.draft;
                const daysLeft = getDaysRemaining(q.valid_until);
                const currCode = String(q.currency_code || 'SAR').toUpperCase();
                const customerName = q.party?.name || 'عميل نقدي';
                const customerInitial = customerName.trim().charAt(0) || 'ع';
                const itemsCount = q.quotation_items?.length || 0;

                return (
                  <tr
                    key={q.id}
                    onClick={() => {
                      onOpenDetails(q.id, null);
                    }}
                    className="group cursor-pointer transition-colors hover:bg-indigo-50/40 dark:hover:bg-slate-800/60"
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-lg border border-indigo-200/70 bg-indigo-50/70 px-2.5 py-1 font-mono text-xs font-extrabold text-indigo-700 transition-colors group-hover:border-indigo-300 group-hover:bg-indigo-100/80 dark:border-indigo-800/50 dark:bg-indigo-950/40 dark:text-indigo-300">
                        {q.quotation_number}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {customerInitial}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-bold text-slate-900 dark:text-white">
                            {customerName}
                          </div>
                          {q.party?.phone && (
                            <div className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                              <Phone size={10} />
                              <span dir="ltr">{q.party.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-slate-600 dark:text-slate-300">
                        <Calendar size={12} className="text-slate-400" />
                        {new Date(q.issue_date).toLocaleDateString('ar-SA-u-nu-latn')}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {daysLeft !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            daysLeft <= 0
                              ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                              : daysLeft <= 3
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          <Clock size={10} />
                          {daysLeft <= 0 ? 'منتهي' : `${daysLeft} يوم`}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-mono text-sm font-extrabold text-slate-900 dark:text-white"
                          dir="ltr"
                        >
                          {formatCurrency(q.total_amount, currCode)}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${currencyBadgeStyle(currCode)}`}
                        >
                          {currCode}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${statusConf.color}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${statusConf.dot}`} />
                        {statusConf.label}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Package size={11} className="text-slate-400" />
                        {itemsCount}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <QuotationActionIcons
                        onAction={action => {
                          onOpenDetails(q.id, action);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CustomizableTableWrapper>
    </div>
  );
};
