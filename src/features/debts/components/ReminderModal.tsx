import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  PhoneOff,
  Sparkles,
  Copy,
  Check,
  Globe,
  Send,
  Smartphone,
  RotateCcw,
  Loader2,
  QrCode,
} from 'lucide-react';
import { cn } from '../../../core/utils';
import { useAuthStore } from '../../auth/store';
import { useFeedbackStore } from '../../feedback/store';
import { useDebtTemplates, useDebtFollowupConfig, useDebtChannelConfig } from '../hooks/useDebtQueries';
import { useDebtMutations } from '../hooks/useDebtMutations';
import { debtsService } from '../services/debtService';
import { debtAiService, type ReminderTone } from '../services/debtAiService';
import { ultraMsgService } from '../services/ultraMsgService';
import { WhatsAppSessionModal } from './agent/WhatsAppSessionModal';
import { buildWhatsAppLink, buildWhatsAppWebLink } from '../lib/whatsapp';
import { createIdempotencyKey } from '../../../core/utils/idempotency';
import type { FollowUpDashboardRow } from '../types';
import { DebtsModalShell } from './DebtsModalShell';

interface ReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: FollowUpDashboardRow;
}

const TONES: Array<{ key: ReminderTone; label: string; icon: string; desc: string }> = [
  { key: 'friendly', label: 'ودي ومحترم', icon: '🤝', desc: 'تذكير لطيف للمستحقات القريبة' },
  { key: 'formal', label: 'رسمي ومهني', icon: '📋', desc: 'خطاب مالي للمنشآت والشركات' },
  { key: 'urgent', label: 'حازم وعاجل', icon: '⚠️', desc: 'للمتأخرات والوعود السابقة' },
  { key: 'legal', label: 'إشعار نهائي', icon: '⚖️', desc: 'تنبيه نهائي قبل وقف الحساب' },
];

export const ReminderModal: React.FC<ReminderModalProps> = ({ isOpen, onClose, row }) => {
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const { data: templates } = useDebtTemplates(true);
  const { data: config } = useDebtFollowupConfig();
  const { recordReminder, isSaving } = useDebtMutations();
  const { data: channelConfig } = useDebtChannelConfig();

  const [mode, setMode] = useState<'ai' | 'template'>('ai');
  const [selectedTone, setSelectedTone] = useState<ReminderTone>('formal');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState(row.party_phone ?? '');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSendingDirect, setIsSendingDirect] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  // S1 — تدفق الصدق: لا يُسجَّل التذكير إلا بعد تأكيد المستخدم أن الرسالة أُرسلت فعلاً.
  const [pendingSend, setPendingSend] = useState<'app' | 'web' | null>(null);
  // مفتاح عدم التكرار: ثابت لعملية الإرسال الواحدة (يمنع تسجيلها مرتين)،
  // ويُجدَّد بعد كل نجاح ليسمح بإرسال تذكير جديد مقصود لاحقاً.
  const idempotencyKeyRef = useRef(createIdempotencyKey('debt-reminder'));
  // معرّف تسلسلي لطلبات الذكاء الاصطناعي لإلغاء أي استجابة سابقة قديمة عند النقر السريع بين النبرات
  const aiRequestIdRef = useRef(0);

  // Generate AI reminder with sequence tracking to ignore stale responses
  const handleGenerateAiMessage = async (tone: ReminderTone): Promise<void> => {
    const currentReqId = ++aiRequestIdRef.current;
    setIsGeneratingAi(true);
    const companyName = user?.company_name ?? '';
    const signature = config?.reminder_signature ?? '';
    try {
      const res = await debtAiService.generateSmartReminder({
        row,
        tone,
        ...(companyName !== '' ? { companyName } : {}),
        ...(signature !== '' ? { bankDetails: signature } : {}),
      });
      // تجنب استبدال النص إذا تم إطلاق طلب أحدث
      if (currentReqId !== aiRequestIdRef.current) return;
      setMessage(res.message);
    } catch {
      if (currentReqId !== aiRequestIdRef.current) return;
      showToast('تعذر توليد الرسالة بالذكاء الاصطناعي، تم استخدام القالب الافتراضي', 'info');
    } finally {
      if (currentReqId === aiRequestIdRef.current) {
        setIsGeneratingAi(false);
      }
    }
  };

  const applyTemplate = (templateId?: string): void => {
    const targetId = templateId ?? selectedTemplateId;
    const selectedTemplate = templates?.find(t => t.id === targetId) ?? templates?.[0];
    const body = selectedTemplate?.body ?? '';
    const prepared = debtsService.prepareReminder(row, body, {
      companyName: user?.company_name,
      signature: config?.reminder_signature,
    });
    setMessage(prepared.message);
    if (selectedTemplate?.id && targetId !== selectedTemplate.id) {
      setSelectedTemplateId(selectedTemplate.id);
    }
  };

  // تهيئة الحالة عند فتح النافذة فقط (يمنع التكرار والازدواج عند النقر بين النبرات)
  useEffect(() => {
    if (!isOpen) return;
    setIsSent(false);
    setIsCopied(false);
    setPendingSend(null);
    setPhone(row.party_phone ?? '');

    if (mode === 'ai') {
      void handleGenerateAiMessage(selectedTone);
    } else {
      applyTemplate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, row.party_id, row.party_phone]);

  // تحديث نص القالب عند تحميل القوالب في وضع القوالب الجاهزة
  useEffect(() => {
    if (!isOpen || mode !== 'template' || message.trim() !== '' || !templates?.length) return;
    applyTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, templates]);

  if (!isOpen) return null;

  const handleCopyMessage = (): void => {
    void navigator.clipboard.writeText(message);
    setIsCopied(true);
    showToast('تم نسخ نص الرسالة بنجاح', 'success');
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  const formatToPhone = (rawPhone: string): string => {
    const digits = rawPhone.replace(/[^\d]/g, '');
    if (digits.startsWith('00')) return digits.slice(2);
    if (digits.startsWith('0')) return `967${digits.slice(1)}`;
    if (digits.length === 9) return `967${digits}`;
    return digits;
  };

  /**
   * إرسال فوري ومباشر للتذكير إلى واتساب العميل عبر بوابة UltraMsg الرسمية.
   * لا يحتاج لفتح المتصفح أو أي تدخل يدوي، ويوثق الإرسال مباشرة فور النجاح.
   */
  const handleSendDirectUltraMsg = async (): Promise<void> => {
    if (message.trim() === '') {
      showToast('يرجى كتابة أو اختيار نص الرسالة أولاً', 'error');
      return;
    }
    const rawPhone = phone.trim();
    if (!rawPhone) {
      showToast('يرجى إدخال رقم هاتف العميل المستلم أولاً', 'error');
      return;
    }
    const cleanTo = formatToPhone(rawPhone);
    if (!cleanTo || cleanTo.length < 8) {
      showToast('رقم هاتف العميل غير صالح للإرسال عبر واتساب', 'error');
      return;
    }

    setIsSendingDirect(true);
    try {
      const sendRes = await ultraMsgService.sendChatMessage({
        to: cleanTo,
        body: message,
        priority: 5,
        referenceId: row.party_id,
        credentials: {
          url: channelConfig?.whatsapp_api_url,
        },
      });

      if (sendRes.sent) {
        showToast('تم إرسال تذكير المديونية مباشرة إلى واتساب العميل بنجاح! 🚀', 'success');
        recordReminder(
          {
            partyId: row.party_id,
            messageText: message,
            templateId: mode === 'template' && selectedTemplateId !== '' ? selectedTemplateId : null,
            recipient: cleanTo,
            idempotencyKey: idempotencyKeyRef.current,
          },
          {
            onSuccess: () => {
              idempotencyKeyRef.current = createIdempotencyKey('debt-reminder');
              setPendingSend(null);
              setIsSent(true);
            },
          }
        );
      } else {
        const errMsg = sendRes.error || 'تعذر الإرسال عبر البوابة';
        if (errMsg.includes('not connected') || errMsg.includes('qr')) {
          showToast('جلسة واتساب غير مقترنة (بحاجة لمسح رمز QR). تم فتح نافذة الاقتران للمسح الآن', 'warning');
          setIsQrModalOpen(true);
        } else {
          showToast(`فشل الإرسال عبر UltraMsg: ${errMsg}`, 'error');
        }
      }
    } catch {
      showToast('حدث خطأ أثناء الاتصال ببوابة UltraMsg', 'error');
    } finally {
      setIsSendingDirect(false);
    }
  };

  /**
   * S1 — تدفق الصدق: يفتح واتساب أولاً ولا يُسجّل شيئاً.
   * التسجيل يحدث فقط بعد تأكيد المستخدم أن الرسالة أُرسلت فعلاً، فلا يزعم
   * السجل إرسالاً غير متحقَّق منه، ولا يختفي العميل زوراً من «بحاجة تذكير».
   */
  const openWhatsApp = (target: 'app' | 'web'): void => {
    if (message.trim() === '') return;
    const rawPhone = phone.trim();
    if (!rawPhone) {
      showToast('يرجى إدخال رقم هاتف العميل أولاً', 'error');
      return;
    }
    const cleanPhone = formatToPhone(rawPhone);
    const link =
      target === 'app' ? buildWhatsAppLink(cleanPhone, message) : buildWhatsAppWebLink(cleanPhone, message);
    window.open(link, '_blank', 'noopener,noreferrer');
    setPendingSend(target);
  };

  /** تأكيد الإرسال الفعلي — الآن فقط يُسجَّل التذكير في سجل المتابعة. */
  const confirmSent = (): void => {
    const rawPhone = phone.trim();
    recordReminder(
      {
        partyId: row.party_id,
        messageText: message,
        templateId: mode === 'template' && selectedTemplateId !== '' ? selectedTemplateId : null,
        recipient: rawPhone !== '' ? formatToPhone(rawPhone) : null,
        idempotencyKey: idempotencyKeyRef.current,
      },
      {
        onSuccess: () => {
          idempotencyKeyRef.current = createIdempotencyKey('debt-reminder');
          setPendingSend(null);
          setIsSent(true);
        },
      }
    );
  };

  const hasPhone = phone.trim() !== '';

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
                if (mode === 'ai') return;
                setMode('ai');
                void handleGenerateAiMessage(selectedTone);
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
                mode === 'ai'
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
                if (mode === 'template') return;
                setMode('template');
                applyTemplate();
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all',
                mode === 'template'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 dark:text-slate-400'
              )}
            >
              القوالب الجاهزة
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyMessage}
            className="flex items-center gap-1.5 rounded-xl bg-gray-200/70 px-3 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-300 dark:bg-slate-800 dark:text-slate-300"
          >
            {isCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            {isCopied ? 'تم النسخ' : 'نسخ النص'}
          </button>
        </div>
      }
      footerClassName="justify-between flex-wrap"
      footer={
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
                  onClick={() => {
                    void handleSendDirectUltraMsg();
                  }}
                  disabled={message.trim() === '' || isSaving || isSendingDirect}
                  title="إرسال فوري ومباشر إلى واتساب العميل عبر بوابة المحل الرسمية UltraMsg دون أي تدخل يدوي"
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSendingDirect ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  <span>{isSendingDirect ? 'جاري الإرسال الفوري...' : 'إرسال فوري من رقم المحل (تلقائي)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsQrModalOpen(true)}
                  title="فحص جلسة بوابة واتساب ومسح رمز QR"
                  className="flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-50 px-2.5 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300"
                >
                  <QrCode size={14} />
                  <span>فحص الجلسة (QR)</span>
                </button>
              </>
            )}

            {hasPhone && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    openWhatsApp('app');
                  }}
                  disabled={message.trim() === '' || isSaving || isSendingDirect}
                  title="فتح تطبيق واتساب على الهاتف أو الكمبيوتر للإرسال اليدوي"
                  className="flex items-center gap-1.5 rounded-xl border border-green-600/30 bg-green-50 px-3 py-2 text-xs font-bold text-green-700 transition-all hover:bg-green-100 dark:bg-green-950/30 dark:text-green-300"
                >
                  <Smartphone size={14} />
                  تطبيق واتساب (يدوي)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    openWhatsApp('web');
                  }}
                  disabled={message.trim() === '' || isSaving || isSendingDirect}
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
              onClick={confirmSent}
              disabled={message.trim() === '' || isSaving || isSendingDirect}
              title="توثيق تواصل يدوي دون إرسال رسالة (اتصال هاتفي أو زيارة ميدانية)"
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            >
              <Check size={14} />
              توثيق تواصل يدوي فقط
            </button>
          </div>
        </>
      }
    >
      {/* AI Tone Picker */}
      {mode === 'ai' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
              اختر نبرة الخطاب المطلوبة:
            </span>
            <button
              type="button"
              disabled={isGeneratingAi}
              onClick={() => {
                void handleGenerateAiMessage(selectedTone);
              }}
              className="flex items-center gap-1 text-[10px] font-bold text-purple-600 hover:underline disabled:opacity-50 dark:text-purple-400"
            >
              <RotateCcw size={11} className={isGeneratingAi ? 'animate-spin' : ''} />
              إعادة التوليد بالذكاء الاصطناعي
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TONES.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  if (selectedTone === t.key && isGeneratingAi) return;
                  setSelectedTone(t.key);
                  void handleGenerateAiMessage(t.key);
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

      {/* Template Picker */}
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
                  setSelectedTemplateId(t.id);
                  applyTemplate(t.id);
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

      {/* Message Textarea */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="reminder-whatsapp-text"
            className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400"
          >
            نص رسالة الواتساب (قابل للتعديل):
          </label>
          {isGeneratingAi && (
            <span className="flex animate-pulse items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400">
              <RotateCcw size={11} className="animate-spin" />
              جاري صياغة الرسالة بالذكاء الاصطناعي...
            </span>
          )}
        </div>
        <textarea
          id="reminder-whatsapp-text"
          value={message}
          onChange={e => {
            setMessage(e.target.value);
          }}
          rows={8}
          dir="rtl"
          className="w-full rounded-2xl border border-gray-200 bg-gray-50/50 p-3.5 text-xs font-bold leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-500/40 dark:border-slate-700 dark:bg-slate-800/60"
        />
      </div>

      {/* Recipient Phone Field */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
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
            value={phone}
            onChange={e => {
              setPhone(e.target.value);
            }}
            placeholder="مثال: 779816860 أو 967779816860"
            className="w-full sm:w-56 rounded-xl border border-gray-300 bg-white px-3 py-1.5 font-mono text-xs font-bold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            dir="ltr"
          />
        </div>
      </div>

      {/* Phone Warning */}
      {!hasPhone && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
          <PhoneOff size={16} className="mt-0.5 shrink-0" />
          يرجى كتابة رقم هاتف العميل في الحقل أعلاه لتفعيل زر الإرسال الفوري عبر واتساب.
        </div>
      )}

      {/* S1 — تأكيد الإرسال الفعلي: لا تسجيل بلا إرسال */}
      {pendingSend !== null && !isSent && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-3.5 text-xs font-extrabold text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
          <span className="flex items-center gap-2">
            <Send size={16} />
            فُتح واتساب — هل أُرسلت الرسالة فعلاً؟
          </span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={confirmSent}
              disabled={isSaving}
              className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-50"
            >
              نعم — تسجيل الإرسال
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingSend(null);
              }}
              className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              لم أُرسل — إلغاء
            </button>
          </span>
        </div>
      )}

      {/* Sent Success Message */}
      {isSent && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-extrabold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
          <Check size={16} />
          تم إرسال التذكير بنجاح وتوثيقه في سجل متابعة الديون! ✅
        </div>
      )}
    </DebtsModalShell>

    <WhatsAppSessionModal
      isOpen={isQrModalOpen}
      onClose={() => setIsQrModalOpen(false)}
      credentials={{ url: channelConfig?.whatsapp_api_url }}
    />
  </>
  );
};

export default ReminderModal;
