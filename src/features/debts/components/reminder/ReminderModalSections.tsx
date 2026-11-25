import React from 'react';
import { Check, Globe, Loader2, QrCode, RotateCcw, Send, Smartphone } from 'lucide-react';
import { cn } from '../../../../core/utils';
import type { ReminderTone } from '../../services/debtAiService';
import { REMINDER_TONES } from './useReminderModalController';

interface ReminderFooterActionsProps {
  hasPhone: boolean;
  canSend: boolean;
  isSendingDirect: boolean;
  onClose: () => void;
  onSendDirect: () => void;
  onOpenQr: () => void;
  onOpenWhatsApp: (target: 'app' | 'web') => void;
  onConfirmManual: () => void;
}

export const ReminderFooterActions: React.FC<ReminderFooterActionsProps> = ({
  hasPhone,
  canSend,
  isSendingDirect,
  onClose,
  onSendDirect,
  onOpenQr,
  onOpenWhatsApp,
  onConfirmManual,
}) => (
  <>
    <button
      type="button"
      onClick={onClose}
      className="rounded-xl px-4 py-2 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800"
    >
      إغلاق
    </button>

    <div className="flex flex-wrap items-center gap-2">
      {hasPhone && (
        <>
          <button
            type="button"
            onClick={onSendDirect}
            disabled={!canSend}
            title="إرسال فوري ومباشر إلى واتساب العميل عبر بوابة المحل الرسمية UltraMsg دون أي تدخل يدوي"
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSendingDirect ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            <span>
              {isSendingDirect ? 'جاري الإرسال الفوري...' : 'إرسال فوري من رقم المحل (تلقائي)'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenQr}
            title="فحص جلسة بوابة واتساب ومسح رمز QR"
            className="flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-50 px-2.5 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300"
          >
            <QrCode size={14} />
            <span>فحص الجلسة (QR)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenWhatsApp('app');
            }}
            disabled={!canSend}
            title="فتح تطبيق واتساب على الهاتف أو الكمبيوتر للإرسال اليدوي"
            className="flex items-center gap-1.5 rounded-xl border border-green-600/30 bg-green-50 px-3 py-2 text-xs font-bold text-green-700 transition-all hover:bg-green-100 dark:bg-green-950/30 dark:text-green-300"
          >
            <Smartphone size={14} />
            تطبيق واتساب (يدوي)
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenWhatsApp('web');
            }}
            disabled={!canSend}
            title="فتح محادثة واتساب ويب على المتصفح للإرسال اليدوي"
            className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm transition-all hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Globe size={14} className="text-blue-500" />
            واتساب ويب (يدوي)
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onConfirmManual}
        disabled={!canSend}
        title="توثيق تواصل يدوي دون إرسال رسالة (اتصال هاتفي أو زيارة ميدانية)"
        className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
      >
        <Check size={14} />
        توثيق تواصل يدوي فقط
      </button>
    </div>
  </>
);

interface ReminderToneAndTemplatePickerProps {
  mode: 'ai' | 'template';
  selectedTone: ReminderTone;
  isGeneratingAi: boolean;
  onSelectTone: (tone: ReminderTone) => void;
  onRegenerateAi: () => void;
  templates: Array<{ id: string; name: string }> | undefined;
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
}

export const ReminderToneAndTemplatePicker: React.FC<ReminderToneAndTemplatePickerProps> = ({
  mode,
  selectedTone,
  isGeneratingAi,
  onSelectTone,
  onRegenerateAi,
  templates,
  selectedTemplateId,
  onSelectTemplate,
}) => (
  <>
    {mode === 'ai' && (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
            اختر نبرة الخطاب المطلوبة:
          </span>
          <button
            type="button"
            disabled={isGeneratingAi}
            onClick={onRegenerateAi}
            className="flex items-center gap-1 text-[10px] font-bold text-purple-600 hover:underline disabled:opacity-50 dark:text-purple-400"
          >
            <RotateCcw size={11} className={isGeneratingAi ? 'animate-spin' : ''} />
            إعادة التوليد بالذكاء الاصطناعي
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {REMINDER_TONES.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                onSelectTone(t.key);
              }}
              className={cn(
                'flex flex-col justify-between rounded-2xl border p-2.5 text-right transition-all',
                selectedTone === t.key
                  ? 'border-purple-400 bg-purple-50 shadow-sm dark:border-purple-600 dark:bg-purple-950/40'
                  : 'border-gray-200 bg-gray-50/50 opacity-70 hover:opacity-100 dark:border-slate-700/60 dark:bg-slate-800/40'
              )}
            >
              <div className="text-base">{t.icon}</div>
              <div className="mt-1">
                <span className="block text-[11px] font-extrabold text-gray-900 dark:text-slate-100">
                  {t.label}
                </span>
                <span className="mt-0.5 block text-[10px] leading-tight text-gray-400 dark:text-slate-500">
                  {t.desc}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    )}

    {mode === 'template' && templates && templates.length > 0 && (
      <div>
        <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
          اختر قالب الرسالة:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {templates.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onSelectTemplate(t.id);
              }}
              className={cn(
                'rounded-xl border px-3 py-1.5 text-xs font-bold transition-all',
                t.id === selectedTemplateId
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              )}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
    )}
  </>
);
