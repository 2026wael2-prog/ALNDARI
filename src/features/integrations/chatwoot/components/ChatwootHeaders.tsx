import React from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  Copy,
  Headphones,
  MessageCircle,
  RefreshCw,
  Search,
  User,
} from 'lucide-react';
import { hasNonEmptyString, type RecentPartyItem } from '../utils/chatwootHelpers';

export const FullOfficeHeader: React.FC<{
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

export const StandaloneWidgetHeader: React.FC<{
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

export const CustomerSearchSection: React.FC<{
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
        className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-16 pr-9 text-xs font-bold text-slate-800 shadow-xs focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
      />
      <Search size={15} className="pointer-events-none absolute right-3 top-3 text-slate-400" />
      <button
        type="button"
        onClick={() => {
          onSearch(phoneQuery);
        }}
        className="absolute left-1.5 top-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700"
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

export const CustomerNotFoundCard: React.FC<{ phoneQuery: string }> = ({ phoneQuery }) => (
  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-center shadow-xs dark:border-amber-900/40 dark:bg-amber-950/20">
    <AlertCircle size={26} className="mx-auto text-amber-600 dark:text-amber-400" />
    <h2 className="mt-2 text-xs font-black text-amber-900 dark:text-amber-200">
      الرقم غير مسجل كعميل في المنظومة
    </h2>
    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
      لم يتم العثور على سجل مالي برقم ({phoneQuery}). يمكنك إضافة العميل إلى المنظومة لمتابعة حساباته.
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
