import React, { useMemo, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import {
  TrendingUp,
  TrendingDown,
  Users,
  FileSpreadsheet,
  Printer,
  Search,
  Scale,
  Phone,
  ArrowUpDown,
  Building2,
} from 'lucide-react';
import { useDebtReport } from '../hooks';
import type { PartyDebt } from '../types';
import { cn, formatCurrency, formatLocalDate } from '../../../core/utils';

const normalizeArabicSearch = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '')
    .trim();
import ShareButton from '../../../ui/common/ShareButton';
import ExcelTable, { type Column } from '../../../ui/common/ExcelTable';
import { exportGenericTableToExcel } from '../../../core/utils/genericExcelExporter';
import { useCompany } from '../../settings/hooks';
import { useInvoiceSettings } from '../../settings/settingsStore';
import { AlNadaryPrintShell } from '@/ui/print/AlNadaryPrintShell';

type DebtFilterTab = 'all' | 'customers' | 'suppliers';
type DebtSortMode = 'amount_desc' | 'amount_asc' | 'name_asc';

interface EnrichedDebtRow {
  id: string;
  rowIndex: number;
  name: string;
  phone: string;
  type: 'customer' | 'supplier';
  typeLabel: string;
  remaining_amount: number;
  absAmount: number;
  direction: 'debit' | 'credit';
  directionLabel: string;
  currency: string;
  balances_by_currency: Array<{ currency: string; balance: number }>;
  currenciesText: string;
}

/**
 * Pure helper to build clean Excel export rows & headers for the Debt Report.
 * Exported for unit testing to guarantee Excel exports are never empty.
 */
export const buildDebtReportExcelPayload = (params: {
  rows: EnrichedDebtRow[];
  baseCurrency: string;
  companyName: string;
  filterLabel: string;
}) => {
  const { rows, baseCurrency, companyName, filterLabel } = params;

  const headers = [
    '#',
    'الجهة المالية',
    'رقم الهاتف',
    'الفئة',
    'حالة الرصيد',
    `المبلغ (${baseCurrency})`,
    'تفصيل العملات',
  ];

  const dataRows: Array<Array<string | number>> = rows.map((row, idx) => [
    idx + 1,
    row.name,
    row.phone || '—',
    row.typeLabel,
    row.directionLabel,
    Number(row.absAmount.toFixed(2)),
    row.currenciesText || `${row.absAmount.toFixed(2)} ${baseCurrency}`,
  ]);

  const totalDebit = rows
    .filter(r => r.direction === 'debit')
    .reduce((sum, r) => sum + r.absAmount, 0);
  const totalCredit = rows
    .filter(r => r.direction === 'credit')
    .reduce((sum, r) => sum + r.absAmount, 0);
  const net = totalDebit - totalCredit;

  if (dataRows.length > 0) {
    dataRows.push([
      '',
      `الإجمالي (${rows.length} جهة)`,
      '',
      filterLabel,
      net >= 0 ? 'صافي مستحق لنا (عليه)' : 'صافي التزام علينا (له)',
      Number(Math.abs(net).toFixed(2)),
      `مستحقات: ${totalDebit.toFixed(2)} | التزامات: ${totalCredit.toFixed(2)}`,
    ]);
  }

  return {
    title: `تقرير الديون والمركز المالي — ${filterLabel}`,
    subtitle: `العملة الأساسية: ${baseCurrency}`,
    companyName,
    headers,
    rows: dataRows,
    fileName: `تقرير_الديون_${formatLocalDate(new Date())}`,
    colorTheme: 'blue' as const,
  };
};

// eslint-disable-next-line max-lines-per-function, complexity -- complete executive report view with KPIs, filters, table, Excel export, and A4 print shell.
const DebtReportView: React.FC = () => {
  const { data, isLoading } = useDebtReport();
  const { data: settingsCompany } = useCompany();
  const invoiceSettings = useInvoiceSettings();

  const [activeTab, setActiveTab] = useState<DebtFilterTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<DebtSortMode>('amount_desc');
  const [isExporting, setIsExporting] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `تقرير_الديون_${formatLocalDate(new Date())}`,
  });

  const company = useMemo(
    () => ({
      nameAr:
        invoiceSettings?.company_name_ar ||
        settingsCompany?.name_ar ||
        'محلات النظاري لقطع غيار السيارات',
      address: invoiceSettings?.company_address || settingsCompany?.address || '',
      phone: invoiceSettings?.company_phone || settingsCompany?.phone || '',
      logoUrl: settingsCompany?.logo_url || '',
    }),
    [invoiceSettings, settingsCompany]
  );

  const baseCurrency = data?.summary.currency || 'SAR';

  const enrichedAll: EnrichedDebtRow[] = useMemo(() => {
    const rawList: PartyDebt[] = data?.debts ?? [];
    return rawList
      .filter(d => Math.abs(Number(d.remaining_amount) || 0) > 0.01)
      .map((d, idx) => {
        const remaining = Number(d.remaining_amount) || 0;
        const absAmount = Math.abs(remaining);
        const direction: 'debit' | 'credit' = remaining >= 0 ? 'debit' : 'credit';
        const byCurr = (d.balances_by_currency ?? []).filter(b => Math.abs(b.balance) > 0.01);
        const currenciesText =
          byCurr.length > 0
            ? byCurr
                .map(
                  b =>
                    `${formatCurrency(Math.abs(b.balance), b.currency)} (${b.balance >= 0 ? 'عليه' : 'له'})`
                )
                .join(' | ')
            : `${formatCurrency(absAmount, baseCurrency)} (${direction === 'debit' ? 'عليه' : 'له'})`;

        return {
          id: d.id,
          rowIndex: idx + 1,
          name: d.name,
          phone: d.phone ?? '',
          type: d.type,
          typeLabel: d.type === 'customer' ? 'عميل' : 'مورد',
          remaining_amount: remaining,
          absAmount,
          direction,
          directionLabel: direction === 'debit' ? 'عليه (مدين)' : 'له (دائن)',
          currency: baseCurrency,
          balances_by_currency: byCurr,
          currenciesText,
        };
      });
  }, [data?.debts, baseCurrency]);

  const receivables = useMemo(
    () => enrichedAll.filter(d => d.type === 'customer'),
    [enrichedAll]
  );
  const payables = useMemo(() => enrichedAll.filter(d => d.type === 'supplier'), [enrichedAll]);

  const filteredRows = useMemo(() => {
    const baseList =
      activeTab === 'customers'
        ? receivables
        : activeTab === 'suppliers'
          ? payables
          : enrichedAll;

    const query = normalizeArabicSearch(searchTerm);
    const searched = query
      ? baseList.filter(
          row =>
            normalizeArabicSearch(row.name).includes(query) ||
            (row.phone && row.phone.includes(searchTerm.trim()))
        )
      : baseList;

    const sorted = [...searched].sort((a, b) => {
      if (sortMode === 'amount_desc') return b.absAmount - a.absAmount;
      if (sortMode === 'amount_asc') return a.absAmount - b.absAmount;
      return a.name.localeCompare(b.name, 'ar');
    });

    return sorted.map((r, i) => ({ ...r, rowIndex: i + 1 }));
  }, [activeTab, receivables, payables, enrichedAll, searchTerm, sortMode]);

  const totalReceivables = data?.summary?.receivables ?? 0;
  const totalPayables = data?.summary?.payables ?? 0;
  const netPosition = totalReceivables - totalPayables;
  const grossVolume = totalReceivables + totalPayables;
  const receivablesRatio = grossVolume > 0 ? Math.round((totalReceivables / grossVolume) * 100) : 0;

  const filteredTotals = useMemo(() => {
    const debit = filteredRows
      .filter(r => r.direction === 'debit')
      .reduce((s, r) => s + r.absAmount, 0);
    const credit = filteredRows
      .filter(r => r.direction === 'credit')
      .reduce((s, r) => s + r.absAmount, 0);
    return { debit, credit, net: debit - credit };
  }, [filteredRows]);

  const activeFilterLabel =
    activeTab === 'customers'
      ? 'مستحقات العملاء'
      : activeTab === 'suppliers'
        ? 'التزامات الموردين'
        : 'جميع الذمم (عملاء وموردين)';

  const handleExportExcel = async () => {
    if (filteredRows.length === 0) return;
    setIsExporting(true);
    try {
      const payload = buildDebtReportExcelPayload({
        rows: filteredRows,
        baseCurrency,
        companyName: company.nameAr,
        filterLabel: activeFilterLabel,
      });
      await exportGenericTableToExcel(payload);
    } finally {
      setIsExporting(false);
    }
  };

  const columns: Array<Column<EnrichedDebtRow>> = useMemo(
    () => [
      {
        header: '#',
        accessorKey: 'rowIndex',
        width: '56px',
        align: 'center',
        accessor: row => (
          <span className="font-mono text-xs font-bold text-slate-400">{row.rowIndex}</span>
        ),
      },
      {
        header: 'الجهة المالية',
        accessorKey: 'name',
        sortKey: 'name',
        width: '260px',
        accessor: row => (
          <div className="flex flex-col py-0.5 text-right">
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 sm:text-sm">
              {row.name}
            </span>
            {row.phone && (
              <span
                dir="ltr"
                className="mt-0.5 inline-flex items-center gap-1 self-start font-mono text-[10px] font-bold text-slate-400"
              >
                <Phone size={10} />
                {row.phone}
              </span>
            )}
          </div>
        ),
      },
      {
        header: 'الفئة',
        accessorKey: 'typeLabel',
        width: '95px',
        align: 'center',
        accessor: row => (
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-black',
              row.type === 'customer'
                ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300'
            )}
          >
            {row.typeLabel}
          </span>
        ),
      },
      {
        header: 'الموقف',
        accessorKey: 'directionLabel',
        width: '115px',
        align: 'center',
        accessor: row => (
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-black',
              row.direction === 'debit'
                ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
            )}
          >
            {row.directionLabel}
          </span>
        ),
      },
      {
        header: `المبلغ المتبقي (${baseCurrency})`,
        accessorKey: 'absAmount',
        sortKey: 'absAmount',
        width: '175px',
        align: 'left',
        accessor: row => (
          <span
            dir="ltr"
            className={cn(
              'inline-block rounded-lg border px-3 py-1 font-mono text-sm font-black',
              row.direction === 'debit'
                ? 'border-rose-200/80 bg-rose-50/80 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-300'
                : 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300'
            )}
          >
            {formatCurrency(row.absAmount, baseCurrency)}
          </span>
        ),
      },
      {
        header: 'تفصيل العملات',
        accessorKey: 'currenciesText',
        width: '220px',
        accessor: row => {
          if (row.balances_by_currency.length === 0) {
            return (
              <span className="font-mono text-xs font-bold text-slate-400" dir="ltr">
                {formatCurrency(row.absAmount, baseCurrency)}
              </span>
            );
          }
          return (
            <div className="flex flex-wrap items-center gap-1">
              {row.balances_by_currency.map(entry => (
                <span
                  key={entry.currency}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-black',
                    entry.balance >= 0
                      ? 'border-rose-200/70 bg-rose-50/60 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300'
                      : 'border-emerald-200/70 bg-emerald-50/60 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                  )}
                >
                  <span dir="ltr" className="font-mono">
                    {formatCurrency(Math.abs(entry.balance), entry.currency)}
                  </span>
                  <span>{entry.balance >= 0 ? 'عليه' : 'له'}</span>
                </span>
              ))}
            </div>
          );
        },
      },
    ],
    [baseCurrency]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-14">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
        <p className="text-xs font-black tracking-wider text-slate-500">
          جاري إعداد تقرير الديون والمركز المالي...
        </p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in space-y-5 duration-300">
      {/* Official Al-Nadary Report Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-l from-slate-900 via-slate-900 to-blue-950 p-5 text-white shadow-md dark:border-slate-800">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-blue-300 shadow-inner">
              <Building2 size={24} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-blue-400/30 bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-black text-blue-200">
                  {company.nameAr}
                </span>
                <span className="font-mono text-[11px] font-bold text-slate-300">
                  {formatLocalDate(new Date())}
                </span>
              </div>
              <h2 className="mt-1.5 text-lg font-black tracking-tight text-white sm:text-xl">
                تقرير الديون والمركز المالي
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-300">
                كشف شامل لمستحقات العملاء والتزامات الموردين بجميع العملات
              </p>
            </div>
          </div>

          {/* Official Export & Print Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void handleExportExcel();
              }}
              disabled={isExporting || filteredRows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet size={16} />
              <span>{isExporting ? 'جاري التصدير...' : 'تصدير Excel'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handlePrint();
              }}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-black text-white transition-all hover:bg-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer size={16} />
              <span>طباعة رسمية</span>
            </button>

            <ShareButton
              size="sm"
              eventType="debt_report"
              title="مشاركة"
              className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs font-black text-white transition-all hover:bg-white/20"
              message={`📊 تقرير الديون والمركز المالي — ${company.nameAr}\n━━━━━━━━━━━━━━\n✅ مستحقات العملاء (عليه): ${formatCurrency(totalReceivables, baseCurrency)} (${receivables.length} عميل)\n🔴 التزامات الموردين (له): ${formatCurrency(totalPayables, baseCurrency)} (${payables.length} مورد)\n⚖️ صافي المركز: ${formatCurrency(Math.abs(netPosition), baseCurrency)} (${netPosition >= 0 ? 'فائض لصالح المنشأة' : 'التزامات على المنشأة'})\n📅 التاريخ: ${formatLocalDate(new Date())}`}
            />
          </div>
        </div>
      </div>

      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {/* Receivables */}
        <div className="rounded-2xl border border-emerald-200/70 bg-[var(--app-surface)] p-4 shadow-sm dark:border-emerald-900/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">
              إجمالي مستحقات العملاء (عليه)
            </span>
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              <TrendingUp size={16} />
            </div>
          </div>
          <div
            dir="ltr"
            className="mt-2.5 font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white"
          >
            {formatCurrency(totalReceivables, baseCurrency)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <Users size={13} />
            <span>{receivables.length} عميل لديه رصيد نشط</span>
          </div>
        </div>

        {/* Payables */}
        <div className="rounded-2xl border border-rose-200/70 bg-[var(--app-surface)] p-4 shadow-sm dark:border-rose-900/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-rose-700 dark:text-rose-400">
              ديون مستحقة للموردين (له)
            </span>
            <div className="rounded-xl bg-rose-500/10 p-2 text-rose-600 dark:text-rose-400">
              <TrendingDown size={16} />
            </div>
          </div>
          <div
            dir="ltr"
            className="mt-2.5 font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white"
          >
            {formatCurrency(totalPayables, baseCurrency)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <Users size={13} />
            <span>{payables.length} مورد لديه رصيد نشط</span>
          </div>
        </div>

        {/* Net Financial Position */}
        <div
          className={cn(
            'rounded-2xl border p-4 shadow-sm',
            netPosition >= 0
              ? 'border-blue-200 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/30'
              : 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/30'
          )}
        >
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'text-xs font-black',
                netPosition >= 0
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-amber-700 dark:text-amber-300'
              )}
            >
              صافي المركز المالي
            </span>
            <div
              className={cn(
                'rounded-xl p-2',
                netPosition >= 0
                  ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
              )}
            >
              <Scale size={16} />
            </div>
          </div>
          <div
            dir="ltr"
            className="mt-2.5 font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white"
          >
            {formatCurrency(Math.abs(netPosition), baseCurrency)}
          </div>
          <div className="mt-2 text-[11px] font-black">
            <span
              className={cn(
                'rounded-full px-2 py-0.5',
                netPosition >= 0
                  ? 'bg-blue-600 text-white'
                  : 'bg-amber-600 text-white'
              )}
            >
              {netPosition >= 0 ? 'فائض لصالح المنشأة' : 'التزامات على المنشأة'}
            </span>
          </div>
        </div>

        {/* Ratio / Concentration */}
        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 dark:text-slate-200">
              إجمالي الذمم النشطة
            </span>
            <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {enrichedAll.length} جهة
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-emerald-600 dark:text-emerald-400">
                عملاء {receivablesRatio}%
              </span>
              <span className="text-rose-600 dark:text-rose-400">
                موردين {100 - receivablesRatio}%
              </span>
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-rose-100 dark:bg-rose-950/50">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${receivablesRatio}%` }}
              />
            </div>
          </div>
          <p className="mt-2.5 text-[10px] font-bold text-slate-400">
            العملة المرجعية للتقرير: {baseCurrency}
          </p>
        </div>
      </div>

      {/* Unified Full-Width Filterable Table Card */}
      <div className="overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm">
        {/* Filter Tabs + Search + Sort */}
        <div className="flex flex-col gap-3 border-b border-[var(--app-border)] bg-slate-50/70 p-4 dark:bg-slate-900/40 lg:flex-row lg:items-center lg:justify-between">
          {/* Segmented Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            {(
              [
                { id: 'all', label: 'الكل', count: enrichedAll.length },
                { id: 'customers', label: 'مستحقات العملاء', count: receivables.length },
                { id: 'suppliers', label: 'التزامات الموردين', count: payables.length },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition-all',
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-blue-600'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 font-mono text-[10px]',
                    activeTab === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & Sort Controls */}
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="بحث باسم العميل / المورد أو الهاتف..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-9 pl-3 text-xs font-bold text-slate-800 outline-none transition-all focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <Search
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>

            <div className="relative flex items-center">
              <ArrowUpDown
                size={14}
                className="pointer-events-none absolute right-2.5 text-slate-400"
              />
              <select
                value={sortMode}
                onChange={e => setSortMode(e.target.value as DebtSortMode)}
                aria-label="ترتيب النتائج"
                className="cursor-pointer rounded-xl border border-slate-200 bg-white py-2 pr-8 pl-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="amount_desc">الأعلى مبلغاً</option>
                <option value="amount_asc">الأقل مبلغاً</option>
                <option value="name_asc">أبجدياً (أ - ي)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Full-Width Data Table */}
        <div className="overflow-x-auto">
          <ExcelTable
            columns={columns}
            data={filteredRows}
            title={`تقرير الديون — ${activeFilterLabel}`}
            subtitle={`إجمالي ${filteredRows.length} جهة`}
            emptyMessage="لا توجد ذمم مطابقة لمعايير البحث الحالية"
            colorTheme={activeTab === 'suppliers' ? 'orange' : activeTab === 'customers' ? 'green' : 'blue'}
            showSearch={false}
            isRTL={true}
            pageSize={25}
            onExport={() => {
              void handleExportExcel();
            }}
          />
        </div>

        {/* Filtered Totals Footer */}
        {filteredRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] bg-slate-50 px-5 py-3 dark:bg-slate-900/60">
            <span className="text-xs font-black text-slate-600 dark:text-slate-300">
              ملخص النتائج المعروضة ({filteredRows.length} جهة)
            </span>
            <div className="flex flex-wrap items-center gap-4 text-xs font-black">
              {filteredTotals.debit > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">إجمالي (عليه):</span>
                  <span dir="ltr" className="font-mono text-rose-600 dark:text-rose-400">
                    {formatCurrency(filteredTotals.debit, baseCurrency)}
                  </span>
                </div>
              )}
              {filteredTotals.credit > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">إجمالي (له):</span>
                  <span dir="ltr" className="font-mono text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(filteredTotals.credit, baseCurrency)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1 text-white dark:bg-blue-600">
                <span>الصافي:</span>
                <span dir="ltr" className="font-mono">
                  {formatCurrency(Math.abs(filteredTotals.net), baseCurrency)}
                </span>
                <span className="text-[10px] opacity-80">
                  ({filteredTotals.net >= 0 ? 'عليه' : 'له'})
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dedicated Off-Screen Official Al-Nadary A4 Print Target */}
      <div
        className="pointer-events-none fixed -left-[10000px] top-0 w-[210mm] opacity-0"
        aria-hidden="true"
      >
        <div ref={printRef} id="debt-report-printable">
          <AlNadaryPrintShell
            documentTitle={`تقرير الديون والمركز المالي — ${activeFilterLabel}`}
            documentDate={formatLocalDate(new Date())}
            documentNumber={`${filteredRows.length} جهة`}
            documentNumberLabel="عدد الجهات"
            company={company}
            rightMeta={[
              {
                label: 'مستحقات العملاء (عليه)',
                value: formatCurrency(totalReceivables, baseCurrency),
              },
              {
                label: 'التزامات الموردين (له)',
                value: formatCurrency(totalPayables, baseCurrency),
              },
            ]}
            leftMeta={[
              {
                label: 'صافي المركز المالي',
                value: `${formatCurrency(Math.abs(netPosition), baseCurrency)} (${netPosition >= 0 ? 'فائض' : 'التزام'})`,
              },
              { label: 'العملة الأساسية', value: baseCurrency },
            ]}
            showDefaultTerms={false}
            signatures={['إعداد المحاسب', 'مراجعة المدير المالي', 'الاعتماد']}
          >
            <table className="alnadary-table">
              <thead>
                <tr>
                  <th style={{ width: '6%' }}>#</th>
                  <th style={{ width: '32%' }}>الجهة المالية</th>
                  <th style={{ width: '14%' }}>الهاتف</th>
                  <th style={{ width: '10%' }}>الفئة</th>
                  <th style={{ width: '14%' }}>الموقف</th>
                  <th style={{ width: '24%' }}>المبلغ ({baseCurrency})</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.id}>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.rowIndex}</td>
                    <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
                      {row.name}
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>
                      {row.phone || '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.typeLabel}</td>
                    <td
                      style={{
                        textAlign: 'center',
                        fontWeight: 800,
                        color: row.direction === 'debit' ? '#be123c' : '#047857',
                      }}
                    >
                      {row.directionLabel}
                    </td>
                    <td
                      style={{
                        textAlign: 'left',
                        fontFamily: 'monospace',
                        fontWeight: 900,
                        color: row.direction === 'debit' ? '#be123c' : '#047857',
                      }}
                      dir="ltr"
                    >
                      {formatCurrency(row.absAmount, baseCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AlNadaryPrintShell>
        </div>
      </div>
    </div>
  );
};

export default DebtReportView;
