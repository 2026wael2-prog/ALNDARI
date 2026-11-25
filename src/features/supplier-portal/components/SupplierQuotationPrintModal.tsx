import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Printer, X, FileText, CheckCircle2 } from 'lucide-react';
import Modal from '../../../ui/base/Modal';
import Button from '../../../ui/base/Button';
import { formatCurrency } from '../../../core/utils';
import { formatLocalDate } from '../../../core/utils/dateUtils';
import { tafqeet } from '../../../core/utils/tafqeet';
import { ALNADARY_DEFAULT_PLAIN_NAME } from '../../../core/utils/alNadaryIdentity';
import type { PublicPortalContext } from '../types';
import { UniversalDocumentHeader } from '@/ui/common/UniversalDocumentHeader';

export interface QuotationPrintItem {
  id?: string | undefined;
  product_id?: string | null | undefined;
  description: string;
  oem_number?: string | null | undefined;
  brand?: string | null | undefined;
  quantity: number;
  unit_price: number;
  discount_percent?: number | null | undefined;
  total?: number | null | undefined;
  notes?: string | null | undefined;
}

export interface SupplierPrintQuotation {
  id?: string | undefined;
  quotation_number: string;
  issue_date: string;
  valid_until?: string | null | undefined;
  total_amount: number;
  currency_code?: string | undefined;
  status: string;
  notes?: string | null | undefined;
  delivery_terms?: string | null | undefined;
  payment_terms?: string | null | undefined;
  items?: QuotationPrintItem[] | undefined;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  quotation: SupplierPrintQuotation | null;
  context: PublicPortalContext | null;
}

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

export const SupplierQuotationPrintModal: React.FC<Props> = ({
  isOpen,
  onClose,
  quotation,
  context,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `عرض_سعر_مورد_${quotation?.quotation_number ?? ''}`,
  });

  if (!isOpen || !quotation || !context) return null;

  const { company, supplier } = context;
  const currency = quotation.currency_code || 'SAR';

  const calculatedSubtotal = (quotation.items || []).reduce((acc, item) => {
    return acc + Number(item.quantity || 0) * Number(item.unit_price || 0);
  }, 0);
  const calculatedDiscount = Math.max(0, calculatedSubtotal - Number(quotation.total_amount || 0));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="وثيقة عرض السعر الرسمية" size="xl" hideHeader>
      <div className="space-y-3 text-right sm:space-y-4" dir="rtl">
        {/* Action Controls (Hidden on paper print) */}
        <div className="no-print flex items-center justify-between gap-2 border-b border-[var(--app-border)] pb-2.5 print:hidden sm:pb-3">
          <div className="flex min-w-0 items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <FileText size={16} className="shrink-0" />
            <h3 className="truncate text-xs font-black text-[var(--app-text)] sm:text-sm">
              وثيقة عرض السعر الرسمية
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                handlePrint();
              }}
              className="flex items-center gap-1.5 bg-emerald-600 px-2.5 py-1 text-[11px] font-bold hover:bg-emerald-500 sm:px-3 sm:text-xs"
            >
              <Printer size={14} />
              <span>طباعة / PDF</span>
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Document Paper Sheet */}
        <div
          id="supplier-quotation-printable"
          ref={printRef}
          dir="rtl"
          className="rounded-xl border border-slate-300 bg-white p-2.5 text-right text-slate-900 shadow-lg print:border-none print:p-0 print:shadow-none sm:rounded-2xl sm:p-6"
        >
          {/* Document Header */}
          <div className="mb-4">
            <UniversalDocumentHeader
              company={{
                name: company.name_ar ?? ALNADARY_DEFAULT_PLAIN_NAME,
                phone: company.phone ?? undefined,
                address: company.address ?? undefined,
                tax_number: company.tax_number ?? undefined,
                logo_url: company.logo_url ?? undefined,
                slogan: 'إدارة المشتريات والتوريدات والعقود',
              }}
              documentTitle="عرض سعر توريد معتمد"
              documentNumber={quotation.quotation_number}
              documentDate={quotation.issue_date}
              statusBadge={
                quotation.status === 'accepted'
                  ? 'معتمد'
                  : quotation.status === 'rejected'
                    ? 'مرفوض'
                    : 'قيد المراجعة'
              }
            />
          </div>

          {/* Unified Supplier Info & Validity Card */}
          <div className="my-2.5 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs sm:my-3 sm:grid-cols-2 sm:gap-3 sm:p-3">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-slate-500">
                بيانات المورد المقدم للعرض:
              </span>
              <p className="text-sm font-black text-slate-900">{supplier.name}</p>
              {supplier.commercial_registration && (
                <p className="font-mono text-[10px] text-slate-600">
                  س.ت: {supplier.commercial_registration}
                </p>
              )}
              {Boolean(quotation.valid_until) && (
                <p className="text-[11px] text-slate-600">
                  <span className="font-bold text-slate-500">صالح لغاية: </span>
                  <span className="font-bold text-amber-700" dir="ltr">
                    {quotation.valid_until}
                  </span>
                </p>
              )}
            </div>
            <div className="space-y-0.5 text-left font-mono text-[11px] text-slate-600">
              {supplier.phone && (
                <p>
                  هاتف: <span dir="ltr">{supplier.phone}</span>
                </p>
              )}
              {supplier.email && <p>إيميل: {supplier.email}</p>}
              {supplier.tax_number && <p>الرقم الضريبي: {supplier.tax_number}</p>}
            </div>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-300 print:overflow-visible">
            <table className="w-full min-w-[520px] text-right text-[11px] sm:min-w-0 sm:text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 font-bold text-slate-700">
                  <th className="w-10 p-2.5 text-center">#</th>
                  <th className="p-2.5">بيان الصنف / الوصف</th>
                  <th className="p-2.5 text-center">رقم القطعة (OEM)</th>
                  <th className="p-2.5 text-center">الكمية</th>
                  <th className="p-2.5 text-center">سعر الوحدة</th>
                  <th className="p-2.5 text-center">الخصم</th>
                  <th className="p-2.5 text-center">الإجمالي ({currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(quotation.items || []).map((item, idx) => {
                  const itemSubtotal = item.quantity * item.unit_price;
                  const discountAmount = (itemSubtotal * (item.discount_percent || 0)) / 100;
                  const lineTotal = item.total ?? itemSubtotal - discountAmount;

                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2.5 text-center font-mono text-[11px] text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="p-2.5 font-bold text-slate-900">
                        {item.description}
                        {item.notes && (
                          <p className="text-[10px] font-normal text-slate-500">{item.notes}</p>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold text-slate-600">
                        {item.oem_number || '---'}
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-slate-900">
                        {item.quantity}
                      </td>
                      <td className="p-2.5 text-center font-mono text-slate-800">
                        {formatCurrency(item.unit_price, currency)}
                      </td>
                      <td className="p-2.5 text-center font-mono text-slate-600">
                        {item.discount_percent ? `${item.discount_percent}%` : '0%'}
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-emerald-700">
                        {formatCurrency(lineTotal, currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals and Terms Summary */}
          <div className="mt-4 grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            {/* Terms and Notes */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
              <h4 className="text-xs font-black text-slate-900">الشروط والأحكام:</h4>
              {quotation.delivery_terms && (
                <p>
                  🚚 <strong>شروط التسليم:</strong> {quotation.delivery_terms}
                </p>
              )}
              {quotation.payment_terms && (
                <p>
                  💳 <strong>شروط الدفع:</strong> {quotation.payment_terms}
                </p>
              )}
              {quotation.notes && (
                <p>
                  📝 <strong>ملاحظات المورد:</strong> {quotation.notes}
                </p>
              )}
            </div>

            {/* Financial Summary Box */}
            <div className="space-y-1.5 rounded-xl border border-slate-300 bg-slate-100 p-3 font-mono text-xs">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي:</span>
                <span className="font-bold">{formatCurrency(calculatedSubtotal, currency)}</span>
              </div>
              {calculatedDiscount > 0.01 && (
                <div className="flex justify-between text-rose-600">
                  <span>إجمالي الخصم:</span>
                  <span className="font-bold">-{formatCurrency(calculatedDiscount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-300 pt-1.5 text-sm font-black text-emerald-800">
                <span>المجموع الإجمالي النهائي:</span>
                <span>{formatCurrency(quotation.total_amount, currency)}</span>
              </div>
              <p className="pt-1 font-sans text-[11px] font-bold text-slate-700">
                فقط: {tafqeet(quotation.total_amount, currencyUnitOf(currency))}
              </p>
            </div>
          </div>

          {/* Footer Official Note */}
          <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-3 text-[10px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-600" />
              <span>تم إنشاء هذا المستند إلكترونياً وموثق برقم تسلسلي عبر بوابة الموردين</span>
            </div>
            <span dir="ltr">تاريخ الطباعة: {formatLocalDate()}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default SupplierQuotationPrintModal;
