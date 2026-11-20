/* eslint-disable max-lines-per-function, complexity */
import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  User,
  Phone,
  Wallet,
  Receipt,
  CalendarCheck,
  Copy,
  Check,
  Search,
  ExternalLink,
  PlusCircle,
  RefreshCw,
  Building2,
  AlertCircle,
  Loader2,
  MessageCircle,
  Headphones,
} from 'lucide-react';
import { chatwootWidgetApi, type ChatwootPartySummary } from './api/chatwootWidgetApi';
import { useAuthStore } from '@/features/auth/store';
import { formatLocalDate } from '@/core/utils/dateUtils';
import { formatCurrency } from '@/core/utils';

interface RecentPartyItem {
  id: string;
  name: string;
  phone: string | null;
  type: string;
}

const rawChatwootOrigin = (import.meta.env.VITE_CHATWOOT_ORIGIN as string | undefined) ?? '';
const configuredChatwootOrigin = rawChatwootOrigin.trim().replace(/\/+$/, '');

const hasNonEmptyString = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value.length > 0;

const isAllowedChatwootOrigin = (origin: string): boolean => {
  if (origin.length === 0 || origin === 'null') return false;
  if (origin === window.location.origin) return true;
  if (configuredChatwootOrigin.length > 0) {
    return origin === configuredChatwootOrigin;
  }
  return origin.startsWith('https://');
};

const isTrustedMessageEvent = (event: MessageEvent): boolean => {
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

const extractPhoneFromMessageData = (rawData: unknown): string | null => {
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

const extractInitialPhoneFromLocation = (): string | null => {
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

const buildCustomerSummaryText = (summaryData: ChatwootPartySummary): string => {
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

const FullOfficeHeader: React.FC<{
  isLoading: boolean;
  copiedWidgetUrl: boolean;
  onOpenWhatsApp: () => void;
  onCopyWidgetUrl: () => void;
  onRefresh: () => void;
}> = ({ isLoading, copiedWidgetUrl, onOpenWhatsApp, onCopyWidgetUrl, onRefresh }) => (
  <header className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/90 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20">
        <Headphones size={22} />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-base font-black tracking-tight text-slate-900 dark:text-white">
            خدمة العملاء ومكتب الواتساب
          </h1>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            مكتب تفاعلي
          </span>
        </div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          مطابقة فورية لأرصدة العملاء، الرد والمراسلة السريعة عبر الواتساب، وتسجيل وعود التحصيل
        </p>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onOpenWhatsApp}
        className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700"
        title="فتح شاشة واتساب ويب في نافذة جديدة"
      >
        <MessageCircle size={15} />
        <span>فتح واتساب ويب</span>
      </button>
      <button
        type="button"
        onClick={onCopyWidgetUrl}
        className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        title="نسخ رابط الودجت لاستخدامه كـ Dashboard App داخل Chatwoot"
      >
        {copiedWidgetUrl ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
        <span>{copiedWidgetUrl ? 'تم نسخ الرابط!' : 'رابط Chatwoot'}</span>
      </button>
      <button
        type="button"
        onClick={onRefresh}
        className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        title="تحديث البيانات"
      >
        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
      </button>
    </div>
  </header>
);

const StandaloneWidgetHeader: React.FC<{
  isLoading: boolean;
  onRefresh: () => void;
}> = ({ isLoading, onRefresh }) => (
  <header className="mb-3.5 flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
        <Building2 size={18} />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xs font-black tracking-tight text-slate-800 dark:text-white">
            الزهراء ERP
          </h1>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            خدمة العملاء والتحصيل
          </span>
        </div>
        <p className="text-[11px] font-medium text-slate-400">
          شاشة مطابقة الحسابات وودجت محادثات Chatwoot
        </p>
      </div>
    </div>
    <button
      type="button"
      onClick={onRefresh}
      className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      title="تحديث البيانات"
    >
      <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">تحديث</span>
    </button>
  </header>
);

const CustomerSearchSection: React.FC<{
  phoneQuery: string;
  onPhoneQueryChange: (value: string) => void;
  onSearch: (query: string) => void;
  recentParties: RecentPartyItem[];
  hasLoadedCustomer: boolean;
}> = ({ phoneQuery, onPhoneQueryChange, onSearch, recentParties, hasLoadedCustomer }) => (
  <div className="mb-3.5">
    <div className="relative">
      <input
        type="text"
        value={phoneQuery}
        onChange={e => {
          onPhoneQueryChange(e.target.value);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') onSearch(phoneQuery);
        }}
        placeholder="اكتب اسم العميل أو رقم هاتفه للمطابقة الفورية (مثال: 770000000 أو أحمد)..."
        className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pr-9 pl-16 text-xs font-bold text-slate-800 shadow-xs focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
      />
      <Search size={15} className="pointer-events-none absolute top-3 right-3 text-slate-400" />
      <button
        type="button"
        onClick={() => {
          onSearch(phoneQuery);
        }}
        className="absolute top-1.5 left-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700"
      >
        بحث
      </button>
    </div>

    {recentParties.length > 0 && !hasLoadedCustomer && (
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold text-slate-400">عملاء نشطون مؤخراً:</span>
        {recentParties.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              const q = hasNonEmptyString(p.phone) ? p.phone : p.name;
              onPhoneQueryChange(q);
              onSearch(q);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 shadow-xs transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {p.name}
          </button>
        ))}
      </div>
    )}
  </div>
);

const CustomerNotFoundCard: React.FC<{ phoneQuery: string }> = ({ phoneQuery }) => (
  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-center shadow-xs dark:border-amber-900/40 dark:bg-amber-950/20">
    <AlertCircle size={26} className="mx-auto text-amber-600 dark:text-amber-400" />
    <h2 className="mt-2 text-xs font-black text-amber-900 dark:text-amber-200">
      الرقم غير مسجل كعميل في المنظومة
    </h2>
    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
      لم يتم العثور على سجل مالي برقم ({phoneQuery}). يمكنك إضافة العميل إلى المنظومة لمتابعة
      حساباته.
    </p>
    <a
      href="#/parties"
      target="_blank"
      rel="noreferrer"
      className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700"
    >
      <User size={13} />
      <span>إضافة عميل جديد في ERP</span>
    </a>
  </div>
);

const getPartyTypeLabel = (type: string): string => {
  if (type === 'customer') return 'عميل';
  if (type === 'supplier') return 'مورد';
  return 'عميل ومورد';
};

const getBalanceToneClass = (balance: number): string => {
  if (balance > 0) return 'text-rose-600 dark:text-rose-400';
  if (balance < 0) return 'text-emerald-600 dark:text-emerald-400';
  return 'text-slate-500';
};

const CustomerOverviewColumn: React.FC<{
  data: ChatwootPartySummary;
  copiedSummary: boolean;
  onOpenWhatsApp: () => void;
  onCopySummary: () => void;
}> = ({ data, copiedSummary, onOpenWhatsApp, onCopySummary }) => {
  const hasPhone = hasNonEmptyString(data.party.phone);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex items-start justify-between">
          <div>
            <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {getPartyTypeLabel(data.party.type)}
            </span>
            <h2 className="mt-1 text-sm font-black text-slate-800 dark:text-white">
              {data.party.name}
            </h2>
          </div>
          <a
            href="#/parties"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50/60 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
            title="فتح ملف العميل الكامل في تبويب جديد"
          >
            <span>الملف</span>
            <ExternalLink size={11} />
          </a>
        </div>

        {hasPhone && (
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span className="text-[11px] text-slate-400">الجوال المسجل:</span>
            <div className="flex items-center gap-1.5" dir="ltr">
              <Phone size={12} className="text-slate-400" />
              <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                {data.party.phone}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <Wallet size={14} className="text-emerald-600" />
            <span>الأرصدة الحالية</span>
          </div>
          <div className="flex items-center gap-1.5">
            {hasPhone && (
              <button
                type="button"
                onClick={onOpenWhatsApp}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs transition-colors hover:bg-emerald-700"
                title="فتح محادثة واتساب ويب مع العميل مباشرةً"
              >
                <MessageCircle size={12} />
                <span>مراسلة واتساب</span>
              </button>
            )}
            <button
              type="button"
              onClick={onCopySummary}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title="نسخ كليشة الرد السريع لإرسالها للعميل"
            >
              {copiedSummary ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
              <span>{copiedSummary ? 'تم النسخ!' : 'نسخ النص'}</span>
            </button>
          </div>
        </div>

        {data.balances.length === 0 ? (
          <p className="text-xs text-slate-400">لا توجد حركات مالية مسجلة</p>
        ) : (
          <div className="space-y-1.5">
            {data.balances.map(b => (
              <div
                key={b.currency_code}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60"
              >
                <span className="font-bold text-slate-600 dark:text-slate-400">
                  {b.currency_code}
                </span>
                <span
                  className={`font-mono text-sm font-black ${getBalanceToneClass(b.balance)}`}
                  dir="ltr"
                >
                  {formatCurrency(b.balance)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface PromiseFormState {
  amount: string;
  currency: string;
  date: string;
  notes: string;
  isSubmitting: boolean;
}

const PromiseFormPanel: React.FC<{
  form: PromiseFormState;
  onAmountChange: (val: string) => void;
  onCurrencyChange: (val: string) => void;
  onDateChange: (val: string) => void;
  onNotesChange: (val: string) => void;
  onSubmit: (e: React.SyntheticEvent) => Promise<void>;
}> = ({ form, onAmountChange, onCurrencyChange, onDateChange, onNotesChange, onSubmit }) => (
  <form
    onSubmit={e => {
      void onSubmit(e);
    }}
    className="mb-3 space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 dark:border-indigo-900/30 dark:bg-indigo-950/20"
  >
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label
          htmlFor="cw-promise-amount"
          className="block text-[10px] font-bold text-slate-600 dark:text-slate-400"
        >
          المبلغ
        </label>
        <input
          id="cw-promise-amount"
          type="number"
          required
          min="1"
          step="any"
          value={form.amount}
          onChange={e => {
            onAmountChange(e.target.value);
          }}
          placeholder="500"
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          dir="ltr"
        />
      </div>
      <div>
        <label
          htmlFor="cw-promise-currency"
          className="block text-[10px] font-bold text-slate-600 dark:text-slate-400"
        >
          العملة
        </label>
        <select
          id="cw-promise-currency"
          value={form.currency}
          onChange={e => {
            onCurrencyChange(e.target.value);
          }}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="YER">YER (ريال يمني)</option>
          <option value="SAR">SAR (ريال سعودي)</option>
          <option value="USD">USD (دولار)</option>
        </select>
      </div>
    </div>

    <div>
      <label
        htmlFor="cw-promise-date"
        className="block text-[10px] font-bold text-slate-600 dark:text-slate-400"
      >
        تاريخ الوعد
      </label>
      <input
        id="cw-promise-date"
        type="date"
        required
        value={form.date}
        onChange={e => {
          onDateChange(e.target.value);
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
      />
    </div>

    <div>
      <input
        type="text"
        value={form.notes}
        onChange={e => {
          onNotesChange(e.target.value);
        }}
        placeholder="ملاحظات العذر أو طريقة التحويل..."
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
      />
    </div>

    <button
      type="submit"
      disabled={form.isSubmitting}
      className="w-full rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:opacity-60"
    >
      {form.isSubmitting ? 'جارٍ الحفظ...' : 'حفظ وعد السداد في ERP'}
    </button>
  </form>
);

const RecentInvoicesCard: React.FC<{ invoices: ChatwootPartySummary['recentInvoices'] }> = ({
  invoices,
}) => (
  <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
    <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
      <Receipt size={14} className="text-amber-600" />
      <span>آخر الفواتير</span>
    </div>

    {invoices.length === 0 ? (
      <p className="text-[11px] text-slate-400">لا توجد فواتير مسجلة</p>
    ) : (
      <div className="space-y-1.5">
        {invoices.map(inv => (
          <div
            key={inv.id}
            className="flex items-center justify-between rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/60"
          >
            <div>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                #{inv.invoice_number}
              </span>
              <span className="mr-2 font-mono text-[10px] text-slate-400" dir="ltr">
                {inv.issue_date}
              </span>
            </div>
            <div className="text-left" dir="ltr">
              <span className="font-mono font-black text-slate-700 dark:text-slate-300">
                {formatCurrency(inv.total_amount)} {inv.currency_code}
              </span>
              {inv.remaining_amount > 0 && (
                <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                  متبقي: {formatCurrency(inv.remaining_amount)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const useChatwootWidgetController = (): {
  isStandalone: boolean;
  phoneQuery: string;
  setPhoneQuery: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  data: ChatwootPartySummary | null;
  notFound: boolean;
  copiedSummary: boolean;
  copiedWidgetUrl: boolean;
  recentParties: RecentPartyItem[];
  showPromiseForm: boolean;
  setShowPromiseForm: React.Dispatch<React.SetStateAction<boolean>>;
  promiseForm: PromiseFormState;
  setPromiseAmount: React.Dispatch<React.SetStateAction<string>>;
  setPromiseCurrency: React.Dispatch<React.SetStateAction<string>>;
  setPromiseDate: React.Dispatch<React.SetStateAction<string>>;
  setPromiseNotes: React.Dispatch<React.SetStateAction<string>>;
  promiseFeedback: string | null;
  fetchCustomer: (query: string) => Promise<void>;
  handleCopySummary: () => void;
  handleOpenWhatsAppWeb: () => void;
  handleCopyWidgetUrl: () => void;
  handleAddPromise: (e: React.SyntheticEvent) => Promise<void>;
} => {
  const companyId = useAuthStore(s => s.user?.company_id ?? '');
  const location = useLocation();
  const isStandalone = location.pathname.includes('chatwoot-widget');

  const [phoneQuery, setPhoneQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<ChatwootPartySummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedWidgetUrl, setCopiedWidgetUrl] = useState(false);
  const [recentParties, setRecentParties] = useState<RecentPartyItem[]>([]);

  const [showPromiseForm, setShowPromiseForm] = useState(false);
  const [promiseAmount, setPromiseAmount] = useState('');
  const [promiseCurrency, setPromiseCurrency] = useState('YER');
  const [promiseDate, setPromiseDate] = useState(() => formatLocalDate());
  const [promiseNotes, setPromiseNotes] = useState('');
  const [isSubmittingPromise, setIsSubmittingPromise] = useState(false);
  const [promiseFeedback, setPromiseFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (companyId.length === 0) {
      setRecentParties([]);
      return;
    }
    void chatwootWidgetApi.getRecentParties(companyId).then(setRecentParties);
  }, [companyId]);

  const fetchCustomer = useCallback(
    async (query: string): Promise<void> => {
      const trimmed = query.trim();
      if (trimmed.length < 2 || companyId.length === 0) return;
      setIsLoading(true);
      setNotFound(false);
      try {
        const result = await chatwootWidgetApi.findParty(trimmed, companyId);
        if (result) {
          setData(result);
          setPromiseCurrency(result.balances[0]?.currency_code ?? 'YER');
        } else {
          setData(null);
          setNotFound(true);
        }
      } catch {
        setData(null);
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    },
    [companyId]
  );

  useEffect(() => {
    const initialPhone = extractInitialPhoneFromLocation();
    if (initialPhone !== null) {
      setPhoneQuery(initialPhone);
      void fetchCustomer(initialPhone);
    }
  }, [fetchCustomer]);

  useEffect(() => {
    const handleChatwootMessage = (event: MessageEvent): void => {
      if (!isTrustedMessageEvent(event)) return;
      const cleanPhone = extractPhoneFromMessageData(event.data);
      if (cleanPhone !== null) {
        setPhoneQuery(cleanPhone);
        void fetchCustomer(cleanPhone);
      }
    };

    window.addEventListener('message', handleChatwootMessage);
    return () => {
      window.removeEventListener('message', handleChatwootMessage);
    };
  }, [fetchCustomer]);

  const getSummaryText = useCallback(
    (): string => (data ? buildCustomerSummaryText(data) : ''),
    [data]
  );

  const handleCopySummary = (): void => {
    if (!data) return;
    void navigator.clipboard.writeText(getSummaryText());
    setCopiedSummary(true);
    setTimeout(() => {
      setCopiedSummary(false);
    }, 2000);
  };

  const handleOpenWhatsAppWeb = (): void => {
    if (hasNonEmptyString(data?.party.phone)) {
      const cleanDigits = data.party.phone.replace(/[^0-9]/g, '');
      const text = encodeURIComponent(getSummaryText());
      window.open(`https://web.whatsapp.com/send?phone=${cleanDigits}&text=${text}`, '_blank');
    } else {
      window.open('https://web.whatsapp.com', '_blank');
    }
  };

  const handleCopyWidgetUrl = (): void => {
    const widgetUrl = `${window.location.origin}/#/chatwoot-widget`;
    void navigator.clipboard.writeText(widgetUrl);
    setCopiedWidgetUrl(true);
    setTimeout(() => {
      setCopiedWidgetUrl(false);
    }, 2000);
  };

  const handleAddPromise = async (e: React.SyntheticEvent): Promise<void> => {
    e.preventDefault();
    if (!data || promiseAmount.length === 0 || Number(promiseAmount) <= 0) return;

    setIsSubmittingPromise(true);
    setPromiseFeedback(null);
    try {
      const notesTrimmed = promiseNotes.trim();
      const res = await chatwootWidgetApi.recordPaymentPromise({
        companyId: data.party.company_id,
        partyId: data.party.id,
        amount: Number(promiseAmount),
        currencyCode: promiseCurrency,
        promiseDate,
        notes: notesTrimmed.length > 0 ? notesTrimmed : undefined,
      });

      if (res.success) {
        setPromiseFeedback('تم تسجيل وعد السداد بنجاح ✅');
        setShowPromiseForm(false);
        setPromiseAmount('');
        setPromiseNotes('');
        const targetQuery = hasNonEmptyString(data.party.phone) ? data.party.phone : phoneQuery;
        void fetchCustomer(targetQuery);
      } else {
        setPromiseFeedback(`فشل التسجيل: ${res.error ?? 'خطأ'}`);
      }
    } finally {
      setIsSubmittingPromise(false);
    }
  };

  return {
    isStandalone,
    phoneQuery,
    setPhoneQuery,
    isLoading,
    data,
    notFound,
    copiedSummary,
    copiedWidgetUrl,
    recentParties,
    showPromiseForm,
    setShowPromiseForm,
    promiseForm: {
      amount: promiseAmount,
      currency: promiseCurrency,
      date: promiseDate,
      notes: promiseNotes,
      isSubmitting: isSubmittingPromise,
    },
    setPromiseAmount,
    setPromiseCurrency,
    setPromiseDate,
    setPromiseNotes,
    promiseFeedback,
    fetchCustomer,
    handleCopySummary,
    handleOpenWhatsAppWeb,
    handleCopyWidgetUrl,
    handleAddPromise,
  };
};

export const ChatwootWidgetPage: React.FC = () => {
  const ctrl = useChatwootWidgetController();
  const refreshCustomer = (): void => {
    void ctrl.fetchCustomer(ctrl.phoneQuery);
  };

  return (
    <div
      className={
        ctrl.isStandalone
          ? 'min-h-screen bg-slate-50/80 p-3 font-sans text-slate-800 antialiased dark:bg-slate-950 dark:text-slate-100 sm:p-5'
          : 'mx-auto w-full max-w-7xl p-3.5 font-sans text-slate-800 antialiased dark:text-slate-100 sm:p-6'
      }
      dir="rtl"
    >
      <div className={ctrl.isStandalone ? 'mx-auto max-w-3xl' : 'mx-auto w-full'}>
        {!ctrl.isStandalone ? (
          <FullOfficeHeader
            isLoading={ctrl.isLoading}
            copiedWidgetUrl={ctrl.copiedWidgetUrl}
            onOpenWhatsApp={ctrl.handleOpenWhatsAppWeb}
            onCopyWidgetUrl={ctrl.handleCopyWidgetUrl}
            onRefresh={refreshCustomer}
          />
        ) : (
          <StandaloneWidgetHeader isLoading={ctrl.isLoading} onRefresh={refreshCustomer} />
        )}

        <CustomerSearchSection
          phoneQuery={ctrl.phoneQuery}
          onPhoneQueryChange={ctrl.setPhoneQuery}
          onSearch={q => {
            void ctrl.fetchCustomer(q);
          }}
          recentParties={ctrl.recentParties}
          hasLoadedCustomer={ctrl.data !== null}
        />

        {ctrl.isLoading && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 py-12 text-slate-400 dark:border-slate-800 dark:bg-slate-900/50">
            <Loader2 size={26} className="animate-spin text-emerald-600" />
            <span className="mt-2.5 text-xs font-bold text-slate-600 dark:text-slate-300">
              جارٍ قراءة أرصدة وفواتير العميل...
            </span>
          </div>
        )}

        {!ctrl.isLoading && ctrl.notFound && <CustomerNotFoundCard phoneQuery={ctrl.phoneQuery} />}

        {!ctrl.isLoading && ctrl.data && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CustomerOverviewColumn
              data={ctrl.data}
              copiedSummary={ctrl.copiedSummary}
              onOpenWhatsApp={ctrl.handleOpenWhatsAppWeb}
              onCopySummary={ctrl.handleCopySummary}
            />

            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                    <CalendarCheck size={14} className="text-indigo-600" />
                    <span>وعود السداد</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      ctrl.setShowPromiseForm(!ctrl.showPromiseForm);
                    }}
                    className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                  >
                    <PlusCircle size={13} />
                    <span>{ctrl.showPromiseForm ? 'إلغاء' : 'إضافة وعد'}</span>
                  </button>
                </div>

                {hasNonEmptyString(ctrl.promiseFeedback) && (
                  <div className="mb-2 rounded-xl bg-emerald-50 p-2 text-center text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {ctrl.promiseFeedback}
                  </div>
                )}

                {ctrl.showPromiseForm && (
                  <PromiseFormPanel
                    form={ctrl.promiseForm}
                    onAmountChange={ctrl.setPromiseAmount}
                    onCurrencyChange={ctrl.setPromiseCurrency}
                    onDateChange={ctrl.setPromiseDate}
                    onNotesChange={ctrl.setPromiseNotes}
                    onSubmit={ctrl.handleAddPromise}
                  />
                )}

                {ctrl.data.pendingPromises.length === 0 ? (
                  <p className="text-[11px] text-slate-400">لا توجد وعود سداد معلقة</p>
                ) : (
                  <div className="space-y-1.5">
                    {ctrl.data.pendingPromises.map(p => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/60"
                      >
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {formatCurrency(p.amount)} {p.currency_code}
                          </span>
                          {hasNonEmptyString(p.notes) && (
                            <p className="text-[10px] text-slate-400">{p.notes}</p>
                          )}
                        </div>
                        <span
                          className="font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400"
                          dir="ltr"
                        >
                          {p.promise_date}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <RecentInvoicesCard invoices={ctrl.data.recentInvoices} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatwootWidgetPage;
