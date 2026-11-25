import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CustomizableTableWrapper } from '@/ui/table-settings/TableSettingsButton';
import {
  FileText,
  Plus,
  Search,
  Clock,
  CheckCircle,
  CircleX,
  Send,
  ArrowRightLeft,
  Loader2,
  RefreshCw,
  TrendingUp,
  Coins,
  Hourglass,
  Calendar,
  Package,
  X,
  Phone,
  AlertTriangle,
} from 'lucide-react';
import { salesQuotationsApi } from '@/features/sales/api/quotationsApi';
import { useAuthStore } from '@/features/auth/store';
import { formatCurrency, normalizeSearch } from '@/core/utils';
import type { QuotationStatus } from '@/features/sales/types/quotation';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';
import CreateQuotationModal from '@/features/sales/components/quotations/CreateQuotationModal';
import QuotationDetailsModal from '@/features/sales/components/quotations/QuotationDetailsModal';
import QuotationActionIcons from '@/features/sales/components/quotations/QuotationActionIcons';
import type { QuotationRowAction } from '@/features/sales/components/quotations/QuotationActionIcons';

const STATUS_CONFIG: Record<
  QuotationStatus,
  { label: string; color: string; dot: string; icon: React.ReactNode }
> = {
  draft: {
    label: 'مسودة',
    color:
      'border border-slate-200 bg-slate-100/90 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    dot: 'bg-slate-400',
    icon: <Clock size={11} />,
  },
  sent: {
    label: 'مُرسل',
    color:
      'border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/30 dark:text-blue-300',
    dot: 'bg-blue-500',
    icon: <Send size={11} />,
  },
  pending: {
    label: 'قيد المراجعة',
    color:
      'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-300',
    dot: 'bg-amber-500',
    icon: <Clock size={11} />,
  },
  submitted: {
    label: 'مُقدم من المورد',
    color:
      'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    icon: <Send size={11} />,
  },
  accepted: {
    label: 'مقبول',
    color:
      'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    icon: <CheckCircle size={11} />,
  },
  rejected: {
    label: 'مرفوض',
    color:
      'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-300',
    dot: 'bg-rose-500',
    icon: <CircleX size={11} />,
  },
  expired: {
    label: 'منتهي',
    color:
      'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-300',
    dot: 'bg-amber-500',
    icon: <Clock size={11} />,
  },
  converted: {
    label: 'تم التحويل',
    color:
      'border border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-900/30 dark:text-indigo-300',
    dot: 'bg-indigo-500',
    icon: <ArrowRightLeft size={11} />,
  },
};

const FILTER_TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'draft', label: 'مسودة' },
  { key: 'sent', label: 'مُرسل' },
  { key: 'accepted', label: 'مقبول' },
  { key: 'rejected', label: 'مرفوض' },
  { key: 'converted', label: 'محوّل' },
];

const currencyBadgeStyle = (code: string): string => {
  switch (code.toUpperCase()) {
    case 'SAR':
      return 'bg-amber-100/90 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'YER':
      return 'bg-sky-100/90 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300';
    case 'OMR':
      return 'bg-emerald-100/90 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
  }
};

const getDaysRemaining = (validUntil: string | null): number | null => {
  if (!validUntil) return null;
  const ts = new Date(validUntil).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.ceil((ts - Date.now()) / (1000 * 60 * 60 * 24));
};

interface Props {
  onConvertToInvoice?: () => void;
}

export const QuotationsTab: React.FC<Props> = ({ onConvertToInvoice }) => {
  const { user } = useAuthStore();
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | null>(null);
  // إجراء يبدأ تلقائياً بعد فتح النافذة: الإرسال أو الطباعة أو ملف الإكسل مباشرة من الصف.
  const [pendingAction, setPendingAction] = useState<QuotationRowAction | null>(null);

  const openDetails = (id: string, action: QuotationRowAction | null): void => {
    setSelectedQuotationId(id);
    setPendingAction(action);
  };

  const { branchId } = useBranchFilter();

  const fetchQuotations = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    const { data } = await salesQuotationsApi.getQuotations(user.company_id, branchId);
    setQuotations(data || []);
    setLoading(false);
  }, [user?.company_id, branchId]);

  useEffect(() => {
    void fetchQuotations();
  }, [fetchQuotations]);

  const stats = useMemo(() => {
    const countsByStatus: Record<string, number> = { all: quotations.length };
    const totalsByCurrency = new Map<string, number>();
    let awaitingCount = 0;
    let expiringSoonCount = 0;
    let wonCount = 0;

    for (const q of quotations) {
      const st = String(q.status || 'draft');
      countsByStatus[st] = (countsByStatus[st] ?? 0) + 1;

      if (st === 'draft' || st === 'sent' || st === 'pending') {
        awaitingCount += 1;
        const days = getDaysRemaining(q.valid_until);
        if (days !== null && days >= 0 && days <= 3) {
          expiringSoonCount += 1;
        }
      }
      if (st === 'accepted' || st === 'converted') {
        wonCount += 1;
      }

      const curr = String(q.currency_code || 'SAR').toUpperCase();
      const amount = Number(q.total_amount) || 0;
      if (st !== 'rejected') {
        totalsByCurrency.set(curr, (totalsByCurrency.get(curr) ?? 0) + amount);
      }
    }

    const currencyTotals = Array.from(totalsByCurrency.entries())
      .filter(([, total]) => total > 0)
      .sort(([a], [b]) => (a === 'SAR' ? -1 : b === 'SAR' ? 1 : a.localeCompare(b)));

    const conversionRate =
      quotations.length > 0 ? Math.round((wonCount / quotations.length) * 100) : 0;

    return {
      totalCount: quotations.length,
      awaitingCount,
      expiringSoonCount,
      wonCount,
      conversionRate,
      countsByStatus,
      currencyTotals,
    };
  }, [quotations]);

  const filtered = useMemo(() => {
    const term = normalizeSearch(searchTerm);
    return quotations.filter(q => {
      const matchesStatus = statusFilter === 'all' || q.status === statusFilter;
      const matchesSearch =
        !term ||
        normalizeSearch(q.quotation_number).includes(term) ||
        normalizeSearch(q.party?.name).includes(term) ||
        normalizeSearch(q.party?.phone).includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [quotations, statusFilter, searchTerm]);

  return (
    <div className="space-y-4">
      {/* Hero Header */}
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-[var(--app-surface)] p-4 shadow-sm dark:border-slate-800 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-600/20">
            <FileText size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                عروض الأسعار
              </h2>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-mono text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {stats.totalCount}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              إدارة ومتابعة عروض أسعار المبيعات والطباعة الرسمية والتحويل المباشر لفواتير
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void fetchQuotations();
            }}
            title="تحديث القائمة"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-indigo-500' : ''} />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-600/25 transition-all hover:bg-indigo-700 active:scale-[0.99]"
          >
            <Plus size={16} />
            عرض سعر جديد
          </button>
        </div>
      </div>

      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-4 gap-1 sm:gap-3">
        {/* KPI 1: Total Quotations */}
        <div className="min-w-0 rounded-lg border border-slate-200/80 bg-[var(--app-surface)] p-1.5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[11px]">
              إجمالي العروض
            </span>
            <div className="hidden rounded-xl bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 sm:block">
              <FileText size={15} />
            </div>
          </div>
          <div className="mt-1 flex items-baseline gap-1 sm:mt-2 sm:gap-2">
            <span className="font-mono text-sm font-black text-slate-900 dark:text-white sm:text-2xl">
              {stats.totalCount}
            </span>
            <span className="hidden text-[11px] font-medium text-slate-400 sm:inline">عرض مسجّل</span>
          </div>
        </div>

        {/* KPI 2: Awaiting Response */}
        <div className="min-w-0 rounded-lg border border-slate-200/80 bg-[var(--app-surface)] p-1.5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[11px]">
              قيد الانتظار
            </span>
            <div className="hidden rounded-xl bg-amber-50 p-2 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 sm:block">
              <Hourglass size={15} />
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 sm:mt-2 sm:gap-2">
            <span className="font-mono text-sm font-black text-slate-900 dark:text-white sm:text-2xl">
              {stats.awaitingCount}
            </span>
            {stats.expiringSoonCount > 0 && (
              <span className="hidden items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 sm:inline-flex">
                <AlertTriangle size={10} />
                {stats.expiringSoonCount} ينتهي قريباً
              </span>
            )}
          </div>
        </div>

        {/* KPI 3: Accepted / Converted */}
        <div className="min-w-0 rounded-lg border border-slate-200/80 bg-[var(--app-surface)] p-1.5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 sm:rounded-2xl sm:p-3.5">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-[10px] font-bold text-slate-500 dark:text-slate-400 sm:text-[11px]">
              مقبولة
            </span>
            <div className="hidden rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 sm:block">
              <TrendingUp size={15} />
            </div>
          </div>
          <div className="mt-1 flex items-baseline gap-1 sm:mt-2 sm:gap-2">
            <span className="font-mono text-sm font-black text-slate-900 dark:text-white sm:text-2xl">
              {stats.wonCount}
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {stats.conversionRate}% نجاح
            </span>
          </div>
        </div>

        {/* KPI 4: Value by Currency (never blindly mixes SAR + YER!) */}
        <div className="rounded-2xl border border-slate-200/80 bg-[var(--app-surface)] p-3.5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              قيمة العروض النشطة
            </span>
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <Coins size={15} />
            </div>
          </div>
          <div className="mt-1.5 space-y-1">
            {stats.currencyTotals.length === 0 ? (
              <span className="font-mono text-xl font-black text-slate-400" dir="ltr">
                0
              </span>
            ) : (
              stats.currencyTotals.slice(0, 3).map(([curr, total]) => (
                <div key={curr} className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${currencyBadgeStyle(curr)}`}
                  >
                    {curr}
                  </span>
                  <span
                    className="truncate font-mono text-sm font-black text-slate-900 dark:text-white"
                    dir="ltr"
                  >
                    {formatCurrency(total, curr)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Filter Tabs + Search Bar */}
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-[var(--app-surface)] p-2.5 shadow-sm dark:border-slate-800 sm:flex-row sm:items-center">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100/90 p-1 dark:bg-slate-900/70">
          {FILTER_TABS.map(tab => {
            const count = stats.countsByStatus[tab.key] ?? 0;
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.key);
                }}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  active
                    ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                    active
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200'
                      : 'bg-slate-200/80 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
            }}
            placeholder="بحث برقم العرض، اسم العميل، الهاتف..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-8 pr-9 text-xs font-medium text-slate-800 transition-colors focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:focus:bg-slate-800"
          />
          {searchTerm !== '' && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
              }}
              aria-label="مسح البحث"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Table / Empty / Loading */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-[var(--app-surface)] py-16 dark:border-slate-800">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
          <span className="text-xs font-medium text-slate-400">جارٍ تحميل عروض الأسعار...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-[var(--app-surface)] py-14 text-center dark:border-slate-700">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-400">
            <FileText size={28} />
          </div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {searchTerm !== '' || statusFilter !== 'all'
              ? 'لا توجد عروض أسعار مطابقة للبحث أو التصفية'
              : 'لا توجد عروض أسعار بعد'}
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {searchTerm !== '' || statusFilter !== 'all'
              ? 'جرّب تغيير معايير التصفية أو مسح البحث'
              : 'ابدأ بإنشاء أول عرض سعر احترافي لعملائك مع طباعة رسمية فورية'}
          </p>
          <button
            type="button"
            onClick={() => {
              setShowCreateModal(true);
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700"
          >
            <Plus size={16} />
            عرض سعر جديد
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-[var(--app-surface)] shadow-sm dark:border-slate-800">
          <CustomizableTableWrapper tableId="sales.quotations" tableTitle="عروض الأسعار">
            <div className="custom-scrollbar scroll-x-hint-surface table-scroll-viewport">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/90 text-xs font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-400">
                    <th className="px-4 py-3 text-right">رقم العرض</th>
                    <th className="px-4 py-3 text-right">العميل</th>
                    <th className="px-4 py-3 text-right">تاريخ الإصدار</th>
                    <th className="px-4 py-3 text-right">الصلاحية</th>
                    <th className="px-4 py-3 text-right">الإجمالي</th>
                    <th className="px-4 py-3 text-right">الحالة</th>
                    <th className="px-4 py-3 text-center">الأصناف</th>
                    <th className="px-4 py-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filtered.map(q => {
                    const statusConf =
                      STATUS_CONFIG[q.status as QuotationStatus] || STATUS_CONFIG.draft;
                    const daysLeft = getDaysRemaining(q.valid_until);
                    const currCode = String(q.currency_code || 'SAR').toUpperCase();
                    const customerName = q.party?.name || 'عميل نقدي';
                    const customerInitial = customerName.trim().charAt(0) || 'ع';
                    const itemsCount = q.quotation_items?.length || 0;

                    return (
                      <tr
                        key={q.id}
                        onClick={() => {
                          openDetails(q.id, null);
                        }}
                        className="group cursor-pointer transition-colors hover:bg-indigo-50/40 dark:hover:bg-slate-800/60"
                      >
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-lg border border-indigo-200/70 bg-indigo-50/70 px-2.5 py-1 font-mono text-xs font-extrabold text-indigo-700 transition-colors group-hover:border-indigo-300 group-hover:bg-indigo-100/80 dark:border-indigo-800/50 dark:bg-indigo-950/40 dark:text-indigo-300">
                            {q.quotation_number}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {customerInitial}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-bold text-slate-900 dark:text-white">
                                {customerName}
                              </div>
                              {q.party?.phone && (
                                <div className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                                  <Phone size={10} />
                                  <span dir="ltr">{q.party.phone}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-slate-600 dark:text-slate-300">
                            <Calendar size={12} className="text-slate-400" />
                            {new Date(q.issue_date).toLocaleDateString('ar-SA-u-nu-latn')}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {daysLeft !== null ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                daysLeft <= 0
                                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                                  : daysLeft <= 3
                                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              <Clock size={10} />
                              {daysLeft <= 0 ? 'منتهي' : `${daysLeft} يوم`}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="font-mono text-sm font-extrabold text-slate-900 dark:text-white"
                              dir="ltr"
                            >
                              {formatCurrency(q.total_amount, currCode)}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${currencyBadgeStyle(currCode)}`}
                            >
                              {currCode}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${statusConf.color}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${statusConf.dot}`} />
                            {statusConf.label}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Package size={11} className="text-slate-400" />
                            {itemsCount}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <QuotationActionIcons
                            onAction={action => {
                              openDetails(q.id, action);
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CustomizableTableWrapper>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateQuotationModal
          onClose={() => {
            setShowCreateModal(false);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            void fetchQuotations();
          }}
        />
      )}

      {selectedQuotationId && (
        <QuotationDetailsModal
          quotationId={selectedQuotationId}
          onClose={() => {
            setSelectedQuotationId(null);
            setPendingAction(null);
          }}
          onRefresh={() => {
            void fetchQuotations();
          }}
          {...(pendingAction !== null ? { initialAction: pendingAction } : {})}
          {...(onConvertToInvoice ? { onConvertToInvoice } : {})}
        />
      )}
    </div>
  );
};

export default QuotationsTab;
