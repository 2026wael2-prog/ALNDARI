import React from 'react';
import {
  Check,
  Copy,
  MessageSquare,
  PhoneOff,
  RotateCcw,
  Send,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../../core/utils';
import { WhatsAppSessionModal } from './agent/WhatsAppSessionModal';
import type { FollowUpDashboardRow } from '../types';
import { DebtsModalShell } from './DebtsModalShell';
import { useReminderModalController } from './reminder/useReminderModalController';
import {
  ReminderFooterActions,
  ReminderToneAndTemplatePicker,
} from './reminder/ReminderModalSections';

interface ReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: FollowUpDashboardRow;
}

export const ReminderModal: React.FC<ReminderModalProps> = ({ isOpen, onClose, row }) => {
  const ctrl = useReminderModalController(isOpen, row);

  if (!isOpen) return null;

  const canSend = ctrl.message.trim() !== '' && !ctrl.isSaving && !ctrl.isSendingDirect;

  return (
    <>
      <DebtsModalShell
        isOpen={isOpen}
        onClose={onClose}
        icon={<MessageSquare size={20} />}
        iconClassName="bg-green-600 shadow-green-500/20"
        title={`تذكير واتساب: ${row.party_name}`}
        description={`الرصيد: ${row.outstanding_balance} ${row.currency_code} · تأخير ${row.days_overdue} يوم`}
        size="xl"
        rounded="rounded-3xl"
        toolbar={
          <div className="flex items-center justify-between gap-2 border-b border-gray-200/80 bg-gray-100/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex items-center gap-1.5 rounded-2xl border border-gray-200/60 bg-white p-1 shadow-sm dark:border-slate-700/60 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => {
                  if (ctrl.mode === 'ai') return;
                  ctrl.setMode('ai');
                  void ctrl.handleGenerateAiMessage(ctrl.selectedTone);
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
                  ctrl.mode === 'ai'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 dark:text-slate-400'
                )}
              >
                <Sparkles size={13} />
                الذكاء الاصطناعي
              </button>
              <button
                type="button"
                onClick={() => {
                  if (ctrl.mode === 'template') return;
                  ctrl.setMode('template');
                  ctrl.applyTemplate();
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
                  ctrl.mode === 'template'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 dark:text-slate-400'
                )}
              >
                القوالب الجاهزة
              </button>
            </div>

            <button
              type="button"
              onClick={ctrl.handleCopyMessage}
              className="flex items-center gap-1.5 rounded-xl bg-gray-200/70 px-3 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-300 dark:bg-slate-800 dark:text-slate-300"
            >
              {ctrl.isCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              {ctrl.isCopied ? 'تم النسخ' : 'نسخ النص'}
            </button>
          </div>
        }
        footerClassName="justify-between flex-wrap"
        footer={
          <ReminderFooterActions
            hasPhone={ctrl.hasPhone}
            canSend={canSend}
            isSendingDirect={ctrl.isSendingDirect}
            onClose={onClose}
            onSendDirect={() => {
              void ctrl.handleSendDirectUltraMsg();
            }}
            onOpenQr={() => {
              ctrl.setIsQrModalOpen(true);
            }}
            onOpenWhatsApp={ctrl.openWhatsApp}
            onConfirmManual={ctrl.confirmSent}
          />
        }
      >
        <ReminderToneAndTemplatePicker
          mode={ctrl.mode}
          selectedTone={ctrl.selectedTone}
          isGeneratingAi={ctrl.isGeneratingAi}
          onSelectTone={tone => {
            if (ctrl.selectedTone === tone && ctrl.isGeneratingAi) return;
            ctrl.setSelectedTone(tone);
            void ctrl.handleGenerateAiMessage(tone);
          }}
          onRegenerateAi={() => {
            void ctrl.handleGenerateAiMessage(ctrl.selectedTone);
          }}
          templates={ctrl.templates}
          selectedTemplateId={ctrl.selectedTemplateId}
          onSelectTemplate={id => {
            ctrl.setSelectedTemplateId(id);
            ctrl.applyTemplate(id);
          }}
        />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="reminder-whatsapp-text"
              className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400"
            >
              نص رسالة الواتساب (قابل للتعديل):
            </label>
            {ctrl.isGeneratingAi && (
              <span className="flex animate-pulse items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400">
                <RotateCcw size={11} className="animate-spin" />
                جاري صياغة الرسالة بالذكاء الاصطناعي...
              </span>
            )}
          </div>
          <textarea
            id="reminder-whatsapp-text"
            value={ctrl.message}
            onChange={e => {
              ctrl.setMessage(e.target.value);
            }}
            rows={8}
            dir="rtl"
            className="w-full rounded-2xl border border-gray-200 bg-gray-50/50 p-3.5 text-xs font-bold leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-500/40 dark:border-slate-700 dark:bg-slate-800/60"
          />
        </div>

        <div className="flex flex-col items-stretch justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone size={16} />
            </div>
            <div>
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                رقم واتساب العميل المستلم:
              </span>
              <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                {row.party_name}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="tel"
              value={ctrl.phone}
              onChange={e => {
                ctrl.setPhone(e.target.value);
              }}
              aria-label="رقم واتساب العميل المستلم"
              placeholder="مثال: 779816860 أو 967779816860"
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-1.5 font-mono text-xs font-bold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white sm:w-56"
              dir="ltr"
            />
          </div>
        </div>

        {!ctrl.hasPhone && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
            <PhoneOff size={16} className="mt-0.5 shrink-0" />
            يرجى كتابة رقم هاتف العميل في الحقل أعلاه لتفعيل زر الإرسال الفوري عبر واتساب.
          </div>
        )}

        {ctrl.pendingSend !== null && !ctrl.isSent && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-3.5 text-xs font-extrabold text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
            <span className="flex items-center gap-2">
              <Send size={16} />
              فُتح واتساب — هل أُرسلت الرسالة فعلاً؟
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={ctrl.confirmSent}
                disabled={ctrl.isSaving}
                className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-50"
              >
                نعم — تسجيل الإرسال
              </button>
              <button
                type="button"
                onClick={() => {
                  ctrl.setPendingSend(null);
                }}
                className="rounded-xl border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                لم أُرسل — إلغاء
              </button>
            </span>
          </div>
        )}

        {ctrl.isSent && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-extrabold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
            <Check size={16} />
            تم إرسال التذكير بنجاح وتوثيقه في سجل متابعة الديون! ✅
          </div>
        )}
      </DebtsModalShell>

      <WhatsAppSessionModal
        isOpen={ctrl.isQrModalOpen}
        onClose={() => {
          ctrl.setIsQrModalOpen(false);
        }}
        credentials={{ url: ctrl.channelConfig?.whatsapp_api_url }}
      />
    </>
  );
};

export default ReminderModal;
