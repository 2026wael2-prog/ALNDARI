import React, { useRef, useState } from 'react';
import {
  FileText,
  Printer,
  MessageCircle,
  Download,
  X,
  Maximize2,
  Minimize2,
  CreditCard,
  User,
  ShieldCheck,
} from 'lucide-react';
import type { Bond } from '../types';
import { formatCurrency, formatLocalDate, cn } from '../../../core/utils';
import { tafqeet } from '../../../core/utils/tafqeet';
import { exportSingleBondToExcel } from '../../../core/utils/bondExcelExporter';
import { useCompany } from '../../settings/hooks';
import { useInvoiceSettings, useDocumentHeaderSettings } from '../../settings/settingsStore';
import { UniversalDocumentHeader } from '@/ui/common/UniversalDocumentHeader';
import { buildWhatsappHeader } from '@/core/utils/whatsappHeader';
import { logger } from '../../../core/utils/logger';

interface BondVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  bond: Bond | null;
}

export const BondVoucherModal: React.FC<BondVoucherModalProps> = ({ isOpen, onClose, bond }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { data: settingsCompany } = useCompany();
  const invoiceSettings = useInvoiceSettings();
  const headerConfig = useDocumentHeaderSettings();

  if (!isOpen || !bond) return null;

  const company = {
    name_ar: invoiceSettings?.company_name_ar || settingsCompany?.name_ar || 'اسم المنشأة التجارية',
    address: invoiceSettings?.company_address || settingsCompany?.address || '',
    phone: invoiceSettings?.company_phone || settingsCompany?.phone || '',
    tax_number: settingsCompany?.tax_number || '---',
    logo_url: settingsCompany?.logo_url || '',
  };

  const isReceipt = bond.type === 'receipt';
  const isPayment = bond.type === 'payment';

  const voucherTitle = isReceipt ? 'سند قبض' : isPayment ? 'سند صرف' : 'سند تحويل مالي';
  const personLabel = isReceipt
    ? 'استلمنا من السيد / السادة:'
    : isPayment
      ? 'صرفنا إلى السيد / السادة:'
      : 'تحويل لصالح:';
  const forWhatLabel = isReceipt ? 'وذلك مقابل:' : isPayment ? 'وذلك عن:' : 'الغرض من التحويل:';

  const currencySymbol =
    bond.currency_code === 'SAR'
      ? 'ريال سعودي'
      : bond.currency_code === 'YER'
        ? 'ريال يمني'
        : bond.currency_code;
  const tafqeetText = tafqeet(bond.amount, currencySymbol);

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = async () => {
    try {
      await exportSingleBondToExcel(company, bond);
    } catch (err) {
      logger.error('BondVoucherModal', 'Excel export failed', err);
    }
  };

  const handleWhatsApp = async () => {
    try {
      const { generateSingleBondExcelBlob } = await import('../../../core/utils/bondExcelExporter');
      const blob = await generateSingleBondExcelBlob(company, bond);
      const file = new File(
        [blob],
        `${voucherTitle.replace(/\s/g, '_')}_${bond.payment_number}.xlsx`,
        {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
      );

      const waHeader = headerConfig?.whatsapp
        ? buildWhatsappHeader(headerConfig.whatsapp, {
            name: headerConfig.details.companyNameOverride || company.name_ar,
            phone: company.phone || undefined,
            taxNumber: company.tax_number || undefined,
            slogan: headerConfig.details.sloganText || undefined,
          })
        : '';
      const shareText = `${waHeader}مرفق ${voucherTitle} رقم ${bond.payment_number}\nالمبلغ: ${formatCurrency(bond.amount)} ${bond.currency_code}`;

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${voucherTitle} ${bond.payment_number}`,
          text: shareText,
        });
      } else {
        await exportSingleBondToExcel(company, bond);
        const text = encodeURIComponent(shareText);
        window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      logger.error('BondVoucherModal', 'WhatsApp share failed', err);
    }
  };

  return (
    <div
      className={cn(
        'font-cairo fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm transition-all duration-300 sm:p-4',
        isFullscreen && 'p-0'
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl',
          isFullscreen ? 'h-full w-full rounded-none' : 'max-h-[92vh] w-full max-w-4xl'
        )}
        onClick={e => {
          e.stopPropagation();
        }}
      >
        {/* Header toolbar */}
        <div className="no-print flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl font-black shadow-sm',
                isReceipt
                  ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
                  : isPayment
                    ? 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'
                    : 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
              )}
            >
              <FileText size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  معاينة السند الرسمي ({bond.payment_number})
                </h3>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[10px] font-black',
                    isReceipt
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : isPayment
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                  )}
                >
                  {voucherTitle}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                شاشة معاينة وطباعة السندات الرسمية المعتمدة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              title="طباعة السند"
            >
              <Printer size={14} />
              <span className="hidden sm:inline">طباعة</span>
            </button>
            <button
              onClick={handleWhatsApp}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm transition-all hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"
              title="مشاركة عبر واتساب"
            >
              <MessageCircle size={14} />
              <span className="hidden sm:inline">واتساب</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title="تصدير إكسل"
            >
              <Download size={14} />
              <span className="hidden sm:inline">إكسل</span>
            </button>
            <button
              onClick={() => {
                setIsFullscreen(!isFullscreen);
              }}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              title={isFullscreen ? 'تصغير النافذة' : 'ملء الشاشة'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title="إغلاق"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Voucher Paper Area */}
        <div className="flex-1 overflow-y-auto bg-slate-100/70 p-4 dark:bg-slate-950 print:m-0 print:overflow-visible print:bg-white print:p-0 sm:p-8">
          <div
            ref={printRef}
            id="bond-printable-voucher"
            className="mx-auto max-w-3xl rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900 print:m-0 print:max-w-none print:border-none print:bg-white print:p-6 print:text-black print:shadow-none sm:p-10"
          >
            {/* Header: Company and Voucher Meta */}
            <div className="mb-6 w-full">
              <UniversalDocumentHeader
                config={headerConfig}
                company={{
                  name: company.name_ar,
                  phone: company.phone || undefined,
                  address: company.address || undefined,
                  tax_number: company.tax_number || undefined,
                  logo_url: company.logo_url || undefined,
                }}
                documentTitle={voucherTitle}
                documentNumber={bond.payment_number}
                documentDate={bond.date}
              />
            </div>

            {/* Amount Banner */}
            <div className="my-6 flex flex-col items-center justify-between gap-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-800/40 print:border-solid print:border-slate-800 print:bg-slate-50 print:p-4 print:text-black sm:flex-row">
              <div>
                <span className="mb-1 block text-[11px] font-bold uppercase text-slate-400 print:text-slate-700">
                  المبلغ المالي بالأرقام
                </span>
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      'font-mono text-3xl font-black tracking-tight print:text-black',
                      isReceipt ? 'text-emerald-600' : 'text-rose-600'
                    )}
                  >
                    {formatCurrency(bond.amount, bond.currency_code)}
                  </span>
                  {bond.currency_code !== 'SAR' && bond.base_amount !== undefined && (
                    <span className="font-mono text-xs font-bold text-slate-500 print:text-slate-700">
                      (يعادل {formatCurrency(bond.base_amount, 'SAR')})
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-800 print:border-slate-400 print:bg-white print:shadow-none">
                <CreditCard size={16} className="text-slate-400 print:text-slate-700" />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 print:text-black">
                  طريقة الدفع: {bond.payment_method === 'bank' ? 'حوالة بنكية' : 'نقداً'}
                </span>
              </div>
            </div>

            {/* Voucher Body Details */}
            <div className="space-y-4 text-xs font-bold text-slate-700 dark:text-slate-300 print:text-black">
              <div className="flex flex-col gap-2 border-b border-slate-100 py-3 dark:border-slate-800 print:border-slate-300 sm:flex-row sm:items-center">
                <span className="flex w-40 shrink-0 items-center gap-1.5 text-slate-400 print:text-slate-700">
                  <User size={14} />
                  {personLabel}
                </span>
                <span className="text-sm font-black text-slate-900 dark:text-white print:text-black">
                  {bond.party_name || bond.account_name}
                </span>
              </div>

              <div className="flex flex-col gap-2 border-b border-slate-100 py-3 dark:border-slate-800 print:border-slate-300 sm:flex-row sm:items-center">
                <span className="w-40 shrink-0 text-slate-400 print:text-slate-700">المبلغ كتابة (تفقيط):</span>
                <span className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-600 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-400 print:border-slate-400 print:bg-slate-100 print:text-black">
                  {tafqeetText}
                </span>
              </div>

              <div className="flex flex-col gap-2 border-b border-slate-100 py-3 dark:border-slate-800 print:border-slate-300 sm:flex-row sm:items-center">
                <span className="w-40 shrink-0 text-slate-400 print:text-slate-700">الحساب المالي (الصندوق/البنك):</span>
                <span className="font-mono text-slate-800 dark:text-slate-200 print:text-black">
                  {bond.account_name}
                </span>
              </div>

              <div className="flex flex-col gap-2 border-b border-slate-100 py-3 dark:border-slate-800 print:border-slate-300 sm:flex-row sm:items-start">
                <span className="w-40 shrink-0 pt-0.5 text-slate-400 print:text-slate-700">{forWhatLabel}</span>
                <span className="flex-1 font-medium leading-relaxed text-slate-800 dark:text-slate-200 print:text-black">
                  {bond.description || 'سداد حساب مالي'}
                </span>
              </div>
            </div>

            {/* Signatures Row */}
            <div className="mt-12 border-t border-slate-200 pt-6 dark:border-slate-800 print:mt-8 print:border-slate-800 print:pt-4">
              <div className="grid grid-cols-3 gap-6 text-center">
                <div className="space-y-6">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400 print:text-black">
                    توقيع المستلم / المودع
                  </span>
                  <div className="h-10 border-b-2 border-dotted border-slate-300 dark:border-slate-700 print:border-slate-800"></div>
                </div>

                <div className="space-y-6">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400 print:text-black">
                    أمين الصندوق
                  </span>
                  <div className="h-10 border-b-2 border-dotted border-slate-300 dark:border-slate-700 print:border-slate-800"></div>
                </div>

                <div className="space-y-6">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-slate-400 print:text-black">
                    المحاسب المسؤول / الاعتماد
                  </span>
                  <div className="h-10 border-b-2 border-dotted border-slate-300 dark:border-slate-700 print:border-slate-800"></div>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-400 dark:border-slate-800/80 print:border-slate-300 print:text-slate-700">
                <span className="flex items-center gap-1 font-mono font-bold">
                  <ShieldCheck size={12} className="text-emerald-500 print:text-black" />
                  مستند محاسبي معتمد بنظام الجعفري الذكي ERP
                </span>
                <span className="font-mono">طُبع في: {formatLocalDate()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BondVoucherModal;
