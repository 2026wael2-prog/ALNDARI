import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../../auth/store';
import { useFeedbackStore } from '../../../feedback/store';
import {
  useDebtChannelConfig,
  useDebtFollowupConfig,
  useDebtTemplates,
} from '../../hooks/useDebtQueries';
import { useDebtMutations } from '../../hooks/useDebtMutations';
import { debtsService } from '../../services/debtService';
import { debtAiService, type ReminderTone } from '../../services/debtAiService';
import { messagingApi } from '../../../notifications/messagingApi';
import { buildWhatsAppLink, buildWhatsAppWebLink } from '../../lib/whatsapp';
import { createIdempotencyKey } from '../../../../core/utils/idempotency';
import type { FollowUpDashboardRow } from '../../types';

export const REMINDER_TONES: Array<{
  key: ReminderTone;
  label: string;
  icon: string;
  desc: string;
}> = [
  { key: 'friendly', label: 'ودي ومحترم', icon: '🤝', desc: 'تذكير لطيف للمستحقات القريبة' },
  { key: 'formal', label: 'رسمي ومهني', icon: '📋', desc: 'خطاب مالي للمنشآت والشركات' },
  { key: 'urgent', label: 'حازم وعاجل', icon: '⚠️', desc: 'للمتأخرات والوعود السابقة' },
  { key: 'legal', label: 'إشعار نهائي', icon: '⚖️', desc: 'تنبيه نهائي قبل وقف الحساب' },
];

const formatToPhone = (rawPhone: string): string => {
  const digits = rawPhone.replace(/[^\d]/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `967${digits.slice(1)}`;
  if (digits.length === 9) return `967${digits}`;
  return digits;
};

export function useReminderModalController(isOpen: boolean, row: FollowUpDashboardRow) {
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
  const [pendingSend, setPendingSend] = useState<'app' | 'web' | null>(null);

  const idempotencyKeyRef = useRef(createIdempotencyKey('debt-reminder'));
  const aiRequestIdRef = useRef(0);

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
      if (currentReqId !== aiRequestIdRef.current) return;
      setMessage(res.message);
    } catch {
      if (currentReqId !== aiRequestIdRef.current) return;
      showToast('تعذر توليد الرسالة بالذكاء الاصطناعي، تم استخدام القالب الافتراضي', 'info');
    } finally {
      if (currentReqId === aiRequestIdRef.current) setIsGeneratingAi(false);
    }
  };

  const applyTemplate = (templateId?: string): void => {
    const targetId = templateId ?? selectedTemplateId;
    const selectedTemplate = templates?.find(t => t.id === targetId) ?? templates?.[0];
    const prepared = debtsService.prepareReminder(row, selectedTemplate?.body ?? '', {
      companyName: user?.company_name,
      signature: config?.reminder_signature,
    });
    setMessage(prepared.message);
    if (selectedTemplate?.id && targetId !== selectedTemplate.id) {
      setSelectedTemplateId(selectedTemplate.id);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setIsSent(false);
    setIsCopied(false);
    setPendingSend(null);
    setPhone(row.party_phone ?? '');
    if (mode === 'ai') void handleGenerateAiMessage(selectedTone);
    else applyTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, row.party_id, row.party_phone]);

  useEffect(() => {
    if (!isOpen || mode !== 'template' || message.trim() !== '' || !templates?.length) return;
    applyTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, templates]);

  const handleCopyMessage = (): void => {
    void navigator.clipboard.writeText(message);
    setIsCopied(true);
    showToast('تم نسخ نص الرسالة بنجاح', 'success');
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  const recordSuccessfulReminder = (recipient: string | null): void => {
    recordReminder(
      {
        partyId: row.party_id,
        messageText: message,
        templateId: mode === 'template' && selectedTemplateId !== '' ? selectedTemplateId : null,
        recipient,
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
    if (!user?.company_id) {
      showToast('تعذر تحديد المنشأة الحالية', 'error');
      return;
    }

    setIsSendingDirect(true);
    try {
      const sendRes = await messagingApi.sendDirectWhatsApp({
        companyId: user.company_id,
        toPhone: cleanTo,
        message,
        eventType: 'share',
        referenceId: row.party_id,
      });

      if (sendRes.ok) {
        showToast('تم إرسال تذكير المديونية مباشرة إلى واتساب العميل بنجاح! 🚀', 'success');
        recordSuccessfulReminder(cleanTo);
      } else {
        const errMsg = sendRes.error || 'تعذر الإرسال عبر البوابة';
        if (errMsg.includes('not connected') || errMsg.includes('qr')) {
          showToast(
            'جلسة واتساب غير مقترنة (بحاجة لمسح رمز QR). تم فتح نافذة الاقتران للمسح الآن',
            'warning'
          );
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

  const openWhatsApp = (target: 'app' | 'web'): void => {
    if (message.trim() === '') return;
    const rawPhone = phone.trim();
    if (!rawPhone) {
      showToast('يرجى إدخال رقم هاتف العميل أولاً', 'error');
      return;
    }
    const cleanPhone = formatToPhone(rawPhone);
    const link =
      target === 'app'
        ? buildWhatsAppLink(cleanPhone, message)
        : buildWhatsAppWebLink(cleanPhone, message);
    window.open(link, '_blank', 'noopener,noreferrer');
    setPendingSend(target);
  };

  const confirmSent = (): void => {
    const rawPhone = phone.trim();
    recordSuccessfulReminder(rawPhone !== '' ? formatToPhone(rawPhone) : null);
  };

  return {
    templates,
    channelConfig,
    isSaving,
    mode,
    setMode,
    selectedTone,
    setSelectedTone,
    selectedTemplateId,
    setSelectedTemplateId,
    message,
    setMessage,
    phone,
    setPhone,
    hasPhone: phone.trim() !== '',
    isGeneratingAi,
    isSent,
    isCopied,
    isSendingDirect,
    isQrModalOpen,
    setIsQrModalOpen,
    pendingSend,
    setPendingSend,
    handleGenerateAiMessage,
    applyTemplate,
    handleCopyMessage,
    handleSendDirectUltraMsg,
    openWhatsApp,
    confirmSent,
  };
}
