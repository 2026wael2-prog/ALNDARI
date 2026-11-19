import React, { useRef, useState } from 'react';
import {
  FileText,
  Printer,
  MessageCircle,
  Download,
  X,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { Bond } from '../types';
import { formatCurrency, cn } from '../../../core/utils';
import { tafqeet } from '../../../core/utils/tafqeet';
import { useCompany } from '../../settings/hooks';
import { useInvoiceSettings, useDocumentHeaderSettings } from '../../settings/settingsStore';
import { AlNadaryPrintShell } from '@/ui/print/AlNadaryPrintShell';
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
      const { exportSingleBondToExcel } = await import('../../../core/utils/bondExcelExporter');
      await exportSingleBondToExcel(company, bond);
    } catch (err) {
      logger.error('BondVoucherModal', 'Excel export failed', err);
    }
  };

  const handleWhatsApp = async () => {
    try {
      const { generateSingleBondExcelBlob, exportSingleBondToExcel } = await import(
        '../../../core/utils/bondExcelExporter'
      );
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

        {/* Voucher Paper Area — Unified Al-Nadary Print Template */}
        <div className="flex-1 overflow-y-auto bg-slate-100/70 p-4 dark:bg-slate-950 print:m-0 print:overflow-visible print:bg-white print:p-0 sm:p-6">
          <div
            ref={printRef}
            id="bond-printable-voucher"
            className="mx-auto max-w-3xl border border-slate-300 bg-white shadow-lg print:m-0 print:max-w-none print:border-none print:shadow-none"
          >
            <AlNadaryPrintShell
              documentTitle={voucherTitle}
              documentDate={bond.date}
              documentNumber={bond.payment_number}
              documentNumberLabel="رقم السند"
              company={{
                nameAr: company.name_ar,
                logoUrl: company.logo_url,
                address: company.address,
                phone: company.phone,
              }}
              rightMeta={[
                { label: personLabel.replace(/:$/, ''), value: bond.party_name || bond.account_name || '—' },
              ]}
              leftMeta={[
                { label: 'طريقة الدفع', value: bond.payment_method === 'bank' ? 'حوالة بنكية' : 'نقداً' },
                { label: 'العملة', value: currencySymbol },
              ]}
              showDefaultTerms={false}
              signatures={['توقيع المستلم / المودع', 'أمين الصندوق', 'المحاسب / الاعتماد']}
            >
              <table className="alnadary-table" style={{ marginBottom: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>البيان</th>
                    <th style={{ width: '72%' }}>التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
                      {personLabel.replace(/:$/, '')}
                    </td>
                    <td className="alnadary-td-right" style={{ fontWeight: 900, fontSize: '13px' }}>
                      {bond.party_name || bond.account_name}
                    </td>
                  </tr>
                  <tr>
                    <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
                      المبلغ بالأرقام
                    </td>
                    <td className="alnadary-td-right" style={{ fontWeight: 900, fontSize: '14px' }}>
                      <span dir="ltr">{formatCurrency(bond.amount, bond.currency_code)}</span>
                      {bond.currency_code !== 'SAR' && bond.base_amount !== undefined && (
                        <span style={{ fontSize: '11px', marginInlineStart: '10px', fontWeight: 700 }}>
                          (يعادل {formatCurrency(bond.base_amount, 'SAR')})
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
                      مبلغ وقدره كتابةً
                    </td>
                    <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
                      {tafqeetText}
                    </td>
                  </tr>
                  <tr>
                    <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
                      الصندوق / الحساب المالي
                    </td>
                    <td className="alnadary-td-right">{bond.account_name || '—'}</td>
                  </tr>
                  <tr>
                    <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
                      {forWhatLabel.replace(/:$/, '')}
                    </td>
                    <td className="alnadary-td-right">{bond.description || 'سداد حساب مالي'}</td>
                  </tr>
                </tbody>
              </table>

              <div className="alnadary-totals-section">
                <div className="alnadary-total-bar">
                  <div className="alnadary-total-bar-label">إجمالي السند</div>
                  <div className="alnadary-total-bar-words">{tafqeetText}</div>
                  <div className="alnadary-total-bar-amount">
                    {bond.amount.toLocaleString('en-US', {
                      minimumFractionDigits: Number.isInteger(bond.amount) ? 0 : 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>
            </AlNadaryPrintShell>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BondVoucherModal;
