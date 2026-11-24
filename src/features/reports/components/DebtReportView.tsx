import React, { useMemo, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { ArrowUpDown, Search } from 'lucide-react';
import { useDebtReport } from '../hooks';
import { cn, formatCurrency, formatLocalDate } from '../../../core/utils';
import ExcelTable from '../../../ui/common/ExcelTable';
import { exportGenericTableToExcel } from '../../../core/utils/genericExcelExporter';
import { useCompany } from '../../settings/hooks';
import { useInvoiceSettings, useDocumentHeaderSettings } from '../../settings/settingsStore';
import { PdfCaptureHost } from '@/core/components/PdfCaptureHost';
import WhatsAppShareChoiceModal from '@/ui/common/WhatsAppShareChoiceModal';
import { buildWhatsappHeader } from '@/core/utils/whatsappHeader';
import { logger } from '../../../core/utils/logger';
import {
  buildDebtReportExcelPayload,
  buildDebtWhatsAppText,
  computeCurrencyTotals,
  discoverActiveCurrencies,
  enrichDebtRows,
  getCurrencyColumnLabel,
  normalizeArabicSearch,
  type DebtFilterTab,
  type DebtSortMode,
  type EnrichedDebtRow,
} from './debt-report/debtReportHelpers';
import { DebtReportHeader } from './debt-report/DebtReportHeader';
import { DebtReportKpiCards } from './debt-report/DebtReportKpiCards';
import { DebtReportPrintSheet } from './debt-report/DebtReportPrintSheet';
import { useDebtReportColumns } from './debt-report/useDebtReportColumns';

export { getCurrencyColumnLabel, buildDebtReportExcelPayload };
export type { EnrichedDebtRow };

const DebtReportView: React.FC = () => {
  const { data, isLoading } = useDebtReport();
  const { data: settingsCompany } = useCompany();
  const invoiceSettings = useInvoiceSettings();
  const headerConfig = useDocumentHeaderSettings();

  const [activeTab, setActiveTab] = useState<DebtFilterTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<DebtSortMode>('amount_desc');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);
  const pdfCaptureRef = useRef<HTMLDivElement>(null);

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
      taxNumber: settingsCompany?.tax_number || '',
      logoUrl: settingsCompany?.logo_url || '',
    }),
    [invoiceSettings, settingsCompany]
  );

  const baseCurrency = (data?.summary.currency || 'SAR').toUpperCase();

  const enrichedAll = useMemo(
    () => enrichDebtRows(data?.debts ?? [], baseCurrency),
    [data?.debts, baseCurrency]
  );

  const activeCurrencies = useMemo(
    () => discoverActiveCurrencies(enrichedAll, baseCurrency),
    [enrichedAll, baseCurrency]
  );

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

  const filteredCurrencyTotals = useMemo(
    () => computeCurrencyTotals(filteredRows, activeCurrencies),
    [filteredRows, activeCurrencies]
  );

  const totalReceivables = data?.summary?.receivables ?? 0;
  const totalPayables = data?.summary?.payables ?? 0;
  const netPosition = totalReceivables - totalPayables;
  const grossVolume = totalReceivables + totalPayables;
  const receivablesRatio = grossVolume > 0 ? Math.round((totalReceivables / grossVolume) * 100) : 0;

  const activeFilterLabel =
    activeTab === 'customers'
      ? 'مستحقات العملاء'
      : activeTab === 'suppliers'
        ? 'التزامات الموردين'
        : 'جميع الذمم (عملاء وموردين)';

  const handleExportExcel = async () => {
    if (filteredRows.length === 0) return;
    setIsExportingExcel(true);
    try {
      const payload = buildDebtReportExcelPayload({
        rows: filteredRows,
        activeCurrencies,
        baseCurrency,
        companyName: company.nameAr,
        filterLabel: activeFilterLabel,
      });
      await exportGenericTableToExcel(payload);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    if (filteredRows.length === 0) return;
    setIsExportingPdf(true);
    await new Promise(resolve => setTimeout(resolve, 60));
    try {
      const target = pdfCaptureRef.current || printRef.current;
      if (target) {
        const { exportToPDF } = await import('../../../core/utils/pdfExporter');
        await exportToPDF(target, `تقرير_الديون_${formatLocalDate(new Date())}`);
      }
    } catch (err) {
      logger.error('DebtReportView', 'PDF export failed', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const generateReportPdfBlob = async (): Promise<Blob> => {
    setIsExportingPdf(true);
    await new Promise(resolve => setTimeout(resolve, 80));
    try {
      const target = pdfCaptureRef.current || printRef.current;
      if (!target) throw new Error('Debt report PDF target not ready');
      const { generatePDFBlob } = await import('../../../core/utils/pdfExporter');
      return await generatePDFBlob(target);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const waHeader = headerConfig?.whatsapp
    ? buildWhatsappHeader(headerConfig.whatsapp, {
        name: headerConfig.details.companyNameOverride || company.nameAr,
        phone: company.phone || undefined,
        taxNumber: company.taxNumber || undefined,
        slogan: headerConfig.details.sloganText || undefined,
      })
    : '';

  const whatsAppText = buildDebtWhatsAppText({
    waHeader,
    companyName: company.nameAr,
    activeFilterLabel,
    baseCurrency,
    totalReceivables,
    totalPayables,
    netPosition,
    receivablesCount: receivables.length,
    payablesCount: payables.length,
    filteredCurrencyTotals,
  });

  const columns = useDebtReportColumns(activeCurrencies, baseCurrency, activeCurrencies.length > 1);

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

  const printSheetNode = (
    <DebtReportPrintSheet
      activeFilterLabel={activeFilterLabel}
      baseCurrency={baseCurrency}
      activeCurrencies={activeCurrencies}
      filteredRows={filteredRows}
      filteredCurrencyTotals={filteredCurrencyTotals}
      totalReceivables={totalReceivables}
      totalPayables={totalPayables}
      netPosition={netPosition}
      company={company}
    />
  );

  return (
    <div className="animate-in fade-in space-y-5 duration-150">
      <DebtReportHeader
        companyName={company.nameAr}
        activeCurrencies={activeCurrencies}
        hasRows={filteredRows.length > 0}
        isExportingExcel={isExportingExcel}
        isExportingPdf={isExportingPdf}
        onExportExcel={() => {
          void handleExportExcel();
        }}
        onExportPdf={() => {
          void handleExportPdf();
        }}
        onOpenWhatsApp={() => setIsWhatsAppModalOpen(true)}
        onPrint={() => {
          handlePrint();
        }}
      />

      <DebtReportKpiCards
        baseCurrency={baseCurrency}
        totalReceivables={totalReceivables}
        totalPayables={totalPayables}
        netPosition={netPosition}
        receivablesCount={receivables.length}
        payablesCount={payables.length}
        totalActiveCount={enrichedAll.length}
        receivablesRatio={receivablesRatio}
        activeCurrencies={activeCurrencies}
      />

      <div className="overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[var(--app-border)] bg-slate-50/70 p-4 dark:bg-slate-900/40 lg:flex-row lg:items-center lg:justify-between">
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

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="بحث باسم العميل / المورد أو الهاتف..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-9 text-xs font-bold text-slate-800 outline-none transition-all focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                className="cursor-pointer rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="amount_desc">الأعلى مبلغاً</option>
                <option value="amount_asc">الأقل مبلغاً</option>
                <option value="name_asc">أبجدياً (أ - ي)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <ExcelTable
            columns={columns}
            data={filteredRows}
            title={`تقرير الديون — ${activeFilterLabel}`}
            subtitle={`العملات: ${activeCurrencies.join(' • ')} | ${filteredRows.length} جهة`}
            emptyMessage="لا توجد ذمم مطابقة لمعايير البحث الحالية"
            colorTheme={
              activeTab === 'suppliers' ? 'orange' : activeTab === 'customers' ? 'green' : 'blue'
            }
            showSearch={false}
            isRTL={true}
            pageSize={25}
            onExport={() => {
              void handleExportExcel();
            }}
          />
        </div>

        {filteredRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] bg-slate-50 px-5 py-3.5 dark:bg-slate-900/60">
            <span className="text-xs font-black text-slate-600 dark:text-slate-300">
              إجمالي النتائج المعروضة حسب العملة ({filteredRows.length} جهة)
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              {filteredCurrencyTotals.map(ct => (
                <div
                  key={ct.currency}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-black shadow-2xs',
                    ct.net >= 0
                      ? 'border-rose-200 bg-rose-50/80 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200'
                      : 'border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200'
                  )}
                >
                  <span className="text-[10px] opacity-80">
                    {getCurrencyColumnLabel(ct.currency)}:
                  </span>
                  <span dir="ltr" className="font-mono">
                    {formatCurrency(Math.abs(ct.net), ct.currency)}
                  </span>
                  <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] dark:bg-slate-900/50">
                    {ct.net >= 0 ? 'عليه' : 'له'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className="pointer-events-none fixed -left-[10000px] top-0 w-[210mm] opacity-0"
        aria-hidden="true"
      >
        <div ref={printRef} id="debt-report-printable">
          {printSheetNode}
        </div>
      </div>

      <PdfCaptureHost innerRef={pdfCaptureRef}>
        <div style={{ width: '210mm', backgroundColor: '#ffffff' }}>{printSheetNode}</div>
      </PdfCaptureHost>

      <WhatsAppShareChoiceModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        title={`تقرير الديون والمركز المالي — ${activeFilterLabel}`}
        textMessage={whatsAppText}
        pdfFileName={`تقرير_الديون_${formatLocalDate(new Date())}`}
        pdfCaption={`مرفق تقرير الديون والمركز المالي (${activeFilterLabel}) بتاريخ ${formatLocalDate(new Date())} بصيغة PDF`}
        onGeneratePdfBlob={generateReportPdfBlob}
      />
    </div>
  );
};

export default DebtReportView;
