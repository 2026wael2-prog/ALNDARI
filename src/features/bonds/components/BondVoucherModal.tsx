import React, { useEffect, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
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
import { PdfCaptureHost } from '@/core/components/PdfCaptureHost';
import { buildWhatsappHeader } from '@/core/utils/whatsappHeader';
import { logger } from '../../../core/utils/logger';
import WhatsAppShareChoiceModal from '@/ui/common/WhatsAppShareChoiceModal';
import { useAuthStore } from '../../auth/store';
import { partiesService } from '../../parties/service';
import {
  resolveVoucherBalanceFromStatement,
  type VoucherBalanceSnapshot,
} from '../utils/bondPartyBalance';

interface BondVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  bond: Bond | null;
}

export const BondVoucherModal: React.FC<BondVoucherModalProps> = ({ isOpen, onClose, bond }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [voucherBalance, setVoucherBalance] = useState<VoucherBalanceSnapshot | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const pdfCaptureRef = useRef<HTMLDivElement>(null);
  const { data: settingsCompany } = useCompany();
  const invoiceSettings = useInvoiceSettings();
  const headerConfig = useDocumentHeaderSettings();
  const companyId = useAuthStore(s => s.user?.company_id);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !bond || !bond.party_id || !companyId || bond.type === 'transfer') {
      setVoucherBalance(null);
      return;
    }

    const loadBalance = async () => {
      try {
        const movements = await partiesService.getStatement(
          bond.party_id as string,
          'all',
          { currencyCode: bond.currency_code || 'SAR' },
          companyId
        );
        if (cancelled) return;
        const snapshot = resolveVoucherBalanceFromStatement({
          movements,
          bondId: bond.id,
          paymentNumber: bond.payment_number,
          bondCurrency: bond.currency_code || 'SAR',
          bondType: bond.type,
          bondAmount: bond.amount,
          bondStatus: bond.status,
        });
        setVoucherBalance(snapshot);
      } catch (err) {
        logger.warn('BondVoucherModal', 'Failed to load party balance for voucher', err);
        if (!cancelled) setVoucherBalance(null);
      }
    };

    void loadBalance();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    bond?.id,
    bond?.party_id,
    bond?.payment_number,
    bond?.currency_code,
    bond?.type,
    bond?.amount,
    bond?.status,
    companyId,
  ]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `سند_${bond?.payment_number || 'مالي'}`,
  });

  if (!isOpen || !bond) return null;

  const company = {
    name_ar: invoiceSettings?.company_name_ar || settingsCompany?.name_ar || 'اسم المنشأة التجارية',
    address: invoiceSettings?.company_address || settingsCompany?.address || '',
    phone: invoiceSettings?.company_phone || settingsCompany?.phone || '',
    tax_number: settingsCompany?.tax_number || '---',
    logo_url: settingsCompany?.logo_url || '',
  };

  const isReceipt = bond.type === 'receipt';
  const isPayment = bond.type === 'payment' || (bond.type as string) === 'disbursement';

  const voucherTitle = isReceipt ? 'سند قبض' : isPayment ? 'سند صرف' : 'سند تحويل مالي';
  const personLabel = isReceipt
    ? 'استلمنا من السيد / السادة:'
    : isPayment
      ? 'صرفنا إلى السيد / السادة:'
      : 'تحويل لصالح:';
  const forWhatLabel = isReceipt ? 'وذلك مقابل:' : isPayment ? 'وذلك عن:' : 'الغرض من التحويل:';

  const currencyCodeUpper = (bond.currency_code || 'SAR').toUpperCase();
  const currencySymbol =
    currencyCodeUpper === 'SAR'
      ? 'ريال سعودي'
      : currencyCodeUpper === 'YER'
        ? 'ريال يمني'
        : currencyCodeUpper === 'OMR'
          ? 'ريال عماني'
          : currencyCodeUpper === 'USD'
            ? 'دولار أمريكي'
            : bond.currency_code;
  const tafqeetText = tafqeet(bond.amount, currencySymbol);

  const paymentMethodLabel = (() => {
    switch ((bond.payment_method ?? '').toLowerCase()) {
      case 'bank':
      case 'transfer':
        return 'حوالة بنكية';
      case 'card':
      case 'network':
        return 'بطاقة / شبكة';
      case 'check':
      case 'cheque':
        return 'شيك';
      default:
        return 'نقداً';
    }
  })();

  const handleExportPdf = async () => {
    if (!bond) return;
    setIsExportingPdf(true);
    await new Promise(resolve => setTimeout(resolve, 60));
    try {
      const target = pdfCaptureRef.current || printRef.current;
      if (target) {
        const { exportToPDF } = await import('../../../core/utils/pdfExporter');
        await exportToPDF(
          target,
          `${voucherTitle.replace(/\s+/g, '_')}_${bond.payment_number || 'مالي'}`
        );
      }
    } catch (err) {
      logger.error('BondVoucherModal', 'PDF export failed', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      const { exportSingleBondToExcel } = await import('../../../core/utils/bondExcelExporter');
      await exportSingleBondToExcel(company, bond);
    } catch (err) {
      logger.error('BondVoucherModal', 'Excel export failed', err);
    }
  };

  const handleWhatsApp = () => {
    setIsWhatsAppModalOpen(true);
  };

  const generateBondPdfBlob = async (): Promise<Blob> => {
    setIsExportingPdf(true);
    await new Promise(resolve => setTimeout(resolve, 80));
    try {
      const target = pdfCaptureRef.current || printRef.current;
      if (!target) {
        throw new Error('Bond print target not ready');
      }
      const { generatePDFBlob } = await import('../../../core/utils/pdfExporter');
      return await generatePDFBlob(target);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const waHeader = headerConfig?.whatsapp
    ? buildWhatsappHeader(headerConfig.whatsapp, {
        name: headerConfig.details.companyNameOverride || company.name_ar,
        phone: company.phone || undefined,
        taxNumber: company.tax_number || undefined,
        slogan: headerConfig.details.sloganText || undefined,
      })
    : '';

  const bondWhatsAppText = [
    waHeader ? waHeader.trim() : '',
    `📄 *${voucherTitle} رقم:* ${bond.payment_number}`,
    `📅 *التاريخ:* ${(bond as any).payment_date || bond.date || ''}`,
    `👤 *${personLabel.replace(/:$/, '')}:* ${bond.party_name || (bond as any).counterparty_account_name || 'عام'}`,
    `🏦 *الصندوق / الحساب:* ${bond.account_name || '—'}`,
    `💳 *طريقة الدفع:* ${paymentMethodLabel}`,
    `💰 *المبلغ:* ${formatCurrency(bond.amount, bond.currency_code)}`,
    voucherBalance
      ? `📊 *الرصيد السابق:* ${formatCurrency(voucherBalance.previousDirection.absAmount, voucherBalance.currency)} (${voucherBalance.previousDirection.label})`
      : '',
    voucherBalance
      ? `📌 *الرصيد بعد السند:* ${formatCurrency(voucherBalance.afterDirection.absAmount, voucherBalance.currency)} (${voucherBalance.afterDirection.label})`
      : '',
    bond.description ? `📝 *البيان:* ${bond.description}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const renderVoucherBalanceStrip = () => {
    if (!voucherBalance) return null;
    const prevColor =
      voucherBalance.previousDirection.status === 'debit'
        ? '#be123c'
        : voucherBalance.previousDirection.status === 'credit'
          ? '#047857'
          : '#334155';
    const afterColor =
      voucherBalance.afterDirection.status === 'debit'
        ? '#be123c'
        : voucherBalance.afterDirection.status === 'credit'
          ? '#047857'
          : '#334155';

    return (
      <table className="alnadary-table" style={{ marginBottom: '12px' }}>
        <thead>
          <tr>
            <th style={{ width: '34%' }}>الرصيد السابق (قبل السند)</th>
            <th style={{ width: '32%' }}>مبلغ السند الحالي</th>
            <th style={{ width: '34%' }}>الرصيد بعد السند</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'center', fontWeight: 900, fontSize: '13px', color: prevColor }}>
              <span dir="ltr">
                {formatCurrency(voucherBalance.previousDirection.absAmount, voucherBalance.currency)}
              </span>{' '}
              <span>({voucherBalance.previousDirection.label})</span>
            </td>
            <td style={{ textAlign: 'center', fontWeight: 900, fontSize: '13px' }}>
              <span dir="ltr">{formatCurrency(bond.amount, bond.currency_code)}</span>
            </td>
            <td style={{ textAlign: 'center', fontWeight: 900, fontSize: '13px', color: afterColor }}>
              <span dir="ltr">
                {formatCurrency(voucherBalance.afterDirection.absAmount, voucherBalance.currency)}
              </span>{' '}
              <span>({voucherBalance.afterDirection.label})</span>
            </td>
          </tr>
        </tbody>
      </table>
    );
  };

  return (
    <>
      <div
        className={cn(
          'font-cairo fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm transition-all duration-300 sm:items-center sm:p-4',
          isFullscreen && 'p-0'
        )}
        onClick={onClose}
      >
        <div
          className={cn(
            'flex flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl',
            isFullscreen ? 'h-[100dvh] w-full rounded-none' : 'max-h-[92dvh] w-full max-w-4xl'
          )}
          onClick={e => {
            e.stopPropagation();
          }}
        >
          {/* Header toolbar */}
          <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/60 sm:px-5 sm:py-3.5">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-black shadow-sm sm:h-10 sm:w-10',
                  isReceipt
                    ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
                    : isPayment
                      ? 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'
                      : 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
                )}
              >
                <FileText size={16} className="sm:hidden" />
                <FileText size={20} className="hidden sm:block" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h3 className="truncate text-xs font-black text-slate-900 dark:text-white sm:text-sm">
                    معاينة السند الرسمي ({bond.payment_number})
                  </h3>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black',
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
                <p className="hidden text-[11px] text-slate-400 sm:block">
                  شاشة معاينة وطباعة السندات الرسمية المعتمدة
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              <button
                onClick={() => {
                  handlePrint();
                }}
                className="flex items-center gap-1 rounded-xl bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition-all hover:bg-indigo-700 sm:px-3.5 sm:text-xs"
                title="طباعة السند"
              >
                <Printer size={14} />
                <span className="hidden sm:inline">طباعة</span>
              </button>
              <button
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 shadow-sm transition-all hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400 sm:px-3 sm:text-xs"
                title="تصدير السند بصيغة PDF"
              >
                <FileText size={14} />
                <span className="hidden sm:inline">
                  {isExportingPdf ? 'جارٍ التصدير...' : 'تصدير PDF'}
                </span>
              </button>
              <button
                onClick={handleWhatsApp}
                className="flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 shadow-sm transition-all hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400 sm:px-3 sm:text-xs"
                title="مشاركة عبر واتساب"
              >
                <MessageCircle size={14} />
                <span className="hidden sm:inline">واتساب</span>
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:px-3 sm:text-xs"
                title="تصدير إكسل"
              >
                <Download size={14} />
                <span className="hidden sm:inline">إكسل</span>
              </button>
              <button
                onClick={() => {
                  setIsFullscreen(!isFullscreen);
                }}
                className="hidden rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 md:inline-flex"
                title={isFullscreen ? 'تصغير النافذة' : 'ملء الشاشة'}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                onClick={onClose}
                className="rounded-xl p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:p-2"
                title="إغلاق"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Voucher Paper Area — Unified Al-Nadary Print Template */}
          <div className="flex-1 overflow-y-auto bg-slate-100/70 p-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:bg-slate-950 sm:p-6">
            <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-slate-300 bg-white p-1 shadow-lg sm:p-2">
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
                  { label: 'طريقة الدفع', value: paymentMethodLabel },
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

                {renderVoucherBalanceStrip()}

                <div className="alnadary-totals-section">
                  <div className="alnadary-total-bar">
                    <div className="alnadary-total-bar-label">إجمالي السند</div>
                    <div className="alnadary-total-bar-words">{tafqeetText}</div>
                    <div className="alnadary-total-bar-amount" dir="ltr">
                      {formatCurrency(bond.amount, bond.currency_code)}
                    </div>
                  </div>
                </div>
              </AlNadaryPrintShell>
            </div>
          </div>
        </div>
      </div>

      {/* Off-screen dedicated print target (never clipped by modal overflow) */}
      <div
        className="pointer-events-none fixed -left-[10000px] top-0 w-[210mm] opacity-0"
        aria-hidden="true"
      >
        <div ref={printRef} id="bond-printable-voucher-isolated">
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
              { label: 'طريقة الدفع', value: paymentMethodLabel },
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

            {renderVoucherBalanceStrip()}

            <div className="alnadary-totals-section">
              <div className="alnadary-total-bar">
                <div className="alnadary-total-bar-label">إجمالي السند</div>
                <div className="alnadary-total-bar-words">{tafqeetText}</div>
                <div className="alnadary-total-bar-amount" dir="ltr">
                  {formatCurrency(bond.amount, bond.currency_code)}
                </div>
              </div>
            </div>
          </AlNadaryPrintShell>
        </div>
      </div>

      {/* Dedicated host for high-resolution PDF capture */}
      <PdfCaptureHost innerRef={pdfCaptureRef}>
        <div style={{ width: '210mm', backgroundColor: '#ffffff' }}>
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
              { label: 'طريقة الدفع', value: paymentMethodLabel },
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

            {renderVoucherBalanceStrip()}

            <div className="alnadary-totals-section">
              <div className="alnadary-total-bar">
                <div className="alnadary-total-bar-label">إجمالي السند</div>
                <div className="alnadary-total-bar-words">{tafqeetText}</div>
                <div className="alnadary-total-bar-amount" dir="ltr">
                  {formatCurrency(bond.amount, bond.currency_code)}
                </div>
              </div>
            </div>
          </AlNadaryPrintShell>
        </div>
      </PdfCaptureHost>

      <WhatsAppShareChoiceModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        title={`${voucherTitle} #${bond.payment_number}`}
        textMessage={bondWhatsAppText}
        pdfFileName={`${voucherTitle.replace(/\s+/g, '_')}_${bond.payment_number}`}
        pdfCaption={`مرفق ${voucherTitle} رقم ${bond.payment_number} بصيغة PDF`}
        onGeneratePdfBlob={generateBondPdfBlob}
      />
    </>
  );
};

export default BondVoucherModal;
