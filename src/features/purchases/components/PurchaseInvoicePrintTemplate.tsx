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
  party: PurchasePrintParty | null;
  invoice_items: PurchasePrintItem[] | null;
  subtotal: number | null;
  discount_amount?: number | null;
  paid_amount?: number | null;
  currency_code?: string | null;
  payment_method?: string | null;
  total_amount: number;
  notes: string | null;
}

interface PurchaseInvoicePrintTemplateProps {
  invoice: PurchasePrintInvoice | null;
}

const formatNum = (val: number): string => {
  if (!Number.isFinite(val)) return '0';
  return Number.isInteger(val)
    ? val.toLocaleString('en-US')
    : val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const currencyUnitOf = (code?: string | null): string => {
  if (!code || code === 'SAR') return 'ريال سعودي';
  if (code === 'YER') return 'ريال يمني';
  if (code === 'OMR') return 'ريال عماني';
  return code;
};

const PurchaseInvoicePrintTemplate = React.forwardRef<
  HTMLDivElement,
  PurchaseInvoicePrintTemplateProps
>(({ invoice }, ref) => {
  const { data: settingsCompany } = useCompany();
  const invoiceSettings = useInvoiceSettings();

  if (invoice === null) return null;

  const currencyUnit = currencyUnitOf(invoice.currency_code);
  const total = Number(invoice.total_amount) || 0;
  const discount = Number(invoice.discount_amount) || 0;
  const paid = Number(invoice.paid_amount) || 0;
  const remaining = Math.max(0, total - paid);
  const supplierDisplay = invoice.party?.phone
    ? `${invoice.party?.name ?? 'مورد عام'}   ${invoice.party.phone}`
    : (invoice.party?.name ?? 'مورد عام');
  const paymentLabel = invoice.payment_method === 'credit' ? 'آجل' : 'نقداً';

  return (
    <div ref={ref} className="w-full bg-white text-black" dir="rtl">
      <AlNadaryPrintShell
        documentTitle="فاتورة مشتريات"
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
