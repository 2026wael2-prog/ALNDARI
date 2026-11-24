import type { ChatwootPartySummary } from '../api/chatwootWidgetApi';
import { formatLocalDate } from '@/core/utils/dateUtils';
import { formatCurrency } from '@/core/utils';

export interface RecentPartyItem {
  id: string;
  name: string;
  phone: string | null;
  type: string;
}

export interface PromiseFormState {
  amount: string;
  currency: string;
  date: string;
  notes: string;
  isSubmitting: boolean;
}

const rawChatwootOrigin = (import.meta.env.VITE_CHATWOOT_ORIGIN as string | undefined) ?? '';
const configuredChatwootOrigin = rawChatwootOrigin.trim().replace(/\/+$/, '');

export const hasNonEmptyString = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value.length > 0;

const isAllowedChatwootOrigin = (origin: string): boolean => {
  if (origin.length === 0 || origin === 'null') return false;
  if (origin === window.location.origin) return true;
  if (configuredChatwootOrigin.length > 0) {
    return origin === configuredChatwootOrigin;
  }
  return false;
};

export const isTrustedMessageEvent = (event: MessageEvent): boolean => {
  if (!isAllowedChatwootOrigin(event.origin)) return false;
  if (
    event.origin !== window.location.origin &&
    window.parent !== window &&
    event.source !== window.parent
  ) {
    return false;
  }
  return true;
};

const asPlainObject = (value: unknown): Record<string, unknown> | null => {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export const extractPhoneFromMessageData = (rawData: unknown): string | null => {
  try {
    const parsed: unknown =
      typeof rawData === 'string' ? (JSON.parse(rawData) as unknown) : rawData;
    const payload = asPlainObject(parsed);
    if (!payload) return null;
    if (payload.event !== undefined && payload.event !== 'appContext') return null;

    const dataObj = asPlainObject(payload.data);
    const contact = asPlainObject(dataObj?.contact ?? payload.contact);
    const incomingPhone = contact?.phone_number ?? contact?.phone;
    if (typeof incomingPhone !== 'string') return null;
    const cleanPhone = incomingPhone.trim();
    return cleanPhone.length >= 6 && cleanPhone.length <= 32 ? cleanPhone : null;
  } catch {
    return null;
  }
};

export const extractInitialPhoneFromLocation = (): string | null => {
  const hashQuery = window.location.hash.split('?')[1] ?? '';
  const searchStr = window.location.search.length > 0 ? window.location.search : hashQuery;
  const params = new URLSearchParams(searchStr);
  const candidates = [
    params.get('phone'),
    params.get('phone_number'),
    params.get('contact[phone_number]'),
    params.get('contact_phone'),
    params.get('q'),
  ];
  return candidates.find(hasNonEmptyString) ?? null;
};

export const buildCustomerSummaryText = (summaryData: ChatwootPartySummary): string => {
  const balanceLines =
    summaryData.balances.length > 0
      ? summaryData.balances
          .map(b => `${formatCurrency(b.balance)} ${b.currency_code}`)
          .join(' و ')
      : 'لا توجد مديونية مسجلة';

  return `أهلاً بك أخي ${summaryData.party.name}،
رصيد حسابك الحالي لدى مؤسسة الجعفري لقطع الغيار حتى تاريخ اليوم (${formatLocalDate()}):
💰 ${balanceLines}

شاكرين تعاونكم الدائم معنا 🌹`;
};

export const getPartyTypeLabel = (type: string): string => {
  if (type === 'customer') return 'عميل';
  if (type === 'supplier') return 'مورد';
  return 'عميل ومورد';
};

export const getBalanceToneClass = (balance: number): string => {
  if (balance > 0) return 'text-rose-600 dark:text-rose-400';
  if (balance < 0) return 'text-emerald-600 dark:text-emerald-400';
  return 'text-slate-500';
};
