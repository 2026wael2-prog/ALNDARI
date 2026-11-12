import React from 'react';
import { Check, Copy, ExternalLink, Send, Smartphone } from 'lucide-react';

interface StatementTextTabProps {
  whatsappMessage: string;
  isValidPhone: boolean;
  isSendingDirect: boolean;
  copiedType: 'text' | 'image' | null;
  onSendDirect: () => void;
  onCopyText: () => void;
  onOpenWhatsAppWeb: () => void;
  onOpenWhatsAppApp: () => void;
}

export const StatementTextTab: React.FC<StatementTextTabProps> = ({
  whatsappMessage,
  isValidPhone,
  isSendingDirect,
  copiedType,
  onSendDirect,
  onCopyText,
  onOpenWhatsAppWeb,
  onOpenWhatsAppApp,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
          نص الرسالة المنظم مع تفريق العملات:
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSendDirect}
            disabled={!isValidPhone || isSendingDirect}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            title="إرسال فوري تلقائي من رقم المنشأة مباشرة دون فتح أي نافذة"
          >
            <Send size={13} className={isSendingDirect ? 'animate-spin' : ''} />
            {isSendingDirect ? 'جاري الإرسال...' : 'إرسال فوري من رقم المحل'}
          </button>
          <button
            type="button"
            onClick={onCopyText}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {copiedType === 'text' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            {copiedType === 'text' ? 'تم النسخ!' : 'نسخ النص'}
          </button>
          <button
            type="button"
            onClick={onOpenWhatsAppWeb}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            <ExternalLink size={14} />
            فتح واتساب ويب
          </button>
          <button
            type="button"
            onClick={onOpenWhatsAppApp}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <Smartphone size={14} />
            تطبيق الهاتف
          </button>
        </div>
      </div>

      <textarea
        readOnly
        value={whatsappMessage}
        rows={14}
        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 focus:outline-none dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200"
        dir="rtl"
      />
    </div>
  );
};

