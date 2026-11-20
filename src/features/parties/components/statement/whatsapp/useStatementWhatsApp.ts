import { useState, useMemo, useEffect, useRef } from 'react';
import { formatLocalDate } from '../../../../../core/utils/dateUtils';
import {
  buildWhatsAppLink,
  buildWhatsAppWebLink,
  hasValidWhatsAppPhone,
} from '../../../../../core/utils/whatsapp';
import { useFeedbackStore } from '../../../../feedback/store';
import { debtAiService } from '../../../../debts/services/debtAiService';
import { messagingApi } from '../../../../notifications/messagingApi';
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

const hasTextValue = (val: string | null | undefined): val is string =>
  val !== null && val !== undefined && val.length > 0;

const buildDateRangeLabel = (
  startDate: string | undefined,
  endDate: string | undefined
): string => {
  const hasStart = hasTextValue(startDate);
  const hasEnd = hasTextValue(endDate);
  if (hasStart && hasEnd) return `من ${startDate} إلى ${endDate}`;
  if (hasStart) return `من ${startDate}`;
  if (hasEnd) return `حتى ${endDate}`;
  return `حتى تاريخ ${formatLocalDate()}`;
};

const buildBankInfoLabel = (company: CompanyInfo): string | undefined => {
  const bankName = hasTextValue(company.bank_name) ? company.bank_name : '';
  const bankIban = hasTextValue(company.bank_account_iban) ? company.bank_account_iban : '';
  if (bankName === '' && bankIban === '') return undefined;
  return `البنك: ${bankName !== '' ? bankName : '—'} | الآيبان: ${bankIban !== '' ? bankIban : '—'}`;
};

const triggerBlobDownload = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const notifyDirectSendFailure = (
  error: string | undefined,
  fallback: string,
  showToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void
): void => {
  const errMsg = hasTextValue(error) ? error : fallback;
  if (errMsg.includes('not connected') || errMsg.includes('qr')) {
    showToast(
      'جلسة واتساب غير مقترنة (بحاجة لمسح QR). يرجى ربط واتساب من لوحة الوكيل الذكي',
      'warning'
    );
  } else {
    showToast(errMsg, 'error');
  }
};

export interface UseStatementWhatsAppResult {
  activeTab: 'excel' | 'image' | 'text';
  setActiveTab: React.Dispatch<React.SetStateAction<'excel' | 'image' | 'text'>>;
  phone: string;
  setPhone: React.Dispatch<React.SetStateAction<string>>;
  isValidPhone: boolean;
  isExportingExcel: boolean;
  isCapturingImage: boolean;
  isSendingDirect: boolean;
  copiedType: 'text' | 'image' | null;
  gridImageRef: React.RefObject<HTMLDivElement | null>;
  sarMovements: UseStatementWhatsAppParams['movements'];
  yerMovements: UseStatementWhatsAppParams['movements'];
  sarSummary: ReturnType<typeof summarizeByCurrency>[number] | undefined;
  yerSummary: ReturnType<typeof summarizeByCurrency>[number] | undefined;
  dateRangeText: string;
  bankInfoText: string | undefined;
  whatsappMessage: string;
  handleShareExcel: () => Promise<void>;
  handleDownloadExcel: () => Promise<void>;
  handleCopyGridImage: () => Promise<void>;
  handleDownloadGridImage: () => Promise<void>;
  handleSendDirectUltraMsg: () => Promise<void>;
  handleSendGridImageDirectUltraMsg: () => Promise<void>;
  handleCopyText: () => Promise<void>;
  handleOpenWhatsAppWeb: () => void;
  handleOpenWhatsAppApp: () => void;
}

/* eslint-disable max-lines-per-function */
const useStatementDerivedData = (params: {
  partyName: string;
  company: CompanyInfo;
  companyNameAr: string;
  movements: UseStatementWhatsAppParams['movements'];
  startDate: string | undefined;
  endDate: string | undefined;
}): {
  statementEntries: StatementEntry[];
  sarMovements: UseStatementWhatsAppParams['movements'];
  yerMovements: UseStatementWhatsAppParams['movements'];
  sarSummary: ReturnType<typeof summarizeByCurrency>[number] | undefined;
  yerSummary: ReturnType<typeof summarizeByCurrency>[number] | undefined;
  dateRangeText: string;
  bankInfoText: string | undefined;
  whatsappMessage: string;
} => {
  const { partyName, company, companyNameAr, movements, startDate, endDate } = params;
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

  const statementEntries: StatementEntry[] = useMemo(
    () =>
      movements.map(r => ({
        date: r.date,
        operation_type: r.operation_type ?? '',
        reference_no: r.ref,
        desc: r.desc,
        debit: toAmount(r.debit),
        credit: toAmount(r.credit),
        balance: toAmount(r.balance),
        payment_status: r.payment_status,
        currency: r.currency || 'SAR',
      })),
    [movements]
  );

  const dateRangeText = useMemo(
    () => buildDateRangeLabel(startDate, endDate),
    [startDate, endDate]
  );
  const bankInfoText = useMemo(() => buildBankInfoLabel(company), [company]);

  const whatsappMessage = useMemo(
    () =>
      debtAiService.generateWhatsAppStatementSummary({
        partyName,
        companyName: companyNameAr,
        dateRangeText,
        ...(hasTextValue(bankInfoText) ? { bankInfo: bankInfoText } : {}),
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
      }),
    [partyName, companyNameAr, dateRangeText, bankInfoText, currencySummaries, movements]
  );

  return {
    statementEntries,
    sarMovements,
    yerMovements,
    sarSummary,
    yerSummary,
    dateRangeText,
    bankInfoText,
    whatsappMessage,
  };
};

const useStatementMediaHandlers = (params: {
  company: CompanyInfo;
  partyName: string;
  partyType: UseStatementWhatsAppParams['partyType'];
  phone: string;
  isValidPhone: boolean;
  startDate: string | undefined;
  endDate: string | undefined;
  statementEntries: StatementEntry[];
  whatsappMessage: string;
  gridImageRef: React.RefObject<HTMLDivElement | null>;
  setCopiedType: React.Dispatch<React.SetStateAction<'text' | 'image' | null>>;
  showToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}): {
  isExportingExcel: boolean;
  isCapturingImage: boolean;
  handleShareExcel: () => Promise<void>;
  handleDownloadExcel: () => Promise<void>;
  handleCopyGridImage: () => Promise<void>;
  handleDownloadGridImage: () => Promise<void>;
} => {
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isCapturingImage, setIsCapturingImage] = useState(false);
  const exportRole = params.partyType === 'supplier' ? 'supplier' : 'customer';

  const handleShareExcel = async (): Promise<void> => {
    setIsExportingExcel(true);
    try {
      const blob = await generateStatementExcelBlob(
        params.company,
        params.partyName,
        params.statementEntries,
        {
          partyType: exportRole,
          partyPhone: params.phone,
          dateFrom: params.startDate,
          dateTo: params.endDate,
        }
      );

      const fileName = `كشف_حساب_${params.partyName.replace(/\s+/g, '_')}_${formatLocalDate()}.xlsx`;
      const file = new File([blob], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const shareNavigator: ShareCapabilities = navigator;
      if (shareNavigator.canShare?.({ files: [file] }) === true) {
        await navigator.share({
          files: [file],
          title: `كشف حساب ${params.partyName}`,
          text: params.whatsappMessage,
        });
        params.showToast('تمت مشاركة كشف حساب Excel بنجاح', 'success');
      } else {
        triggerBlobDownload(blob, fileName);
        await navigator.clipboard.writeText(params.whatsappMessage);
        params.showToast(
          'تم تنزيل ملف Excel ونسخ نص الكشف للحافظة! جاري فتح واتساب ويب...',
          'info'
        );
        if (params.isValidPhone) {
          const waLink = buildWhatsAppWebLink(params.phone, params.whatsappMessage);
          window.open(waLink, '_blank', 'noopener,noreferrer');
        }
      }
    } catch {
      params.showToast('تعذر تصدير أو مشاركة ملف Excel', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleDownloadExcel = async (): Promise<void> => {
    setIsExportingExcel(true);
    try {
      await exportStatementToExcel(params.company, params.partyName, params.statementEntries, {
        partyType: exportRole,
        partyPhone: params.phone,
        dateFrom: params.startDate,
        dateTo: params.endDate,
      });
      params.showToast('تم تنزيل كشف الحساب Excel بنجاح', 'success');
    } catch {
      params.showToast('فشل تنزيل ملف Excel', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleCapturedImageBlob = async (blob: Blob | null): Promise<void> => {
    if (blob === null) {
      params.showToast('فشل توليد صورة الجريد', 'error');
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
        params.setCopiedType('image');
        setTimeout(() => {
          params.setCopiedType(null);
        }, 3000);
        params.showToast(
          'تم نسخ صورة كشف الحساب بنجاح! يمكنك الآن لصقها (Ctrl+V) مباشرة في واتساب',
          'success'
        );
      } catch {
        params.showToast('المتصفح لم يسمح بالنسخ المباشر للصورة، يرجى استخدام زر التحميل', 'info');
      }
    } else {
      params.showToast('المتصفح لا يدعم نسخ الصور المباشر، تم توفير زر التحميل', 'info');
    }
    setIsCapturingImage(false);
  };

  const handleCopyGridImage = async (): Promise<void> => {
    if (!params.gridImageRef.current) return;
    setIsCapturingImage(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(params.gridImageRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      canvas.toBlob(blob => {
        void handleCapturedImageBlob(blob);
      }, 'image/png');
    } catch {
      params.showToast('حدث خطأ أثناء التقاط صورة الجريد', 'error');
      setIsCapturingImage(false);
    }
  };

  const handleDownloadGridImage = async (): Promise<void> => {
    if (!params.gridImageRef.current) return;
    setIsCapturingImage(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(params.gridImageRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `كشف_حساب_${params.partyName.replace(/\s+/g, '_')}_${formatLocalDate()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      params.showToast('تم تحميل صورة الجريد بنجاح', 'success');
    } catch {
      params.showToast('فشل تحميل صورة الجريد', 'error');
    } finally {
      setIsCapturingImage(false);
    }
  };

  return {
    isExportingExcel,
    isCapturingImage,
    handleShareExcel,
    handleDownloadExcel,
    handleCopyGridImage,
    handleDownloadGridImage,
  };
};

const useStatementDirectSendHandlers = (params: {
  party: UseStatementWhatsAppParams['party'];
  companyNameAr: string;
  phone: string;
  isValidPhone: boolean;
  whatsappMessage: string;
  gridImageRef: React.RefObject<HTMLDivElement | null>;
  setCopiedType: React.Dispatch<React.SetStateAction<'text' | 'image' | null>>;
  showToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}): {
  isSendingDirect: boolean;
  handleSendDirectUltraMsg: () => Promise<void>;
  handleSendGridImageDirectUltraMsg: () => Promise<void>;
  handleCopyText: () => Promise<void>;
  handleOpenWhatsAppWeb: () => void;
  handleOpenWhatsAppApp: () => void;
} => {
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
    window.open(buildWhatsAppWebLink(params.phone, params.whatsappMessage), '_blank', 'noopener,noreferrer');
  };

  const handleOpenWhatsAppApp = (): void => {
    if (!params.isValidPhone) {
      params.showToast('يرجى التأكد من إدخال رقم هاتف صالح للعميل', 'error');
      return;
    }
    window.open(buildWhatsAppLink(params.phone, params.whatsappMessage), '_blank', 'noopener,noreferrer');
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

export const useStatementWhatsApp = ({
  party,
  partyType,
  movements,
  startDate,
  endDate,
  company,
  companyNameAr,
}: UseStatementWhatsAppParams): UseStatementWhatsAppResult => {
  const { showToast } = useFeedbackStore();
  const [activeTab, setActiveTab] = useState<'excel' | 'image' | 'text'>('excel');
  const [phone, setPhone] = useState(party.phone ?? '');
  const [copiedType, setCopiedType] = useState<'text' | 'image' | null>(null);
  const gridImageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasTextValue(party.phone)) setPhone(party.phone);
  }, [party.phone]);

  const derived = useStatementDerivedData({
    partyName: party.name,
    company,
    companyNameAr,
    movements,
    startDate,
    endDate,
  });

  const isValidPhone = hasValidWhatsAppPhone(phone);

  const mediaHandlers = useStatementMediaHandlers({
    company,
    partyName: party.name,
    partyType,
    phone,
    isValidPhone,
    startDate,
    endDate,
    statementEntries: derived.statementEntries,
    whatsappMessage: derived.whatsappMessage,
    gridImageRef,
    setCopiedType,
    showToast,
  });

  const directSendHandlers = useStatementDirectSendHandlers({
    party,
    companyNameAr,
    phone,
    isValidPhone,
    whatsappMessage: derived.whatsappMessage,
    gridImageRef,
    setCopiedType,
    showToast,
  });

  return {
    activeTab,
    setActiveTab,
    phone,
    setPhone,
    isValidPhone,
    copiedType,
    gridImageRef,
    sarMovements: derived.sarMovements,
    yerMovements: derived.yerMovements,
    sarSummary: derived.sarSummary,
    yerSummary: derived.yerSummary,
    dateRangeText: derived.dateRangeText,
    bankInfoText: derived.bankInfoText,
    whatsappMessage: derived.whatsappMessage,
    ...mediaHandlers,
    ...directSendHandlers,
  };
};

