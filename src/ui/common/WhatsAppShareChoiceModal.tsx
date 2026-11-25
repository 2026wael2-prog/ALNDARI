import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  MessageSquare,
  Phone,
  Copy,
  Check,
  Loader2,
  Send,
  Sparkles,
} from 'lucide-react';
import { sharePdfViaWhatsApp, shareTextViaWhatsApp } from '@/core/utils/shareUtils';
import { useFeedbackStore } from '@/features/feedback/store';

export interface WhatsAppShareChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  defaultPhone?: string | undefined;
  textMessage: string;
  pdfFileName: string;
  pdfCaption?: string | undefined;
  onGeneratePdfBlob: () => Promise<Blob>;
}

export const WhatsAppShareChoiceModal: React.FC<WhatsAppShareChoiceModalProps> = ({
  isOpen,
  onClose,
  title,
  defaultPhone = '',
  textMessage,
  pdfFileName,
  pdfCaption,
  onGeneratePdfBlob,
}) => {
  const { showToast } = useFeedbackStore();
  const [phone, setPhone] = useState(defaultPhone);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTextPreview, setShowTextPreview] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPhone(defaultPhone || '');
      setShowTextPreview(false);
      setCopied(false);
    }
  }, [isOpen, defaultPhone]);

  if (!isOpen) return null;

  const handleSendPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const blob = await onGeneratePdfBlob();
      const caption = pdfCaption || `مرفق ${title} بصيغة PDF`;
      const result = await sharePdfViaWhatsApp({
        blob,
        fileName: pdfFileName,
        shareTitle: title,
        shareText: caption,
        phone,
      });
      if (result === 'download_and_wa') {
        showToast(
          'تم تنزيل ملف الـ PDF الملون وفتح واتساب — أرفق الملف في المحادثة وأرسله للعميل',
          'success'
        );
      } else {
        showToast('تم فتح نافذة مشاركة ملف الـ PDF بنجاح', 'success');
      }
      onClose();
    } catch {
      showToast('تعذر تجهيز ملف الـ PDF للمشاركة', 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSendText = () => {
    shareTextViaWhatsApp(textMessage, phone);
    showToast('تم فتح واتساب بالرسالة النصية المنسقة', 'success');
    onClose();
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(textMessage);
      setCopied(true);
      showToast('تم نسخ النص إلى الحافظة', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('تعذر نسخ النص', 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-xs animate-in fade-in duration-150 sm:items-center sm:p-3"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[var(--app-border)] bg-[var(--app-surface)] pb-[env(safe-area-inset-bottom)] text-[var(--app-text)] shadow-2xl sm:rounded-2xl sm:pb-0"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--app-border)] bg-emerald-600 px-3.5 py-2.5 text-white sm:px-5 sm:py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <Send size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black">إرسال عبر واتساب — {title}</h3>
              <p className="text-[11px] text-emerald-100">
                اختر الطريقة التي تفضل أن تصل للعميل (ملف PDF ملون أو نص)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          {/* Recipient Phone Input */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--app-text-secondary)]">
              <Phone size={13} className="text-emerald-600" />
              <span>رقم واتساب المستلم (اختياري — اتركه فارغاً لاختيار المحادثة من واتساب)</span>
            </label>
            <input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="مثال: 96777xxxxxxx أو 9665xxxxxxxx"
              className="w-full rounded-xl px-3.5 py-2.5 font-mono text-sm font-bold"
            />
          </div>

          {/* Two Clear Choices */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Option 1: Professional Colored PDF with Company Header */}
            <button
              type="button"
              onClick={handleSendPdf}
              disabled={isGeneratingPdf}
              className="group relative flex flex-col items-start gap-2 rounded-2xl border-2 border-blue-600/80 bg-blue-50/70 p-4 text-right transition-all hover:bg-blue-100/80 hover:shadow-md active:scale-[0.99] disabled:opacity-60 dark:bg-blue-950/30 dark:hover:bg-blue-950/50"
            >
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">
                <Sparkles size={10} />
                احترافي وملون
              </span>
              <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
                {isGeneratingPdf ? (
                  <Loader2 size={20} className="animate-spin text-blue-600" />
                ) : (
                  <FileText size={20} className="text-blue-600" />
                )}
                <span className="text-sm font-black">ملف PDF مع الهيدر</span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--app-text-secondary)]">
                تصميم منظم وملون يحمل شعار وهيدر الشركة الرسمي جاهز للطباعة والحفظ.
              </p>
            </button>

            {/* Option 2: Formatted Text Message */}
            <button
              type="button"
              onClick={handleSendText}
              disabled={isGeneratingPdf}
              className="group flex flex-col items-start gap-2 rounded-2xl border-2 border-emerald-600/70 bg-emerald-50/70 p-4 text-right transition-all hover:bg-emerald-100/80 hover:shadow-md active:scale-[0.99] disabled:opacity-60 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
            >
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">
                سريع ومباشر
              </span>
              <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
                <MessageSquare size={20} className="text-emerald-600" />
                <span className="text-sm font-black">رسالة نصية منسقة</span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--app-text-secondary)]">
                إرسال ملخص التفاصيل والمبالغ كنص منسق مباشرة داخل محادثة واتساب.
              </p>
            </button>
          </div>

          {/* Toggle Text Preview + Copy */}
          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowTextPreview(p => !p)}
                className="text-xs font-bold text-blue-700 hover:underline dark:text-blue-400"
              >
                {showTextPreview ? 'إخفاء معاينة النص' : 'معاينة الرسالة النصية قبل الإرسال'}
              </button>
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-[11px] font-bold hover:bg-[var(--app-surface-hover)]"
              >
                {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                <span>{copied ? 'تم النسخ' : 'نسخ النص'}</span>
              </button>
            </div>
            {showTextPreview && (
              <pre className="mt-2.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5 font-sans text-xs leading-relaxed text-[var(--app-text)]">
                {textMessage}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppShareChoiceModal;
