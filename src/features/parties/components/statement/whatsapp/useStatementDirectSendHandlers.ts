import type React from 'react';
import { useState } from 'react';
import { buildWhatsAppLink, buildWhatsAppWebLink } from '../../../../../core/utils/whatsapp';
import { messagingApi } from '../../../../notifications/messagingApi';
import type { Party } from '../../../types';
import { formatToPhone, notifyDirectSendFailure } from './statementWhatsAppUtils';

export interface StatementDirectSendParams {
  party: Party;
  companyNameAr: string;
  phone: string;
  isValidPhone: boolean;
  whatsappMessage: string;
  gridImageRef: React.RefObject<HTMLDivElement | null>;
  setCopiedType: React.Dispatch<React.SetStateAction<'text' | 'image' | null>>;
  showToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const useStatementDirectSendHandlers = (params: StatementDirectSendParams) => {
  const [isSendingDirect, setIsSendingDirect] = useState(false);

  const handleSendDirectUltraMsg = async (): Promise<void> => {
    if (!params.isValidPhone) {
      params.showToast('يرجى التأكد من صحة رقم العميل أولاً', 'error');
      return;
    }
    if (!params.party.company_id) {
      params.showToast('تعذر تحديد المنشأة المرتبطة بكشف الحساب', 'error');
      return;
    }
    setIsSendingDirect(true);
    try {
      const sendRes = await messagingApi.sendDirectWhatsApp({
        companyId: params.party.company_id,
        toPhone: formatToPhone(params.phone),
        message: params.whatsappMessage,
        eventType: 'share',
        referenceId: params.party.id,
      });

      if (sendRes.ok) {
        params.showToast('تم إرسال كشف الحساب مباشرة للعميل عبر واتساب المنشأة الرسمي! ✨', 'success');
      } else {
        notifyDirectSendFailure(sendRes.error, 'تعذر الإرسال عبر البوابة', params.showToast);
      }
    } catch {
      params.showToast('حدث خطأ أثناء محاولة الإرسال المباشر', 'error');
    } finally {
      setIsSendingDirect(false);
    }
  };

  const handleSendGridImageDirectUltraMsg = async (): Promise<void> => {
    if (!params.gridImageRef.current || !params.isValidPhone) {
      params.showToast('يرجى التأكد من صحة رقم العميل أولاً', 'error');
      return;
    }
    if (!params.party.company_id) {
      params.showToast('تعذر تحديد المنشأة المرتبطة بكشف الحساب', 'error');
      return;
    }
    setIsSendingDirect(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(params.gridImageRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const sendRes = await messagingApi.sendDirectWhatsApp({
        companyId: params.party.company_id,
        toPhone: formatToPhone(params.phone),
        message: `كشف حساب معتمد للعميل: ${params.party.name} — ${params.companyNameAr}`,
        eventType: 'share',
        referenceId: params.party.id,
        imageBase64: canvas.toDataURL('image/png'),
      });

      if (sendRes.ok) {
        params.showToast('تم إرسال صورة كشف الحساب مباشرة لواتساب العميل بنجاح! 📸', 'success');
      } else {
        notifyDirectSendFailure(sendRes.error, 'تعذر إرسال الصورة عبر البوابة', params.showToast);
      }
    } catch {
      params.showToast('حدث خطأ أثناء إرسال صورة الكشف', 'error');
    } finally {
      setIsSendingDirect(false);
    }
  };

  const handleCopyText = async (): Promise<void> => {
    await navigator.clipboard.writeText(params.whatsappMessage);
    params.setCopiedType('text');
    setTimeout(() => {
      params.setCopiedType(null);
    }, 2500);
    params.showToast('تم نسخ نص الرسالة للحافظة بنجاح', 'success');
  };

  const handleOpenWhatsAppWeb = (): void => {
    if (!params.isValidPhone) {
      params.showToast('يرجى التأكد من إدخال رقم هاتف صالح للعميل', 'error');
      return;
    }
    window.open(
      buildWhatsAppWebLink(params.phone, params.whatsappMessage),
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleOpenWhatsAppApp = (): void => {
    if (!params.isValidPhone) {
      params.showToast('يرجى التأكد من إدخال رقم هاتف صالح للعميل', 'error');
      return;
    }
    window.open(
      buildWhatsAppLink(params.phone, params.whatsappMessage),
      '_blank',
      'noopener,noreferrer'
    );
  };

  return {
    isSendingDirect,
    handleSendDirectUltraMsg,
    handleSendGridImageDirectUltraMsg,
    handleCopyText,
    handleOpenWhatsAppWeb,
    handleOpenWhatsAppApp,
  };
};
