import { useMemo, useState } from 'react';
import type { FC, ReactElement, RefObject } from 'react';
import {
  Calendar,
  Clock,
  CreditCard,
  Eye,
  FileDown,
  FileText,
  Layers,
  Loader2,
  Mail,
  Package,
  Phone,
  Printer,
  Truck,
  User,
} from 'lucide-react';
import type { QuotationDetailRow } from '@/features/sales/api/quotationsApi';
import { formatCurrency } from '@/core/utils/currencyUtils';
import { tafqeet } from '@/core/utils/tafqeet';
import PrintableQuotation from '../PrintableQuotation';
import { PdfCaptureHost } from '@/core/components/PdfCaptureHost';
import {
  mapQuotationToPrintData,
  statusToneClasses,
  type QuotationPrintData,
} from '../print/quotationPrintModel';

interface BodyFallbackProps {
  message: string;
  onRetry: () => void | Promise<void>;
}

const QuotationBodyFallback: FC<BodyFallbackProps> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{message}</p>
    <button
      type="button"
      onClick={() => {
        void onRetry();
      }}
      className="rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-indigo-700"
    >
      إعادة المحاولة
    </button>
  </div>
);

const currencyUnitName = (code: string): string => {
  switch (code.toUpperCase()) {
    case 'SAR':
      return 'ريال سعودي';
    case 'YER':
      return 'ريال يمني';
    case 'OMR':
      return 'ريال عماني';
    case 'USD':
      return 'دولار أمريكي';
    default:
      return code;
  }
};

const getRemainingDays = (validUntil: string): number | null => {
  if (validUntil.trim() === '') return null;
  const target = new Date(validUntil).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
};

const StructuredQuotationDetails: FC<{ data: QuotationPrintData }> = ({ data }) => {
  const { header } = data;
  const currency = header.currencyCode;
  const tone = statusToneClasses(header.statusTone);
  const daysLeft = getRemainingDays(header.validUntil);
  const totalQty = data.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="space-y-4">
      {/* Top 3 Info Cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Party Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/70">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              <User size={13} className="text-indigo-500" />
              بيانات {header.partyNoun}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone.chip} ${tone.text}`}
            >
              {header.statusLabel}
            </span>
          </div>
          <p className="text-sm font-extrabold text-slate-900 dark:text-white">
            {header.customerName !== '' ? header.customerName : header.partyFallbackName}
          </p>
          <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {header.customerPhone !== '' && (
              <div className="flex items-center gap-1.5">
                <Phone size={12} className="text-slate-400" />
                <span dir="ltr" className="font-mono">
                  {header.customerPhone}
                </span>
              </div>
            )}
            {header.customerEmail !== '' && (
              <div className="flex items-center gap-1.5">
                <Mail size={12} className="text-slate-400" />
                <span dir="ltr" className="truncate font-mono text-[11px]">
                  {header.customerEmail}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Dates & Validity Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/70">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              <Calendar size={13} className="text-blue-500" />
              التواريخ والصلاحية
            </span>
            {daysLeft !== null && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  daysLeft <= 0
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : daysLeft <= 3
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                }`}
              >
                <Clock size={10} />
                {daysLeft <= 0 ? 'منتهي الصلاحية' : `متبقي ${daysLeft} يوم`}
              </span>
            )}
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">رقم العرض:</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {header.number}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">تاريخ الإصدار:</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {header.issueDate || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">صالح حتى:</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {header.validUntil !== '' ? header.validUntil : 'غير محدد'}
              </span>
            </div>
          </div>
        </div>

        {/* Financial Highlight Card */}
        <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-blue-50/70 p-3.5 shadow-sm dark:border-indigo-800/60 dark:from-indigo-950/50 dark:via-slate-800 dark:to-slate-800">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
              <Layers size={13} />
              الإجمالي النهائي
            </span>
            <span className="rounded-md bg-indigo-100 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
              {currency}
            </span>
          </div>
          <div
            className="font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white"
            dir="ltr"
          >
            {formatCurrency(data.totalAmount, currency)}
          </div>
          <p className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-relaxed text-slate-600 dark:text-slate-300">
            فقط: {tafqeet(data.totalAmount, currencyUnitName(currency))}
          </p>
          <div className="mt-2 flex items-center gap-3 border-t border-indigo-200/60 pt-2 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Package size={11} className="text-indigo-500" />
              {data.items.length} صنف ({totalQty} قطعة)
            </span>
          </div>
        </div>
      </div>

      {/* Items Table Card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-800/70">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800">
          <h4 className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
            <Package size={14} className="text-indigo-500" />
            بنود عرض السعر
          </h4>
          <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
            {data.items.length} بند
          </span>
        </div>
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                <th className="w-10 px-3 py-2.5 text-center font-bold">#</th>
                <th className="px-3 py-2.5 font-bold">الصنف / رقم القطعة</th>
                <th className="px-3 py-2.5 text-center font-bold">الماركة</th>
                <th className="px-3 py-2.5 text-center font-bold">الكمية</th>
                <th className="px-3 py-2.5 text-center font-bold">سعر الوحدة</th>
                <th className="px-3 py-2.5 text-center font-bold">الخصم</th>
                <th className="px-3 py-2.5 text-center font-bold">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    لا توجد أصناف مسجلة في هذا العرض
                  </td>
                </tr>
              ) : (
                data.items.map((item, idx) => (
                  <tr
                    key={item.id || idx}
                    className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-700/30"
                  >
                    <td className="px-3 py-2.5 text-center font-mono text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-900 dark:text-white">{item.name}</div>
                      {item.code !== '' && (
                        <span
                          dir="ltr"
                          className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                        >
                          {item.code}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-600 dark:text-slate-300">
                      {item.brand || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex min-w-[28px] justify-center rounded-md bg-indigo-50 px-2 py-0.5 font-mono font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                        {item.quantity}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2.5 text-center font-mono font-semibold text-slate-700 dark:text-slate-200"
                      dir="ltr"
                    >
                      {formatCurrency(item.unitPrice, currency)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono">
                      {item.discountPercent > 0 ? (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          {item.discountPercent}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2.5 text-center font-mono font-extrabold text-slate-900 dark:text-white"
                      dir="ltr"
                    >
                      {formatCurrency(item.total, currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Summary Breakdown Bar */}
        <div className="flex flex-wrap items-center justify-end gap-4 border-t border-slate-200 bg-slate-50/80 px-4 py-3 text-xs dark:border-slate-700 dark:bg-slate-900/50">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400">المجموع الفرعي:</span>
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200" dir="ltr">
              {formatCurrency(data.subtotal, currency)}
            </span>
          </div>
          {data.discountAmount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400">الخصم:</span>
              <span className="font-mono font-bold text-rose-600 dark:text-rose-400" dir="ltr">
                - {formatCurrency(data.discountAmount, currency)}
              </span>
            </div>
          )}
          {data.taxAmount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400">الضريبة:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200" dir="ltr">
                {formatCurrency(data.taxAmount, currency)}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-white shadow-sm">
            <span className="font-bold">الصافي النهائي:</span>
            <span className="font-mono text-sm font-black" dir="ltr">
              {formatCurrency(data.totalAmount, currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Terms & Notes Grid */}
      {(data.paymentTerms !== '' ||
        data.deliveryTerms !== '' ||
        data.notes !== '' ||
        data.termsAndConditions !== '') && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.paymentTerms !== '' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <CreditCard size={12} className="text-emerald-500" />
                شروط الدفع
              </div>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                {data.paymentTerms}
              </p>
            </div>
          )}
          {data.deliveryTerms !== '' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <Truck size={12} className="text-blue-500" />
                شروط التسليم
              </div>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                {data.deliveryTerms}
              </p>
            </div>
          )}
          {data.notes !== '' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <FileText size={12} className="text-amber-500" />
                ملاحظات
              </div>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                {data.notes}
              </p>
            </div>
          )}
          {data.termsAndConditions !== '' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <FileText size={12} className="text-indigo-500" />
                الشروط والأحكام
              </div>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                {data.termsAndConditions}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface QuotationBodyProps {
  loading: boolean;
  quotation: QuotationDetailRow | null;
  errorText: string | null;
  onRetry: () => void | Promise<void>;
  onPrint?: (() => void) | undefined;
  exportPdf: () => void | Promise<void>;
  isExporting: boolean;
  printRef: RefObject<HTMLDivElement | null>;
  directPrintRef?: RefObject<HTMLDivElement | null> | undefined;
}

export const QuotationBody: FC<QuotationBodyProps> = ({
  loading,
  quotation,
  errorText,
  onRetry,
  onPrint,
  exportPdf,
  isExporting,
  printRef,
  directPrintRef,
}): ReactElement => {
  const [activeTab, setActiveTab] = useState<'details' | 'print'>('details');
  const printData = useMemo(
    () => (quotation !== null ? mapQuotationToPrintData(quotation) : null),
    [quotation]
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
        <span className="text-xs font-medium text-slate-400">جارٍ تحميل عرض السعر...</span>
      </div>
    );
  }
  if (quotation === null || printData === null) {
    return (
      <QuotationBodyFallback
        message={errorText ?? 'تعذّر تحميل عرض السعر'}
        onRetry={onRetry}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Top View Switcher & Quick Print/PDF Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/90 p-1.5 dark:border-slate-700/80 dark:bg-slate-800/80">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('details');
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'details'
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <FileText size={13} />
            تفاصيل عرض السعر
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('print');
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'print'
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Eye size={13} />
            معاينة الطباعة (A4)
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              void exportPdf();
            }}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            {isExporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
            PDF
          </button>
          <button
            type="button"
            onClick={() => {
              if (onPrint) onPrint();
              else window.print();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700"
          >
            <Printer size={13} />
            طباعة فورية
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'details' ? (
        <div className="custom-scrollbar max-h-[65vh] overflow-y-auto pl-0.5">
          <StructuredQuotationDetails data={printData} />
        </div>
      ) : (
        <div className="custom-scrollbar flex max-h-[68vh] justify-center overflow-auto rounded-xl border border-slate-200 bg-slate-200/80 p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="w-full max-w-[215mm] shrink-0 rounded-xl border border-slate-300 bg-white p-3 shadow-xl">
            <PrintableQuotation
              quotation={quotation}
              onPrint={onPrint}
              onExportPDF={() => {
                void exportPdf();
              }}
              isExporting={isExporting}
            />
          </div>
        </div>
      )}

      {/* Off-screen rendered print host (never display:none so logo & official header load eagerly) */}
      {directPrintRef !== undefined && (
        <div
          className="pointer-events-none fixed -left-[10000px] top-0 w-[210mm] opacity-0"
          aria-hidden="true"
        >
          <div ref={directPrintRef}>
            <PrintableQuotation quotation={quotation} hideToolbar />
          </div>
        </div>
      )}
      {isExporting && (
        <PdfCaptureHost innerRef={printRef}>
          <PrintableQuotation quotation={quotation} hideToolbar />
        </PdfCaptureHost>
      )}
    </div>
  );
};
