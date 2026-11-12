import { useState, useMemo, useEffect, useRef } from 'react';
import { formatLocalDate } from '../../../../../core/utils/dateUtils';
import {
  buildWhatsAppLink,
  buildWhatsAppWebLink,
  hasValidWhatsAppPhone,
} from '../../../../../core/utils/whatsapp';
import { useFeedbackStore } from '../../../../feedback/store';
import { debtAiService } from '../../../../debts/services/debtAiService';
import {
  generateStatementExcelBlob,
  exportStatementToExcel,
  type CompanyInfo,
  type StatementEntry,
} from '../../../utils/statementExcelExporter';
import type { StatementMovement } from '../../../service';
import type { Party, PartyType } from '../../../types';

export interface CurrencySummary {
  currency: string;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  count: number;
}

interface UltraMsgResponse {
  sent?: string | boolean | undefined;
  error?: string | undefined;
  message?: string | undefined;
}

interface ClipboardCapabilities {
  clipboard?: {
    write?: ((items: ClipboardItem[]) => Promise<void>) | undefined;
  };
}

interface ShareCapabilities {
  canShare?: ((data?: ShareData) => boolean) | undefined;
  share?: ((data?: ShareData) => Promise<void>) | undefined;
}

interface ClipboardItemGlobal {
  ClipboardItem?: typeof ClipboardItem | undefined;
}

export const toAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const readMessageField = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value === '' ? undefined : value;
  if (typeof value === 'number') return value === 0 ? undefined : String(value);
  return undefined;
};

const parseUltraMsgResponse = (raw: unknown): UltraMsgResponse => {
  if (typeof raw !== 'object' || raw === null) return {};
  const { sent, error, message } = raw as Record<string, unknown>;
  const parsed: UltraMsgResponse = {};
  if (typeof sent === 'string' || typeof sent === 'boolean') parsed.sent = sent;
  const errorText = readMessageField(error);
  if (errorText !== undefined) parsed.error = errorText;
  const messageText = readMessageField(message);
  if (messageText !== undefined) parsed.message = messageText;
  return parsed;
};

const pickUltraMsgError = (data: UltraMsgResponse, fallback: string): string =>
  data.error ?? data.message ?? fallback;

export const summarizeByCurrency = (movements: StatementMovement[]): CurrencySummary[] => {
  const summaries = new Map<string, CurrencySummary>();
  movements.forEach(m => {
    const curr = (m.currency || 'SAR').trim().toUpperCase();
    const existing = summaries.get(curr) ?? {
      currency: curr,
      totalDebit: 0,
      totalCredit: 0,
      finalBalance: 0,
      count: 0,
    };
    existing.totalDebit += toAmount(m.debit);
    existing.totalCredit += toAmount(m.credit);
    existing.finalBalance = toAmount(m.balance);
    existing.count += 1;
    summaries.set(curr, existing);
  });
  return Array.from(summaries.values());
};

export const formatToPhone = (rawPhone: string): string => {
  const digits = rawPhone.replace(/[^\d]/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `967${digits.slice(1)}`;
  if (digits.length === 9) return `967${digits}`;
  return digits;
};

export interface UseStatementWhatsAppParams {
  party: Party;
  partyType: PartyType;
  movements: StatementMovement[];
  startDate?: string | undefined;
  endDate?: string | undefined;
  company: CompanyInfo;
  companyNameAr: string;
}

export const useStatementWhatsApp = ({
  party,
  partyType,
  movements,
  startDate,
  endDate,
  company,
  companyNameAr,
}: UseStatementWhatsAppParams) => {
  const { showToast } = useFeedbackStore();
  const [activeTab, setActiveTab] = useState<'excel' | 'image' | 'text'>('excel');
  const [phone, setPhone] = useState(party.phone || '');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isCapturingImage, setIsCapturingImage] = useState(false);
  const [isSendingDirect, setIsSendingDirect] = useState(false);
  const [copiedType, setCopiedType] = useState<'text' | 'image' | null>(null);

  const gridImageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (party.phone) {
      setPhone(party.phone);
    }
  }, [party.phone]);

  const currencySummaries = useMemo(() => summarizeByCurrency(movements), [movements]);

  const sarMovements = useMemo(
    () => movements.filter(m => (m.currency || 'SAR').trim().toUpperCase() === 'SAR'),
    [movements]
  );
  const yerMovements = useMemo(
    () => movements.filter(m => (m.currency || 'SAR').trim().toUpperCase() === 'YER'),
    [movements]
  );

  const sarSummary = useMemo(
    () => currencySummaries.find(c => c.currency === 'SAR'),
    [currencySummaries]
  );
  const yerSummary = useMemo(
    () => currencySummaries.find(c => c.currency === 'YER'),
    [currencySummaries]
  );

  const statementEntries: StatementEntry[] = useMemo(() => {
    return movements.map(r => ({
      date: r.date,
      operation_type: r.operation_type ?? '',
      reference_no: r.ref,
      desc: r.desc,
      debit: toAmount(r.debit),
      credit: toAmount(r.credit),
      balance: toAmount(r.balance),
      payment_status: r.payment_status,
      currency: r.currency || 'SAR',
    }));
  }, [movements]);

  const dateRangeText = useMemo(() => {
    if (startDate && endDate) return `من ${startDate} إلى ${endDate}`;
    if (startDate) return `من ${startDate}`;
    if (endDate) return `حتى ${endDate}`;
    return `حتى تاريخ ${formatLocalDate()}`;
  }, [startDate, endDate]);

  const bankInfoText = useMemo(() => {
    if (!company.bank_name && !company.bank_account_iban) return undefined;
    return `البنك: ${company.bank_name || '—'} | الآيبان: ${company.bank_account_iban || '—'}`;
  }, [company.bank_name, company.bank_account_iban]);

  const whatsappMessage = useMemo(() => {
    return debtAiService.generateWhatsAppStatementSummary({
      partyName: party.name,
      companyName: companyNameAr,
      dateRangeText,
      ...(bankInfoText ? { bankInfo: bankInfoText } : {}),
      currencies: currencySummaries.map(c => ({
        currency: c.currency,
        totalDebit: c.totalDebit,
        totalCredit: c.totalCredit,
        finalBalance: c.finalBalance,
      })),
      movements: movements.slice(-10).map(m => ({
        date: m.date,
        ref: m.ref,
        desc: m.desc,
        debit: m.debit,
        credit: m.credit,
        balance: m.balance,
        currency: m.currency,
      })),
    });
  }, [party.name, companyNameAr, dateRangeText, bankInfoText, currencySummaries, movements]);

  const isValidPhone = hasValidWhatsAppPhone(phone);

  const handleShareExcel = async (): Promise<void> => {
    setIsExportingExcel(true);
    try {
      const blob = await generateStatementExcelBlob(
        company,
        party.name,
        statementEntries,
        {
          partyType: partyType === 'supplier' ? 'supplier' : 'customer',
          partyPhone: phone,
          dateFrom: startDate,
          dateTo: endDate,
        }
      );

      const fileName = `كشف_حساب_${party.name.replace(/\s+/g, '_')}_${formatLocalDate()}.xlsx`;
      const file = new File([blob], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const shareNavigator: ShareCapabilities = navigator;
      if (shareNavigator.canShare?.({ files: [file] }) === true) {
        await navigator.share({
          files: [file],
          title: `كشف حساب ${party.name}`,
          text: whatsappMessage,
        });
        showToast('تمت مشاركة كشف حساب Excel بنجاح', 'success');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        await navigator.clipboard.writeText(whatsappMessage);
        showToast(
          'تم تنزيل ملف Excel ونسخ نص الكشف للحافظة! جاري فتح واتساب ويب...',
          'info'
        );

        if (isValidPhone) {
          const waLink = buildWhatsAppWebLink(phone, whatsappMessage);
          window.open(waLink, '_blank', 'noopener,noreferrer');
        }
      }
    } catch {
      showToast('تعذر تصدير أو مشاركة ملف Excel', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleDownloadExcel = async (): Promise<void> => {
    setIsExportingExcel(true);
    try {
      await exportStatementToExcel(company, party.name, statementEntries, {
        partyType: partyType === 'supplier' ? 'supplier' : 'customer',
        partyPhone: phone,
        dateFrom: startDate,
        dateTo: endDate,
      });
      showToast('تم تنزيل كشف الحساب Excel بنجاح', 'success');
    } catch {
      showToast('فشل تنزيل ملف Excel', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleCapturedImageBlob = async (blob: Blob | null): Promise<void> => {
    if (blob === null) {
      showToast('فشل توليد صورة الجريد', 'error');
      setIsCapturingImage(false);
      return;
    }

    const clipboardNavigator: ClipboardCapabilities = navigator;
    const clipboardApi = clipboardNavigator.clipboard;
    const clipboardItemCtor: typeof ClipboardItem | undefined = (
      globalThis as ClipboardItemGlobal
    ).ClipboardItem;

    if (clipboardItemCtor !== undefined && clipboardApi?.write !== undefined) {
      try {
        const item = new clipboardItemCtor({ 'image/png': blob });
        await clipboardApi.write([item]);
        setCopiedType('image');
        setTimeout(() => setCopiedType(null), 3000);
        showToast(
          'تم نسخ صورة كشف الحساب بنجاح! يمكنك الآن لصقها (Ctrl+V) مباشرة في واتساب',
          'success'
        );
      } catch {
        showToast('المتصفح لم يسمح بالنسخ المباشر للصورة، يرجى استخدام زر التحميل', 'info');
      }
    } else {
      showToast('المتصفح لا يدعم نسخ الصور المباشر، تم توفير زر التحميل', 'info');
    }
    setIsCapturingImage(false);
  };

  const handleCopyGridImage = async (): Promise<void> => {
    if (!gridImageRef.current) return;
    setIsCapturingImage(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(gridImageRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      canvas.toBlob(blob => {
        void handleCapturedImageBlob(blob);
      }, 'image/png');
    } catch {
      showToast('حدث خطأ أثناء التقاط صورة الجريد', 'error');
      setIsCapturingImage(false);
    }
  };

  const handleDownloadGridImage = async (): Promise<void> => {
    if (!gridImageRef.current) return;
    setIsCapturingImage(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(gridImageRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `كشف_حساب_${party.name.replace(/\s+/g, '_')}_${formatLocalDate()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('تم تحميل صورة الجريد بنجاح', 'success');
    } catch {
      showToast('فشل تحميل صورة الجريد', 'error');
    } finally {
      setIsCapturingImage(false);
    }
  };

  const handleSendDirectUltraMsg = async (): Promise<void> => {
    if (!isValidPhone) {
      showToast('يرجى التأكد من صحة رقم العميل أولاً', 'error');
      return;
    }
    setIsSendingDirect(true);
    try {
      const cleanTo = formatToPhone(phone);
      const params = new URLSearchParams({
        token: 'mkojxebwykcncp10',
        to: cleanTo,
        body: whatsappMessage,
        priority: '5',
        referenceId: party.id,
      });

      const res = await fetch('https://api.ultramsg.com/instance196299/messages/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data = parseUltraMsgResponse(await res.json().catch(() => null));
      if (res.ok && (data.sent === 'true' || data.sent === true)) {
        showToast('تم إرسال كشف الحساب مباشرة للعميل عبر واتساب المنشأة الرسمي! ✨', 'success');
      } else {
        const errMsg = pickUltraMsgError(data, 'تعذر الإرسال عبر البوابة');
        if (errMsg.includes('not connected') || errMsg.includes('qr')) {
          showToast('جلسة واتساب غير مقترنة (بحاجة لمسح QR). يرجى ربط واتساب من لوحة الوكيل الذكي', 'warning');
        } else {
          showToast(errMsg, 'error');
        }
      }
    } catch {
      showToast('حدث خطأ أثناء محاولة الإرسال المباشر', 'error');
    } finally {
      setIsSendingDirect(false);
    }
  };

  const handleSendGridImageDirectUltraMsg = async (): Promise<void> => {
    if (!gridImageRef.current || !isValidPhone) {
      showToast('يرجى التأكد من صحة رقم العميل أولاً', 'error');
      return;
    }
    setIsSendingDirect(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(gridImageRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const dataUrl = canvas.toDataURL('image/png');
      const cleanTo = formatToPhone(phone);

      const res = await fetch('https://api.ultramsg.com/instance196299/messages/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'mkojxebwykcncp10',
          to: cleanTo,
          image: dataUrl,
          caption: `كشف حساب معتمد للعميل: ${party.name} — منشأة الجعفري لقطع الغيار`,
          priority: 5,
          referenceId: party.id,
        }),
      });

      const data = parseUltraMsgResponse(await res.json().catch(() => null));
      if (res.ok && (data.sent === 'true' || data.sent === true)) {
        showToast('تم إرسال صورة كشف الحساب مباشرة لواتساب العميل بنجاح! 📸', 'success');
      } else {
        const errMsg = pickUltraMsgError(data, 'تعذر إرسال الصورة عبر البوابة');
        if (errMsg.includes('not connected') || errMsg.includes('qr')) {
          showToast('جلسة واتساب غير مقترنة (بحاجة لمسح QR). يرجى ربط واتساب من لوحة الوكيل الذكي', 'warning');
        } else {
          showToast(errMsg, 'error');
        }
      }
    } catch {
      showToast('حدث خطأ أثناء إرسال صورة الكشف', 'error');
    } finally {
      setIsSendingDirect(false);
    }
  };

  const handleCopyText = async (): Promise<void> => {
    await navigator.clipboard.writeText(whatsappMessage);
    setCopiedType('text');
    setTimeout(() => setCopiedType(null), 2500);
    showToast('تم نسخ نص الرسالة للحافظة بنجاح', 'success');
  };

  const handleOpenWhatsAppWeb = (): void => {
    if (!isValidPhone) {
      showToast('يرجى التأكد من إدخال رقم هاتف صالح للعميل', 'error');
      return;
    }
    const link = buildWhatsAppWebLink(phone, whatsappMessage);
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const handleOpenWhatsAppApp = (): void => {
    if (!isValidPhone) {
      showToast('يرجى التأكد من إدخال رقم هاتف صالح للعميل', 'error');
      return;
    }
    const link = buildWhatsAppLink(phone, whatsappMessage);
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  return {
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
  };
};

