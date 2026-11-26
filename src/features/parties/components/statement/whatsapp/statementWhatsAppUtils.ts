import { formatLocalDate } from '../../../../../core/utils/dateUtils';
import type { CompanyInfo } from '../../../utils/statementExcelExporter';
import type { StatementMovement } from '../../../service';

export interface CurrencySummary {
  currency: string;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  count: number;
}

export const toAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const summarizeByCurrency = (
  movements: StatementMovement[],
  isNewestFirst = false
): CurrencySummary[] => {
  const summaries = new Map<string, CurrencySummary>();
  movements.forEach(m => {
    const curr = (m.currency || 'SAR').trim().toUpperCase();
    const existing = summaries.get(curr);
    if (!existing) {
      summaries.set(curr, {
        currency: curr,
        totalDebit: toAmount(m.debit),
        totalCredit: toAmount(m.credit),
        finalBalance: toAmount(m.balance),
        count: 1,
      });
    } else {
      existing.totalDebit += toAmount(m.debit);
      existing.totalCredit += toAmount(m.credit);
      if (!isNewestFirst) {
        existing.finalBalance = toAmount(m.balance);
      }
      existing.count += 1;
    }
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

export const hasTextValue = (val: string | null | undefined): val is string =>
  val !== null && val !== undefined && val.length > 0;

export const buildDateRangeLabel = (
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

export const buildBankInfoLabel = (company: CompanyInfo): string | undefined => {
  const bankName = hasTextValue(company.bank_name) ? company.bank_name : '';
  const bankIban = hasTextValue(company.bank_account_iban) ? company.bank_account_iban : '';
  if (bankName === '' && bankIban === '') return undefined;
  return `البنك: ${bankName !== '' ? bankName : '—'} | الآيبان: ${bankIban !== '' ? bankIban : '—'}`;
};

export const triggerBlobDownload = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const notifyDirectSendFailure = (
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
