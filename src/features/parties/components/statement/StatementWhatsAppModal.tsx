import React, { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Phone,
  Send,
  Share2,
  X,
} from 'lucide-react';
import type { CompanyInfo } from '../../utils/statementExcelExporter';
import type { StatementMovement } from '../../service';
import type { Party, PartyType } from '../../types';
import { useStatementWhatsApp } from './whatsapp/useStatementWhatsApp';
import { StatementExcelTab } from './whatsapp/StatementExcelTab';
import { StatementImageTab } from './whatsapp/StatementImageTab';
import { StatementTextTab } from './whatsapp/StatementTextTab';
import { StatementPrintSheet } from './StatementPrintSheet';
import { PdfCaptureHost } from '@/core/components/PdfCaptureHost';
import { generatePDFBlob } from '@/core/utils/pdfExporter';
import { sharePdfViaWhatsApp } from '@/core/utils/shareUtils';
import { useFeedbackStore } from '@/features/feedback/store';

interface StatementWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  party: Party;
  partyType: PartyType;
  movements: StatementMovement[];
  startDate?: string;
  endDate?: string;
  company: CompanyInfo;
  companyNameAr: string;
}

export const StatementWhatsAppModal: React.FC<StatementWhatsAppModalProps> = ({
  isOpen,
  onClose,
  party,
  partyType,
  movements,
  startDate,
  endDate,
  company,
  companyNameAr,
}) => {
  const {
    activeTab,
    setActiveTab,
    phone,
    setPhone,
    isValidPhone,
    isExportingExcel,
    isCapturingImage,
    isSendingDirect,
    copiedType,
    gridImageRef,
    sarMovements,
    yerMovements,
    sarSummary,
    yerSummary,
    dateRangeText,
    bankInfoText,
    whatsappMessage,
    handleShareExcel,
    handleDownloadExcel,
    handleCopyGridImage,
    handleDownloadGridImage,
    handleSendDirectUltraMsg,
    handleSendGridImageDirectUltraMsg,
    handleCopyText,
    handleOpenWhatsAppWeb,
    handleOpenWhatsAppApp,
  } = useStatementWhatsApp({
    party,
    partyType,
    movements,
    startDate,
    endDate,
    company,
    companyNameAr,
  });

  const { showToast } = useFeedbackStore();
  const pdfCaptureRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  if (!isOpen) return null;

  const waitForPdfHost = async () => {
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 120)))
    );
  };

  const handleSharePdf = async () => {
    // Open a blank tab synchronously inside the click handler on desktop browsers
    // so popup blockers do not block WhatsApp after async PDF generation.
    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
    const preOpenedWindow = !canNativeShare ? window.open('', '_blank') : null;

    setIsExportingPdf(true);
    try {
      await waitForPdfHost();
      if (!pdfCaptureRef.current) throw new Error('Statement PDF element missing');
      const blob = await generatePDFBlob(pdfCaptureRef.current);
      const result = await sharePdfViaWhatsApp({
        blob,
        fileName: `كشف_حساب_${party.name.replace(/\s+/g, '_')}`,
        shareTitle: `كشف حساب ${party.name}`,
        shareText: `مرفق كشف حساب: ${party.name} (${dateRangeText}) بصيغة PDF`,
        phone,
        preOpenedWindow,
      });
      showToast(
        result === 'download_and_wa'
          ? 'تم تنزيل كشف الحساب بصيغة PDF وفتح واتساب — أرفق الملف في المحادثة'
          : 'تم فتح مشاركة ملف الـ PDF بنجاح',
        'success'
      );
    } catch (err) {
      if (preOpenedWindow && !preOpenedWindow.closed) {
        preOpenedWindow.close();
      }
      console.error('Statement PDF export failed:', err);
      showToast('تعذر إنشاء ملف PDF لكشف الحساب', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadPdfOnly = async () => {
    setIsExportingPdf(true);
    try {
      await waitForPdfHost();
      if (!pdfCaptureRef.current) throw new Error('Statement PDF element missing');
      const blob = await generatePDFBlob(pdfCaptureRef.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `كشف_حساب_${party.name.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast('تم تنزيل ملف PDF لكشف الحساب بنجاح', 'success');
    } catch (err) {
      console.error('Statement PDF download failed:', err);
      showToast('تعذر إنشاء ملف PDF لكشف الحساب', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="animate-in fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm duration-200 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[var(--app-border)] bg-[var(--app-surface)] pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-2xl sm:pb-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--app-border)] bg-gradient-to-r from-emerald-600 to-teal-700 px-3.5 py-2.5 text-white sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="shrink-0 rounded-xl bg-white/15 p-1.5 backdrop-blur-md sm:p-2">
              <Share2 size={17} className="text-white sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-white sm:text-base">
                إرسال كشف الحساب عبر واتساب (Excel Grid)
              </h2>
              <p className="hidden text-xs text-emerald-100 sm:block">
                كشف حساب تفصيلي منظم وعصري مع تفريق كامل بين الريال السعودي والريال اليمني
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Client & Phone Control Bar */}
        <div className="grid grid-cols-1 gap-3 border-b border-[var(--app-border)] bg-slate-50/80 p-4 dark:bg-slate-900/60 md:grid-cols-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {partyType === 'supplier' ? 'المورد:' : 'العميل:'}
            </span>
            <div className="mt-0.5 truncate text-sm font-bold text-slate-800 dark:text-slate-100">
              {party.name}
            </div>
          </div>

          <div>
            <label
              htmlFor="statement-whatsapp-phone"
              className="text-[10px] font-bold uppercase tracking-wider text-slate-400"
            >
              رقم هاتف الواتساب:
            </label>
            <div className="relative mt-1">
              <input
                id="statement-whatsapp-phone"
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="مثال: 966500000000 أو 777000000"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 pl-8 text-xs font-mono font-bold text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                dir="ltr"
              />
              <Phone size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            {!isValidPhone && phone && (
              <span className="mt-0.5 block text-[10px] text-amber-600 dark:text-amber-400">
                ⚠️ رقم غير مكتمل (أدخل كود الدولة أو 9 أرقام على الأقل)
              </span>
            )}
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              فترة الكشف:
            </span>
            <div className="mt-1 inline-block rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
              📅 {dateRangeText}
            </div>
          </div>
        </div>

        {/* Currency Distinction Highlights (الفرق بين الريال السعودي والريال اليمني) */}
        <div className="grid grid-cols-1 gap-3 border-b border-[var(--app-border)] p-4 sm:grid-cols-2">
          {/* Saudi Riyal Card */}
          <div className="relative overflow-hidden rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-400">
                <span className="text-base">🇸🇦</span>
                حساب الريال السعودي (SAR)
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                {sarSummary?.count || sarMovements.length} حركة
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-white/80 p-1.5 dark:bg-slate-800/80">
                <span className="block text-[10px] text-slate-500">مدين (+)</span>
                <span className="font-mono font-bold text-emerald-600" dir="ltr">
                  {(sarSummary?.totalDebit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="rounded-lg bg-white/80 p-1.5 dark:bg-slate-800/80">
                <span className="block text-[10px] text-slate-500">دائن (-)</span>
                <span className="font-mono font-bold text-rose-600" dir="ltr">
                  {(sarSummary?.totalCredit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="rounded-lg bg-blue-600/10 p-1.5 dark:bg-blue-500/20">
                <span className="block text-[10px] font-bold text-blue-800 dark:text-blue-300">
                  الرصيد المستحق
                </span>
                <span className="font-mono font-bold text-blue-900 dark:text-blue-200" dir="ltr">
                  {(sarSummary?.finalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Yemeni Riyal Card */}
          <div className="relative overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <span className="text-base">🇾🇪</span>
                حساب الريال اليمني (YER)
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                {yerSummary?.count || yerMovements.length} حركة
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-white/80 p-1.5 dark:bg-slate-800/80">
                <span className="block text-[10px] text-slate-500">مدين (+)</span>
                <span className="font-mono font-bold text-emerald-600" dir="ltr">
                  {(yerSummary?.totalDebit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="rounded-lg bg-white/80 p-1.5 dark:bg-slate-800/80">
                <span className="block text-[10px] text-slate-500">دائن (-)</span>
                <span className="font-mono font-bold text-rose-600" dir="ltr">
                  {(yerSummary?.totalCredit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="rounded-lg bg-emerald-600/10 p-1.5 dark:bg-emerald-500/20">
                <span className="block text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                  الرصيد المستحق
                </span>
                <span className="font-mono font-bold text-emerald-900 dark:text-emerald-200" dir="ltr">
                  {(yerSummary?.finalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-1 border-b border-[var(--app-border)] bg-slate-100/70 p-2 dark:bg-slate-800/40">
          <button
            type="button"
            onClick={() => setActiveTab('pdf')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all ${
              activeTab === 'pdf'
                ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <FileText size={16} />
            ملف PDF ملون (مع الهيدر)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('excel')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all ${
              activeTab === 'excel'
                ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-400'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet size={16} />
            كشف Excel الملون (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('image')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all ${
              activeTab === 'image'
                ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <ImageIcon size={16} />
            صورة الجريد الملون (PNG للواتساب)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all ${
              activeTab === 'text'
                ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-400'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <MessageSquare size={16} />
            نص واتساب المنسق
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'pdf' && (
            <div className="space-y-4">
              <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/70 p-5 text-center dark:border-blue-900/50 dark:bg-blue-950/20">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md">
                  <FileText size={24} />
                </div>
                <h3 className="text-base font-black text-blue-950 dark:text-blue-100">
                  إرسال كشف الحساب كملف PDF احترافي وملون
                </h3>
                <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-[var(--app-text-secondary)]">
                  يحتوي الملف على شعار وهيدر الشركة الرسمي، جدول الحركات الملون، وتلخيص الأرصدة جاهز للطباعة والحفظ.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      void handleSharePdf();
                    }}
                    disabled={isExportingPdf}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500 active:scale-95 disabled:opacity-60"
                  >
                    {isExportingPdf ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                    <span>
                      {isExportingPdf
                        ? 'جاري تجهيز ملف PDF...'
                        : 'تجهيز وإرسال ملف PDF عبر واتساب'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDownloadPdfOnly();
                    }}
                    disabled={isExportingPdf}
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-white px-4 py-2.5 text-xs font-bold text-blue-700 shadow-sm transition-all hover:bg-blue-50 active:scale-95 disabled:opacity-60 dark:border-blue-800 dark:bg-slate-800 dark:text-blue-300"
                  >
                    <FileText size={15} />
                    <span>تنزيل PDF فقط</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'excel' && (
            <StatementExcelTab
              isExportingExcel={isExportingExcel}
              onShareExcel={() => {
                void handleShareExcel();
              }}
              onDownloadExcel={() => {
                void handleDownloadExcel();
              }}
            />
          )}

          {activeTab === 'image' && (
            <StatementImageTab
              gridImageRef={gridImageRef}
              party={party}
              company={company}
              companyNameAr={companyNameAr}
              dateRangeText={dateRangeText}
              bankInfoText={bankInfoText}
              sarMovements={sarMovements}
              yerMovements={yerMovements}
              sarSummary={sarSummary}
              yerSummary={yerSummary}
              isCapturingImage={isCapturingImage}
              isSendingDirect={isSendingDirect}
              isValidPhone={isValidPhone}
              copiedType={copiedType}
              onSendGridImageDirect={() => {
                void handleSendGridImageDirectUltraMsg();
              }}
              onCopyGridImage={() => {
                void handleCopyGridImage();
              }}
              onDownloadGridImage={() => {
                void handleDownloadGridImage();
              }}
            />
          )}

          {activeTab === 'text' && (
            <StatementTextTab
              whatsappMessage={whatsappMessage}
              isValidPhone={isValidPhone}
              isSendingDirect={isSendingDirect}
              copiedType={copiedType}
              onSendDirect={() => {
                void handleSendDirectUltraMsg();
              }}
              onCopyText={() => {
                void handleCopyText();
              }}
              onOpenWhatsAppWeb={handleOpenWhatsAppWeb}
              onOpenWhatsAppApp={handleOpenWhatsAppApp}
            />
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[var(--app-border)] bg-slate-50/80 px-6 py-3 dark:bg-slate-900/50">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {movements.length} حركة مسجلة في هذا الكشف
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            إغلاق
          </button>
        </div>
      </div>

      {isExportingPdf && (
        <PdfCaptureHost innerRef={pdfCaptureRef}>
          <StatementPrintSheet
            forPdf
            currency="ALL"
            company={{
              nameAr: company.name_ar || companyNameAr,
              nameEn: '',
              address: company.address || '',
              phone: company.phone || '',
              taxNumber: company.tax_number || '',
              specialization: '',
              headerText: '',
              logoUrl: company.logo_url || undefined,
            }}
            partyType={partyType}
            partyName={party.name}
            partyPhone={party.phone || undefined}
            movements={movements}
            printSubtitle={`الفترة: ${dateRangeText}`}
          />
        </PdfCaptureHost>
      )}
    </div>
  );
};
