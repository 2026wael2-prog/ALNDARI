import { formatCurrency } from '../../../core/utils';
import { exportToPDF } from '../../../core/utils/pdfExporter';
import { tafqeet } from '../../../core/utils/tafqeet';
import { ALNADARY_DEFAULT_PLAIN_NAME } from '../../../core/utils/alNadaryIdentity';
import type { QuotationItemDraft } from '../types';

export interface PDFQuotationOptions {
  companyName: string;
  companyAddress?: string;
  companyTaxNumber?: string;
  supplierName: string;
  quotationNumber: string;
  revisionNumber: number;
  issueDate: string;
  validUntil?: string | null;
  currency: string;
  items: QuotationItemDraft[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  deliveryDays?: number;
  warrantyDays?: number;
  terms?: string | null;
  notes?: string | null;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const currencyUnitOf = (code: string): string => {
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

/**
 * يصدّر عرض سعر المورد إلى ملف PDF عبر توليد مستند HTML عربي (RTL) مع رمز QR
 * ثم التقاطه عبر `exportToPDF` لضمان ظهور النص العربي بخط سليم بدلاً من خط Helvetica
 * الذي لا يدعم العربية في jsPDF.
 */
export const generateQuotationPDF = async (options: PDFQuotationOptions): Promise<void> => {
  if (typeof document === 'undefined') return;

  const QRCode = await import('qrcode');
  const verificationPayload = JSON.stringify({
    quotation: options.quotationNumber,
    rev: options.revisionNumber,
    total: options.totalAmount,
    currency: options.currency,
    supplier: options.supplierName,
    date: options.issueDate,
  });

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(verificationPayload, { width: 120, margin: 1 });
  } catch {
    qrDataUrl = '';
  }

  const companyName = escapeHtml(options.companyName || ALNADARY_DEFAULT_PLAIN_NAME);
  const supplierName = escapeHtml(options.supplierName || 'مورد');
  const quotationNumber = escapeHtml(options.quotationNumber || 'Quotation');
  const currencyUnit = currencyUnitOf(options.currency || 'SAR');
  const amountWords = escapeHtml(tafqeet(options.totalAmount, currencyUnit));

  const rowsHtml = options.items
    .map(
      (item, index) => `
      <tr style="background:${index % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;">${index + 1}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;font-weight:700;">${escapeHtml(item.product_name || '---')}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-family:monospace;" dir="ltr">${escapeHtml(item.oem_number || '---')}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;">${item.quantity} ${escapeHtml(item.unit_of_measure || '')}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-family:monospace;" dir="ltr">${escapeHtml(formatCurrency(item.unit_price, options.currency))}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-family:monospace;font-weight:700;" dir="ltr">${escapeHtml(formatCurrency(item.total_price, options.currency))}</td>
      </tr>`
    )
    .join('');

  const host = document.createElement('div');
  host.className = 'pdf-capture-host';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = `
    <div dir="rtl" style="width:794px;background:#ffffff;color:#0f172a;padding:24px;font-family:'Cairo','Tajawal',Tahoma,Arial,sans-serif;box-sizing:border-box;">
      <div style="background:#1e293b;color:#ffffff;padding:16px 20px;border-radius:8px;text-align:center;margin-bottom:16px;">
        <div style="font-size:18px;font-weight:900;">عرض سعر مورد رسمي</div>
        <div style="font-size:12px;margin-top:4px;opacity:0.9;" dir="ltr">${quotationNumber} (Rev ${options.revisionNumber})</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;">
        <div>
          <div style="font-weight:800;color:#475569;margin-bottom:4px;">الجهة الطالبة:</div>
          <div style="font-weight:900;font-size:13px;">${companyName}</div>
          ${options.companyAddress ? `<div>${escapeHtml(options.companyAddress)}</div>` : ''}
          ${options.companyTaxNumber ? `<div dir="ltr" style="text-align:right;">الرقم الضريبي: ${escapeHtml(options.companyTaxNumber)}</div>` : ''}
        </div>
        <div>
          <div style="font-weight:800;color:#475569;margin-bottom:4px;">المورد:</div>
          <div style="font-weight:900;font-size:13px;">${supplierName}</div>
          <div>التاريخ: <span dir="ltr">${escapeHtml(options.issueDate)}</span> | الصلاحية: ${escapeHtml(options.validUntil || '30 يوماً')}</div>
          <div>التوريد: ${options.deliveryDays || 3} أيام | العملة: ${escapeHtml(currencyUnit)}</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:16px;">
        <thead>
          <tr style="background:#1e1b4b;color:#ffffff;">
            <th style="border:1px solid #1e1b4b;padding:7px;width:6%;">#</th>
            <th style="border:1px solid #1e1b4b;padding:7px;text-align:right;width:36%;">بيان الصنف</th>
            <th style="border:1px solid #1e1b4b;padding:7px;width:16%;">رقم القطعة</th>
            <th style="border:1px solid #1e1b4b;padding:7px;width:12%;">الكمية</th>
            <th style="border:1px solid #1e1b4b;padding:7px;width:15%;">سعر الوحدة</th>
            <th style="border:1px solid #1e1b4b;padding:7px;width:15%;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;" data-pdf-break>
        <div style="flex:1;font-size:11.5px;">
          ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR" style="width:88px;height:88px;border:1px solid #cbd5e1;padding:3px;border-radius:4px;" />` : ''}
          ${
            options.terms || options.notes
              ? `<div style="margin-top:8px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;padding:8px;">
                  <div style="font-weight:800;margin-bottom:2px;">الشروط والملاحظات:</div>
                  <div>${escapeHtml(options.terms || options.notes || '')}</div>
                </div>`
              : ''
          }
        </div>
        <div style="width:270px;border:1px solid #cbd5e1;border-radius:8px;padding:10px;background:#f8fafc;font-size:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>المجموع الفرعي:</span>
            <strong dir="ltr">${escapeHtml(formatCurrency(options.subtotal, options.currency))}</strong>
          </div>
          ${
            options.discountAmount > 0
              ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:#b91c1c;">
                  <span>الخصم:</span>
                  <strong dir="ltr">-${escapeHtml(formatCurrency(options.discountAmount, options.currency))}</strong>
                </div>`
              : ''
          }
          ${
            options.taxAmount > 0
              ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span>الضريبة:</span>
                  <strong dir="ltr">${escapeHtml(formatCurrency(options.taxAmount, options.currency))}</strong>
                </div>`
              : ''
          }
          <div style="display:flex;justify-content:space-between;border-top:1px solid #94a3b8;padding-top:6px;margin-top:6px;font-size:13px;font-weight:900;color:#065f46;">
            <span>الإجمالي النهائي:</span>
            <span dir="ltr">${escapeHtml(formatCurrency(options.totalAmount, options.currency))}</span>
          </div>
          <div style="margin-top:6px;font-size:11px;font-weight:700;color:#334155;">فقط: ${amountWords}</div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(host);
  try {
    const target = host.firstElementChild as HTMLElement | null;
    await exportToPDF(
      target,
      `${options.quotationNumber || 'Quotation'}_Rev${options.revisionNumber}`,
      { pageSize: 'a4', orientation: 'p', marginMm: 8, scale: 2 }
    );
  } finally {
    host.remove();
  }
};
