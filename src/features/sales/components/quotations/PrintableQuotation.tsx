// ============================================
// قالب طباعة عرض السعر الموحد لشركة النظاري
// ============================================
// يعتمد على القالب الرسمي الموحد AlNadaryPrintShell (نفس ترويسة وشعار ونمط
// الفاتورة الرسمية A4 RTL) مع إظهار عملة العرض بدقة والتفقيط والشروط والتوقيعات.

import { useMemo } from 'react';
import type { FC, ReactElement } from 'react';
import { FileDown, Loader2, Printer } from 'lucide-react';
import { formatCurrency } from '@/core/utils/currencyUtils';
import { tafqeet } from '@/core/utils/tafqeet';
import { useCompany } from '@/features/settings/hooks';
import { useInvoiceSettings } from '@/features/settings/settingsStore';
import { AlNadaryPrintShell } from '@/ui/print/AlNadaryPrintShell';
import type { QuotationDetailRow } from '../../api/quotationsApi';
import {
  mapQuotationToPrintData,
  type QuotationPrintData,
  type QuotationPrintItem,
} from './print/quotationPrintModel';

export interface PrintableQuotationProps {
  quotation: QuotationDetailRow;
  onPrint?: (() => void) | undefined;
  onExportPDF?: (() => void) | undefined;
  isExporting?: boolean | undefined;
  /** إخفاء شريط الأزرار العلوي عند الاستخدام داخل حاوية الطباعة المباشرة أو تصدير PDF */
  hideToolbar?: boolean | undefined;
}

const currencyUnitLabel = (code: string): string => {
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

const formatNum = (val: number): string => {
  if (!Number.isFinite(val)) return '0';
  return Number.isInteger(val)
    ? val.toLocaleString('en-US')
    : val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const pick = (primary: string, fallback: string): string =>
  primary.trim() !== '' ? primary.trim() : fallback.trim();

const QuotationPrintItemsTable = ({
  items,
}: {
  items: QuotationPrintItem[];
}): ReactElement => (
  <table className="alnadary-table">
    <thead>
      <tr>
        <th style={{ width: '5%' }}>م</th>
        <th style={{ width: '38%' }}>اسم المادة / رقم القطعة</th>
        <th style={{ width: '11%' }}>الماركة</th>
        <th style={{ width: '8%' }}>الكمية</th>
        <th style={{ width: '13%' }}>سعر الوحدة</th>
        <th style={{ width: '8%' }}>خصم %</th>
        <th style={{ width: '17%' }}>الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      {items.length === 0 ? (
        <tr>
          <td colSpan={7} className="alnadary-td-center" style={{ padding: '14px' }}>
            لا توجد أصناف مسجلة في عرض السعر هذا
          </td>
        </tr>
      ) : (
        items.map((item, idx) => (
          <tr key={item.id || idx}>
            <td className="alnadary-td-center">{idx + 1}</td>
            <td className="alnadary-td-right">
              <div style={{ fontWeight: 700 }}>{item.name}</div>
              {item.code !== '' && (
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#333333' }} dir="ltr">
                  {item.code}
                </div>
              )}
            </td>
            <td className="alnadary-td-center">{item.brand || '—'}</td>
            <td className="alnadary-td-num">{formatNum(item.quantity)}</td>
            <td className="alnadary-td-num">{formatNum(item.unitPrice)}</td>
            <td className="alnadary-td-center">
              {item.discountPercent > 0 ? `${formatNum(item.discountPercent)}%` : '—'}
            </td>
            <td className="alnadary-td-num">{formatNum(item.total)}</td>
          </tr>
        ))
      )}
    </tbody>
  </table>
);

const QuotationPrintTotalsAndTerms = ({ data }: { data: QuotationPrintData }): ReactElement => {
  const currency = data.header.currencyCode;
  const currencyName = currencyUnitLabel(currency);
  const amountInWords = `فقط ${tafqeet(data.totalAmount, currencyName)}`;
  const hasTermsOrNotes =
    data.paymentTerms !== '' ||
    data.deliveryTerms !== '' ||
    data.notes !== '' ||
    data.termsAndConditions !== '';

  return (
    <div className="alnadary-totals-section">
      {/* شريط الإجمالي النهائي + التفقيط الرسمي */}
      <div className="alnadary-total-bar">
        <div className="alnadary-total-bar-label">الإجمالي النهائي</div>
        <div className="alnadary-total-bar-words">{amountInWords}</div>
        <div className="alnadary-total-bar-amount" dir="ltr">
          {formatCurrency(data.totalAmount, currency)}
        </div>
      </div>

      {/* ملخص فرعي مختصر (المجموع الفرعي / الخصم / الضريبة / العملة / عدد الأصناف) */}
      <div className="alnadary-inline-summary">
        <span>
          المجموع الفرعي : <span dir="ltr">{formatCurrency(data.subtotal, currency)}</span>
        </span>
        {data.discountAmount > 0 && (
          <span>
            الخصم : <span dir="ltr">- {formatCurrency(data.discountAmount, currency)}</span>
          </span>
        )}
        {data.taxAmount > 0 && (
          <span>
            الضريبة : <span dir="ltr">{formatCurrency(data.taxAmount, currency)}</span>
          </span>
        )}
        <span>العملة : {currencyName}</span>
        <span>عدد الأصناف : {data.items.length}</span>
      </div>

      {/* شروط العرض والملاحظات */}
      {hasTermsOrNotes && (
        <div
          className="alnadary-notes-box"
          style={{ display: 'flex', flexDirection: 'column', gap: '4px', lineHeight: 1.6 }}
        >
          {data.paymentTerms !== '' && (
            <div>
              <span style={{ fontWeight: 900 }}>شروط الدفع : </span>
              <span style={{ fontWeight: 600 }}>{data.paymentTerms}</span>
            </div>
          )}
          {data.deliveryTerms !== '' && (
            <div>
              <span style={{ fontWeight: 900 }}>شروط التسليم : </span>
              <span style={{ fontWeight: 600 }}>{data.deliveryTerms}</span>
            </div>
          )}
          {data.notes !== '' && (
            <div>
              <span style={{ fontWeight: 900 }}>ملاحظات : </span>
              <span style={{ fontWeight: 600 }}>{data.notes}</span>
            </div>
          )}
          {data.termsAndConditions !== '' && (
            <div>
              <span style={{ fontWeight: 900 }}>الشروط والأحكام : </span>
              <span style={{ fontWeight: 600 }}>{data.termsAndConditions}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const PrintableQuotation: FC<PrintableQuotationProps> = ({
  quotation,
  onPrint,
  onExportPDF,
  isExporting = false,
  hideToolbar = false,
}) => {
  const { data: company } = useCompany();
  const settings = useInvoiceSettings();
  const data = useMemo(() => mapQuotationToPrintData(quotation), [quotation]);

  const isPurchase = quotation.type === 'purchase';
  const docTitle = isPurchase ? 'طلب عرض سعر مشتريات' : 'عرض سعر مبيعات';
  const partyName =
    data.header.customerName !== '' ? data.header.customerName : data.header.partyFallbackName;
  const partyDisplay =
    data.header.customerPhone !== ''
      ? `${partyName}   —   ${data.header.customerPhone}`
      : partyName;

  const quotationTerms: readonly string[] = isPurchase
    ? [
        'يرجى تأكيد توفر الأصناف والأسعار خلال مدة صلاحية الطلب',
        'الأسعار المعتمدة تشمل مطابقة أرقام القطع والمواصفات المطلوبة',
      ]
    : [
        data.header.validUntil !== ''
          ? `هذا العرض ساري المفعول حتى تاريخ ${data.header.validUntil}`
          : 'الأسعار قابلة للتغيير حسب توفر المخزون وقت التأكيد',
        'يرجى مراجعة أرقام القطع والمواصفات قبل الاعتماد النهائي',
      ];

  const quotationSignatures: readonly [string, string, string] = isPurchase
    ? ['إعداد المشتريات', 'اعتماد الإدارة', 'توقيع المورد']
    : ['إعداد المبيعات', 'اعتماد الإدارة', 'موافقة العميل'];

  return (
    <div className="w-full bg-white text-black">
      {!hideToolbar && (
        <div className="no-print mb-2.5 flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 sm:mb-3 sm:gap-2 sm:px-3 sm:py-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 sm:gap-2 sm:text-xs">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <span className="sm:hidden">معاينة الطباعة (A4)</span>
            <span className="hidden sm:inline">معاينة الطباعة الرسمية (A4 — مع ترويسة شركة النظاري)</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {onExportPDF !== undefined && (
              <button
                type="button"
                onClick={onExportPDF}
                disabled={isExporting}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-50 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs"
              >
                {isExporting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <FileDown size={13} />
                )}
                <span>PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={
                onPrint ??
                (() => {
                  window.print();
                })
              }
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-xs"
            >
              <Printer size={13} />
              <span>طباعة</span>
            </button>
          </div>
        </div>
      )}

      <AlNadaryPrintShell
        documentTitle={docTitle}
        documentDate={data.header.issueDate}
        documentNumber={data.header.number}
        documentNumberLabel="رقم العرض"
        hideLetterhead={false}
        company={{
          nameAr: pick(settings.company_name_ar, company?.name_ar ?? ''),
          logoUrl: company?.logo_url ?? '',
          address: pick(settings.company_address, company?.address ?? ''),
          phone: pick(settings.company_phone, company?.phone ?? ''),
        }}
        rightMeta={[
          { label: `السادة / ${data.header.partyNoun}`, value: partyDisplay },
          ...(data.header.customerEmail !== ''
            ? [{ label: 'البريد الإلكتروني', value: data.header.customerEmail }]
            : []),
        ]}
        leftMeta={[
          {
            label: 'صالح حتى',
            value: data.header.validUntil !== '' ? data.header.validUntil : 'غير محدد',
          },
          { label: 'العملة', value: currencyUnitLabel(data.header.currencyCode) },
          { label: 'حالة العرض', value: data.header.statusLabel },
        ]}
        terms={quotationTerms}
        signatures={quotationSignatures}
      >
        <QuotationPrintItemsTable items={data.items} />
        <QuotationPrintTotalsAndTerms data={data} />
      </AlNadaryPrintShell>
    </div>
  );
};

export default PrintableQuotation;
