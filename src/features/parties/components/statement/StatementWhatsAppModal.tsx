/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Image as ImageIcon,
  MessageSquare,
  Phone,
  Send,
  Share2,
  Smartphone,
  X,
} from 'lucide-react';
import { formatLocalDate } from '../../../../core/utils/dateUtils';
import {
  buildWhatsAppLink,
  buildWhatsAppWebLink,
  hasValidWhatsAppPhone,
} from '../../../../core/utils/whatsapp';
import { useFeedbackStore } from '../../../feedback/store';
import { debtAiService } from '../../../debts/services/debtAiService';
import {
  generateStatementExcelBlob,
  exportStatementToExcel,
  type CompanyInfo,
  type StatementEntry,
} from '../../utils/statementExcelExporter';
import type { StatementMovement } from '../../service';
import type { Party, PartyType } from '../../types';

interface CurrencySummary {
  currency: string;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  count: number;
}

/**
 * Minimal shape of the UltraMsg gateway JSON payload.
 * The endpoint is external, so every field is validated at the boundary.
 */
interface UltraMsgResponse {
  sent?: string | boolean | undefined;
  error?: string | undefined;
  message?: string | undefined;
}

/** Runtime capability view of `navigator` for clipboard image copying. */
interface ClipboardCapabilities {
  clipboard?:
    | {
        write?: ((items: ClipboardItem[]) => Promise<void>) | undefined;
      }
    | undefined;
}

/** Runtime capability view of `navigator` for the Web Share API. */
interface ShareCapabilities {
  canShare?: ((data?: ShareData) => boolean) | undefined;
  share?: ((data?: ShareData) => Promise<void>) | undefined;
}

/** Runtime capability view of the global scope for `ClipboardItem`. */
interface ClipboardItemGlobal {
  ClipboardItem?: typeof ClipboardItem | undefined;
}

/** Coerce a possibly non-numeric amount exactly like `Number(value) || 0`. */
const toAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** Read a scalar message/error field, mirroring the gateway's truthiness rules. */
const readMessageField = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value === '' ? undefined : value;
  if (typeof value === 'number') return value === 0 ? undefined : String(value);
  return undefined;
};

/** Safely parse an untrusted UltraMsg JSON response into a precise interface. */
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

/** Group movements by normalized currency, preserving first-seen order. */
const summarizeByCurrency = (movements: StatementMovement[]): CurrencySummary[] => {
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

/** Normalize a raw phone string to the Yemeni international format. */
const formatToPhone = (rawPhone: string): string => {
  const digits = rawPhone.replace(/[^\d]/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `967${digits.slice(1)}`;
  if (digits.length === 9) return `967${digits}`;
  return digits;
};

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
  const { showToast } = useFeedbackStore();
  const [activeTab, setActiveTab] = useState<'excel' | 'image' | 'text'>('excel');
  const [phone, setPhone] = useState(party.phone || '');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isCapturingImage, setIsCapturingImage] = useState(false);
  const [isSendingDirect, setIsSendingDirect] = useState(false);
  const [copiedType, setCopiedType] = useState<'text' | 'image' | null>(null);

  const gridImageRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (party.phone) {
      setPhone(party.phone);
    }
  }, [party.phone]);

  // Group calculations strictly partitioned by currency
  const currencySummaries = useMemo(() => summarizeByCurrency(movements), [movements]);

  // Separate movements for visual preview
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

  // Convert to StatementEntry[]
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

  // WhatsApp formatted text
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

  if (!isOpen) return null;

  const isValidPhone = hasValidWhatsAppPhone(phone);

  // Handle Share Excel via Web Share API or download + open WhatsApp
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
        // Fallback: download excel file, copy text, open WhatsApp Web
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

  // Handle Download Excel only
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

  // Handle Capture & Copy Image to Clipboard
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

  // Handle Download Grid Image
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

  // إرسال مباشر للنص عبر UltraMsg
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

  // إرسال صورة الجريد مباشرة عبر UltraMsg
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

  // Handle Copy text
  const handleCopyText = async (): Promise<void> => {
    await navigator.clipboard.writeText(whatsappMessage);
    setCopiedType('text');
    setTimeout(() => setCopiedType(null), 2500);
    showToast('تم نسخ نص الرسالة للحافظة بنجاح', 'success');
  };

  // Handle Open WhatsApp Web
  const handleOpenWhatsAppWeb = (): void => {
    if (!isValidPhone) {
      showToast('يرجى التأكد من إدخال رقم هاتف صالح للعميل', 'error');
      return;
    }
    const link = buildWhatsAppWebLink(phone, whatsappMessage);
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  // Handle Open WhatsApp App
  const handleOpenWhatsAppApp = (): void => {
    if (!isValidPhone) {
      showToast('يرجى التأكد من إدخال رقم هاتف صالح للعميل', 'error');
      return;
    }
    const link = buildWhatsAppLink(phone, whatsappMessage);
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm duration-200">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--app-border)] bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/15 p-2 backdrop-blur-md">
              <Share2 size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                إرسال كشف الحساب عبر واتساب (Excel Grid)
              </h2>
              <p className="text-xs text-emerald-100">
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
              العميل / الطرف:
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
                <span
                  className="font-mono font-bold text-blue-900 dark:text-blue-200"
                  dir="ltr"
                >
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
                <span
                  className="font-mono font-bold text-emerald-900 dark:text-emerald-200"
                  dir="ltr"
                >
                  {(yerSummary?.finalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--app-border)] bg-slate-100/70 p-2 dark:bg-slate-800/40">
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
          {/* TAB 1: EXCEL WORKBOOK SHARE */}
          {activeTab === 'excel' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-6 text-center dark:border-emerald-800/50 dark:bg-emerald-950/20">
                <div className="rounded-2xl bg-emerald-600 p-4 text-white shadow-lg shadow-emerald-600/20">
                  <FileSpreadsheet size={36} />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">
                  ملف إكسل تفصيلي عصري متعدد العملات (.xlsx)
                </h3>
                <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                  ملف إكسل مهيأ بحدود شبكية بارزة بين الخلايا والأعمدة، وتنسيق ألوان رسمي، مع
                  أوراق عمل مستقلة لكل من <strong>الريال السعودي (SAR)</strong> و{' '}
                  <strong>الريال اليمني (YER)</strong> لمنع أي تضارب محاسبي.
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void handleShareExcel();
                    }}
                    disabled={isExportingExcel}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Share2 size={16} />
                    {isExportingExcel ? 'جاري تجهيز الملف...' : 'مشاركة ملف Excel عبر واتساب'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void handleDownloadExcel();
                    }}
                    disabled={isExportingExcel}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Download size={15} />
                    تنزيل ملف Excel فقط
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--app-border)] bg-slate-50 p-4 text-xs text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  💡 للمستخدمين على الكمبيوتر (WhatsApp Web):
                </span>
                <p className="mt-1 leading-relaxed text-[11px] text-slate-500 dark:text-slate-400">
                  عند النقر على زر المشاركة، سيتم تنزيل ملف الإكسل الملون فوراً ونسخ نص الرسالة وفتح محادثة واتساب الخاصة بالعميل. يكفيك سحب الملف المُنزل وإفلاته في نافذة المحادثة لإرساله مباشرة!
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: COLORFUL GRID IMAGE SNAPSHOT */}
          {activeTab === 'image' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-blue-50 px-4 py-2.5 text-xs font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                <span>
                  📸 يمكنك نسخ صورة الجريد ولصقها مباشرة في واتساب ويب (Ctrl+V) كصورة ملونة عالية الجودة!
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleSendGridImageDirectUltraMsg();
                    }}
                    disabled={isCapturingImage || isSendingDirect || !isValidPhone}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    title="إرسال صورة الجريد الملون مباشرة لواتساب العميل من رقم المنشأة"
                  >
                    <Send size={13} className={isSendingDirect ? 'animate-spin' : ''} />
                    {isSendingDirect ? 'جاري الإرسال...' : 'إرسال الصورة للعميل'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopyGridImage();
                    }}
                    disabled={isCapturingImage}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {copiedType === 'image' ? <Check size={14} /> : <Copy size={14} />}
                    {copiedType === 'image' ? 'تم النسخ!' : 'نسخ الصورة للحافظة'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDownloadGridImage();
                    }}
                    disabled={isCapturingImage}
                    className="flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-800 dark:text-blue-300"
                  >
                    <Download size={14} />
                    تحميل PNG
                  </button>
                </div>
              </div>

              {/* Rendered Visual Excel Grid Card */}
              <div className="overflow-x-auto rounded-xl border border-slate-300 bg-slate-100 p-3 shadow-inner dark:border-slate-700 dark:bg-slate-900">
                <div
                  ref={gridImageRef}
                  className="mx-auto min-w-[680px] max-w-[800px] rounded-lg border border-slate-300 bg-white p-6 shadow-sm text-slate-800 font-sans"
                  dir="rtl"
                >
                  {/* Brand Header */}
                  <div className="border-b-2 border-[#1E3A8A] pb-3 text-center">
                    <h1 className="text-lg font-bold text-[#1E3A8A]">{companyNameAr}</h1>
                    <h2 className="text-xs font-bold text-blue-600">
                      كشف حساب مالي تفصيلي متعدد العملات (Excel Grid)
                    </h2>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {company.address ? `العنوان: ${company.address} | ` : ''}
                      {company.phone ? `هاتف: ${company.phone} | ` : ''}
                      {company.tax_number ? `الرقم الضريبي: ${company.tax_number}` : ''}
                    </p>
                  </div>

                  {/* Client Info Grid */}
                  <div className="my-3 grid grid-cols-3 gap-2 rounded border border-slate-300 bg-slate-50 p-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-500">الطرف:</span>{' '}
                      <span className="font-bold text-slate-900">{party.name}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500">الفترة:</span>{' '}
                      <span className="font-medium text-slate-800">{dateRangeText}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500">تاريخ التقرير:</span>{' '}
                      <span className="font-mono text-slate-800">{formatLocalDate()}</span>
                    </div>
                  </div>

                  {/* SAR Table Grid (if has SAR movements) */}
                  {sarMovements.length > 0 && (
                    <div className="mb-4">
                      <div className="mb-1 flex items-center justify-between rounded-t bg-[#1E3A8A] px-3 py-1.5 text-white">
                        <span className="text-xs font-bold">🇸🇦 حركات الريال السعودي (SAR)</span>
                        <span className="text-[10px] font-mono">
                          صافي الرصيد: {(sarSummary?.finalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR
                        </span>
                      </div>
                      <table className="w-full border-collapse border border-slate-400 text-center text-[11px]">
                        <thead>
                          <tr className="bg-slate-200 font-bold text-slate-900">
                            <th className="border border-slate-400 p-1 w-8">م</th>
                            <th className="border border-slate-400 p-1 w-20">التاريخ</th>
                            <th className="border border-slate-400 p-1 w-20">المرجع</th>
                            <th className="border border-slate-400 p-1">البيان</th>
                            <th className="border border-slate-400 p-1 w-20">مدين (+)</th>
                            <th className="border border-slate-400 p-1 w-20">دائن (-)</th>
                            <th className="border border-slate-400 p-1 w-24">الرصيد (SAR)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sarMovements.slice(-8).map((m, idx) => (
                            <tr key={m.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <td className="border border-slate-300 p-1">{idx + 1}</td>
                              <td className="border border-slate-300 p-1 font-mono text-[10px]">{m.date}</td>
                              <td className="border border-slate-300 p-1 font-mono text-blue-700">{m.ref}</td>
                              <td className="border border-slate-300 p-1 text-right">{m.desc}</td>
                              <td className="border border-slate-300 p-1 font-mono text-emerald-700 font-bold">
                                {m.debit > 0 ? m.debit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                              </td>
                              <td className="border border-slate-300 p-1 font-mono text-rose-700 font-bold">
                                {m.credit > 0 ? m.credit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                              </td>
                              <td className="border border-slate-300 p-1 font-mono bg-blue-50 font-bold text-[#1E3A8A]">
                                {(m.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-200 font-bold text-slate-900 border-t-2 border-slate-600">
                            <td colSpan={4} className="border border-slate-400 p-1.5 text-right font-bold">
                              إجمالي الريال السعودي (SAR)
                            </td>
                            <td className="border border-slate-400 p-1.5 font-mono text-emerald-800">
                              {(sarSummary?.totalDebit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="border border-slate-400 p-1.5 font-mono text-rose-800">
                              {(sarSummary?.totalCredit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="border border-slate-400 p-1.5 font-mono bg-blue-100 text-blue-900 text-xs">
                              {(sarSummary?.finalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {/* YER Table Grid (if has YER movements) */}
                  {yerMovements.length > 0 && (
                    <div className="mb-4">
                      <div className="mb-1 flex items-center justify-between rounded-t bg-[#065F46] px-3 py-1.5 text-white">
                        <span className="text-xs font-bold">🇾🇪 حركات الريال اليمني (YER)</span>
                        <span className="text-[10px] font-mono">
                          صافي الرصيد: {(yerSummary?.finalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} YER
                        </span>
                      </div>
                      <table className="w-full border-collapse border border-slate-400 text-center text-[11px]">
                        <thead>
                          <tr className="bg-slate-200 font-bold text-slate-900">
                            <th className="border border-slate-400 p-1 w-8">م</th>
                            <th className="border border-slate-400 p-1 w-20">التاريخ</th>
                            <th className="border border-slate-400 p-1 w-20">المرجع</th>
                            <th className="border border-slate-400 p-1">البيان</th>
                            <th className="border border-slate-400 p-1 w-20">مدين (+)</th>
                            <th className="border border-slate-400 p-1 w-20">دائن (-)</th>
                            <th className="border border-slate-400 p-1 w-24">الرصيد (YER)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {yerMovements.slice(-8).map((m, idx) => (
                            <tr key={m.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <td className="border border-slate-300 p-1">{idx + 1}</td>
                              <td className="border border-slate-300 p-1 font-mono text-[10px]">{m.date}</td>
                              <td className="border border-slate-300 p-1 font-mono text-emerald-800">{m.ref}</td>
                              <td className="border border-slate-300 p-1 text-right">{m.desc}</td>
                              <td className="border border-slate-300 p-1 font-mono text-emerald-700 font-bold">
                                {m.debit > 0 ? m.debit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                              </td>
                              <td className="border border-slate-300 p-1 font-mono text-rose-700 font-bold">
                                {m.credit > 0 ? m.credit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                              </td>
                              <td className="border border-slate-300 p-1 font-mono bg-emerald-50 font-bold text-[#065F46]">
                                {(m.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-200 font-bold text-slate-900 border-t-2 border-slate-600">
                            <td colSpan={4} className="border border-slate-400 p-1.5 text-right font-bold">
                              إجمالي الريال اليمني (YER)
                            </td>
                            <td className="border border-slate-400 p-1.5 font-mono text-emerald-800">
                              {(yerSummary?.totalDebit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="border border-slate-400 p-1.5 font-mono text-rose-800">
                              {(yerSummary?.totalCredit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="border border-slate-400 p-1.5 font-mono bg-emerald-100 text-emerald-900 text-xs">
                              {(yerSummary?.finalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {/* Bank info footer */}
                  {bankInfoText && (
                    <div className="mt-3 rounded border border-slate-300 bg-slate-50 p-2 text-center text-[10px] text-slate-600">
                      💳 {bankInfoText}
                    </div>
                  )}
                  <div className="mt-2 text-center text-[10px] text-slate-400">
                    تم استخراج هذا الكشف آلياً من منظومة الجعفري لإدارة المبيعات والمحاسبة.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: WHATSAPP FORMATTED TEXT */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  نص الرسالة المنظم مع تفريق العملات:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleSendDirectUltraMsg();
                    }}
                    disabled={!isValidPhone || isSendingDirect}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    title="إرسال فوري تلقائي من رقم المنشأة مباشرة دون فتح أي نافذة"
                  >
                    <Send size={13} className={isSendingDirect ? 'animate-spin' : ''} />
                    {isSendingDirect ? 'جاري الإرسال...' : 'إرسال فوري من رقم المحل'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopyText();
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {copiedType === 'text' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    {copiedType === 'text' ? 'تم النسخ!' : 'نسخ النص'}
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenWhatsAppWeb}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                  >
                    <ExternalLink size={14} />
                    فتح واتساب ويب
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenWhatsAppApp}
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
    </div>
  );
};
