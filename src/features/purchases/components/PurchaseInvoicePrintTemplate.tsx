/* eslint-disable @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing */
import React from 'react';
import { tafqeet } from '../../../core/utils/tafqeet';
import { useCompany } from '../../settings/hooks';
import { useInvoiceSettings } from '../../settings/settingsStore';
import { AlNadaryPrintShell } from '@/ui/print/AlNadaryPrintShell';

export interface PurchasePrintParty {
  name: string | null;
  phone: string | null;
  address: string | null;
}

export interface PurchasePrintItem {
  id: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  unit?: string | null;
  notes?: string | null;
  product: {
    name_ar: string | null;
    sku: string | null;
    part_number?: string | null;
    brand?: string | null;
    unit?: string | null;
  } | null;
}

export interface PurchasePrintInvoice {
  invoice_number: string | null;
  issue_date: string;
  due_date: string | null;
  type?: string | null;
  party: PurchasePrintParty | null;
  invoice_items: PurchasePrintItem[] | null;
  subtotal: number | null;
  subtotal_document_amount?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  paid_amount?: number | null;
  currency_code?: string | null;
  exchange_rate?: number | null;
  payment_method?: string | null;
  total_amount: number;
  total_document_amount?: number | null;
  notes: string | null;
}

interface PurchaseInvoicePrintTemplateProps {
  invoice: PurchasePrintInvoice | null;
}

const roundTwo = (value: number): number => Math.round(value * 100) / 100;

const formatNum = (val: number): string => {
  if (!Number.isFinite(val)) return '0';
  return Number.isInteger(val)
    ? val.toLocaleString('en-US')
    : val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const currencyUnitOf = (code?: string | null): string => {
  const upper = (code ?? 'SAR').toUpperCase();
  if (upper === 'SAR') return 'ريال سعودي';
  if (upper === 'YER') return 'ريال يمني';
  if (upper === 'OMR') return 'ريال عماني';
  if (upper === 'USD') return 'دولار أمريكي';
  return code ?? 'ريال سعودي';
};

const paymentMethodLabelOf = (method?: string | null): string => {
  switch ((method ?? '').toLowerCase()) {
    case 'credit':
      return 'آجل';
    case 'bank':
    case 'transfer':
      return 'تحويل بنكي';
    case 'card':
    case 'network':
      return 'شبكة / بطاقة';
    default:
      return 'نقداً';
  }
};

const PurchaseInvoicePrintTemplate = React.forwardRef<
  HTMLDivElement,
  PurchaseInvoicePrintTemplateProps
>(({ invoice }, ref) => {
  const { data: settingsCompany } = useCompany();
  const invoiceSettings = useInvoiceSettings();

  if (invoice === null) return null;

  const currencyCode = (invoice.currency_code || 'SAR').toUpperCase();
  const isForeign = currencyCode !== 'SAR';
  const currencyUnit = currencyUnitOf(currencyCode);

  const baseTotal = Number(invoice.total_amount) || 0;
  const docTotal = Number(invoice.total_document_amount) || 0;
  const rawRate = Number(invoice.exchange_rate) || 0;
  const itemsSum = (invoice.invoice_items ?? []).reduce(
    (sum, item) => sum + (Number(item.total) || Number(item.quantity) * Number(item.unit_price) || 0),
    0
  );

  let baseToDoc = 1;
  if (isForeign) {
    if (docTotal > 0 && baseTotal > 0 && Math.abs(docTotal - baseTotal) > 0.01) {
      const rateInverse = rawRate > 0 && Math.abs(rawRate - 1) > 1e-6 ? 1 / rawRate : 0;
      if (rateInverse > 0 && Math.abs(baseTotal * rateInverse - docTotal) / docTotal < 0.02) {
        baseToDoc = rateInverse;
      } else {
        baseToDoc = docTotal / baseTotal;
      }
    } else if (docTotal <= 0 && baseTotal > 0 && rawRate > 0 && Math.abs(rawRate - 1) > 1e-6) {
      const invertedTotal = baseTotal / rawRate;
      if (itemsSum <= 0 || Math.abs(invertedTotal - itemsSum) / Math.max(itemsSum, 1) < 0.25) {
        baseToDoc = 1 / rawRate;
      }
    }
  }

  const total =
    isForeign && docTotal > 0
      ? roundTwo(docTotal)
      : baseToDoc !== 1
        ? roundTwo(baseTotal * baseToDoc)
        : baseTotal;
  const discount = roundTwo((Number(invoice.discount_amount) || 0) * baseToDoc);
  const tax = roundTwo((Number(invoice.tax_amount) || 0) * baseToDoc);
  const rawPaid = Number(invoice.paid_amount) || 0;
  let paid =
    baseToDoc !== 1 && rawPaid > 0 && Math.abs(rawPaid - baseTotal) <= 0.01
      ? total
      : roundTwo(rawPaid * baseToDoc);
  if (baseToDoc !== 1 && paid > 0 && Math.abs(total - paid) <= Math.max(0.5, total * 0.0005)) {
    paid = total;
  }
  const remaining = roundTwo(Math.max(0, total - paid));

  const isReturn = invoice.type === 'purchase_return' || invoice.type === 'return_purchase';
  const supplierDisplay = invoice.party?.phone
    ? `${invoice.party?.name ?? 'مورد عام'}   ${invoice.party.phone}`
    : (invoice.party?.name ?? 'مورد عام');
  const paymentLabel = paymentMethodLabelOf(invoice.payment_method);

  return (
    <div ref={ref} className="w-full bg-white text-black" dir="rtl">
      <AlNadaryPrintShell
        documentTitle={isReturn ? 'فاتورة مرتجع مشتريات' : 'فاتورة مشتريات'}
        documentDate={invoice.issue_date}
        documentNumber={invoice.invoice_number ?? '---'}
        documentNumberLabel="رقم الفاتورة"
        company={{
          nameAr: invoiceSettings.company_name_ar || settingsCompany?.name_ar,
          logoUrl: settingsCompany?.logo_url,
          address: invoiceSettings.company_address || settingsCompany?.address,
          phone: invoiceSettings.company_phone || settingsCompany?.phone,
        }}
        rightMeta={[
          { label: 'المورد', value: supplierDisplay },
          ...(invoice.party?.address ? [{ label: 'العنوان', value: invoice.party.address }] : []),
        ]}
        leftMeta={[
          { label: 'طريقة الدفع', value: paymentLabel },
          ...(invoice.due_date ? [{ label: 'تاريخ الاستحقاق', value: invoice.due_date, dir: 'ltr' as const }] : []),
        ]}
        showDefaultTerms={false}
        signatures={['مسؤول المشتريات', 'المحاسب', 'المدير العام']}
      >
        <table className="alnadary-table">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>م</th>
              <th style={{ width: '41%' }}>اسم المادة</th>
              <th style={{ width: '8%' }}>الكمية</th>
              <th style={{ width: '10%' }}>السعر</th>
              <th style={{ width: '9%' }}>الوحدة</th>
              <th style={{ width: '12%' }}>إجمالي</th>
              <th style={{ width: '15%' }}>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {!invoice.invoice_items || invoice.invoice_items.length === 0 ? (
              <tr>
                <td colSpan={7} className="alnadary-td-center" style={{ padding: '14px' }}>
                  لا توجد أصناف مسجلة في هذه الفاتورة
                </td>
              </tr>
            ) : (
              invoice.invoice_items.map((item, idx) => (
                <tr key={item.id || idx}>
                  <td className="alnadary-td-center">{idx + 1}</td>
                  <td className="alnadary-td-right">
                    <div>{item.product?.name_ar || item.description || 'بدون وصف'}</div>
                    {(item.product?.part_number || item.product?.sku) && (
                      <div style={{ fontSize: '10px', fontWeight: 600 }} dir="ltr">
                        {item.product.part_number || item.product.sku}
                      </div>
                    )}
                  </td>
                  <td className="alnadary-td-num">{formatNum(item.quantity)}</td>
                  <td className="alnadary-td-num">{formatNum(item.unit_price)}</td>
                  <td className="alnadary-td-center">{item.unit || item.product?.unit || ''}</td>
                  <td className="alnadary-td-num">{formatNum(item.total)}</td>
                  <td className="alnadary-td-center">{item.notes || ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="alnadary-totals-section">
          <div className="alnadary-total-bar">
            <div className="alnadary-total-bar-label">الإجمالي</div>
            <div className="alnadary-total-bar-words">{tafqeet(total, currencyUnit)}</div>
            <div className="alnadary-total-bar-amount">{formatNum(total)}</div>
          </div>

          <div className="alnadary-inline-summary">
            {discount > 0 && (
              <span>
                الخصم : <span dir="ltr">{formatNum(discount)}</span>
              </span>
            )}
            {tax > 0 && (
              <span>
                الضريبة : <span dir="ltr">{formatNum(tax)}</span>
              </span>
            )}
            <span>
              المدفوع : <span dir="ltr">{formatNum(paid)}</span>
            </span>
            <span>العملة : {currencyUnit}</span>
          </div>

          <div className="alnadary-remaining-row">
            <div style={{ fontWeight: 900 }}>المتبقي بالفاتورة :</div>
            <div style={{ fontWeight: 900, textAlign: 'center' }} dir="ltr">
              {formatNum(remaining)}
            </div>
            <div className="alnadary-remaining-words-box">
              {remaining > 0 ? tafqeet(remaining, currencyUnit) : 'صفر لا غير'}
            </div>
          </div>

          {invoice.notes && (
            <div className="alnadary-notes-box">
              <span>ملاحظات : </span>
              <span>{invoice.notes}</span>
            </div>
          )}
        </div>
      </AlNadaryPrintShell>
    </div>
  );
});

PurchaseInvoicePrintTemplate.displayName = 'PurchaseInvoicePrintTemplate';

export default PurchaseInvoicePrintTemplate;
