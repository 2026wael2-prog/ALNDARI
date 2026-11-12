import React, { useState } from 'react';
import {
  Wallet,
  AlertTriangle,
  CalendarClock,
  Handshake,
  ShieldAlert,
  MessageCircleX,
  BellRing,
  Send,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import StatCard from '../../../ui/common/StatCard';
import DualCurrencyStatCard from '../../../ui/common/DualCurrencyStatCard';
import { AnalyticsUnifiedFilterBar } from '../../../ui/common/AnalyticsUnifiedFilterBar';
import { useAnalyticsFilterStore } from '../../../core/store/analyticsFilterStore';
import { cn } from '../../../core/utils';
import { formatCurrency } from '../../../core/utils/currencyUtils';
import { useDebtAnalytics } from '../hooks/useDebtQueries';
import { useCompany } from '../../settings/hooks';
import AIDebtAdvisor from '../components/AIDebtAdvisor';
import AgingBuckets from '../components/AgingBuckets';
import DebtQueryError from '../components/DebtQueryError';
import FollowupActionsCard from '../components/FollowupActionsCard';
import PriorityQueueCard from '../components/PriorityQueueCard';
import type { DebtAnalytics, DebtQueueBucket } from '../types';

/** Safe numeric coercion for values that arrive from a JSON payload. */
const asNumber = (value: number | undefined): number => {
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
};

const LoadingCard: React.FC = () => (
  <div className="h-24 animate-pulse rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] max-md:h-16" />
);

interface StatRow {
  title: string;
  value: string;
  subtext: string;
  icon: LucideIcon;
  colorClass: string;
  iconBgClass: string;
}

/** عدّاد رقمي كنص — يمنع إقحام أرقام غير مُنمّطة داخل قوالب نصية. */
const formatCount = (value: number | undefined): string => String(asNumber(value));

const receivableRows = (a: DebtAnalytics, baseCurrency: string): StatRow[] => [
  {
    title: 'إجمالي المديونية',
    value: formatCurrency(asNumber(a.total_receivables), baseCurrency),
    subtext: `${formatCount(a.total_debtors)} عميل مدين`,
    icon: Wallet,
    colorClass: 'text-blue-600',
    iconBgClass: 'bg-blue-500',
  },
  {
    title: 'متأخر',
    value: formatCurrency(asNumber(a.overdue_receivables), baseCurrency),
    subtext: 'فواتير تجاوزت الاستحقاق',
    icon: AlertTriangle,
    colorClass: 'text-orange-600',
    iconBgClass: 'bg-orange-500',
  },
  {
    title: 'مستحق اليوم',
    value: formatCurrency(asNumber(a.due_today), baseCurrency),
    subtext: 'يحتاج متابعة اليوم',
    icon: CalendarClock,
    colorClass: 'text-amber-600',
    iconBgClass: 'bg-amber-500',
  },
];

const followUpRows = (a: DebtAnalytics, baseCurrency: string): StatRow[] => [
  {
    title: 'وعود قائمة',
    value: formatCount(a.pending_promises),
    subtext: formatCurrency(asNumber(a.pending_promises_amount), baseCurrency),
    icon: Handshake,
    colorClass: 'text-emerald-600',
    iconBgClass: 'bg-emerald-500',
  },
  {
    title: 'وعود مخلَفة',
    value: formatCount(a.broken_promises),
    subtext: formatCurrency(asNumber(a.broken_promises_amount), baseCurrency),
    icon: ShieldAlert,
    colorClass: 'text-rose-600',
    iconBgClass: 'bg-rose-500',
  },
  {
    title: 'بحاجة تذكير',
    value: formatCount(a.needs_reminder),
    subtext: 'لم يُذكَّروا خلال النافذة',
    icon: BellRing,
    colorClass: 'text-sky-600',
    iconBgClass: 'bg-sky-500',
  },
  {
    title: 'رسائل فاشلة (24 ساعة)',
    value: formatCount(a.failed_messages_24h),
    subtext: `إجمالي ${formatCount(a.failed_messages)} رسالة فاشلة`,
    icon: MessageCircleX,
    colorClass: 'text-red-600',
    iconBgClass: 'bg-red-500',
  },
  {
    title: 'رسائل مرسلة',
    value: formatCount(a.sent_messages),
    subtext: 'سجل كامل للتذكيرات',
    icon: Send,
    colorClass: 'text-violet-600',
    iconBgClass: 'bg-violet-500',
  },
];

const buildStatRows = (a: DebtAnalytics, baseCurrency: string): StatRow[] => [
  ...receivableRows(a, baseCurrency),
  ...followUpRows(a, baseCurrency),
];

/**
 * ربط بطاقات KPI ببِكِت الطابور: نقرة البطاقة تُصفّي طابور التحصيل.
 * switch صريح بدل فهرسة كائن بمفتاح متغيّر، وبلا تخمين: البطاقات التي لا
 * تقابل بِكِتاً حقيقياً (الرسائل) تبقى عرضاً فقط بدل فلتر كاذب.
 */
const bucketForTitle = (title: string): DebtQueueBucket | null => {
  switch (title) {
    case 'إجمالي المديونية':
      return 'all';
    case 'متأخر':
      return 'overdue';
    case 'مستحق اليوم':
      return 'today';
    case 'وعود قائمة':
      return 'promises';
    case 'وعود مخلَفة':
      return 'promises';
    case 'بحاجة تذكير':
      return 'nocontact';
    default:
      return null;
  }
};

/** شرائح الفلاتر الكاملة — تُغطّي بِكِتات لا تقابلها بطاقة KPI (أسبوع/حرج). */
const BUCKET_CHIPS: ReadonlyArray<{ bucket: DebtQueueBucket; label: string }> = [
  { bucket: 'all', label: 'الكل' },
  { bucket: 'overdue', label: 'متأخر' },
  { bucket: 'today', label: 'اليوم' },
  { bucket: 'week', label: 'هذا الأسبوع' },
  { bucket: 'promises', label: 'الوعود' },
  { bucket: 'critical', label: 'حرج' },
  { bucket: 'nocontact', label: 'بلا تواصل' },
];

const StatsGrid: React.FC<{
  analytics: DebtAnalytics | null;
  isLoading: boolean;
  baseCurrency: string;
  currencyMode: 'ALL' | 'SAR' | 'YER';
  bucket: DebtQueueBucket;
  onSelectBucket: (bucket: DebtQueueBucket) => void;
}> = ({ analytics, isLoading, baseCurrency, currencyMode, bucket, onSelectBucket }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 max-md:gap-1.5 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <LoadingCard key={i} />
        ))}
      </div>
    );
  }
  const rows = buildStatRows(analytics ?? ({} as DebtAnalytics), baseCurrency);
  const sarEntry = analytics?.by_currency?.find(c => c.currency.toUpperCase() === 'SAR');
  const yerEntry = analytics?.by_currency?.find(c => c.currency.toUpperCase() === 'YER');
  const amountSAR = sarEntry
    ? asNumber(sarEntry.balance)
    : baseCurrency === 'SAR'
      ? asNumber(analytics?.total_receivables)
      : 0;
  const amountYER = yerEntry
    ? asNumber(yerEntry.balance)
    : baseCurrency === 'YER'
      ? asNumber(analytics?.total_receivables)
      : 0;

  return (
    <div className="grid grid-cols-2 gap-3 max-md:gap-1.5 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
      {rows.map(s => {
        const targetBucket = bucketForTitle(s.title);

        if (s.title === 'إجمالي المديونية') {
          return (
            <DualCurrencyStatCard
              key={s.title}
              title={s.title}
              amountSAR={amountSAR}
              amountYER={amountYER}
              currencyMode={currencyMode}
              subtext={s.subtext}
              icon={s.icon}
              colorClass={s.colorClass}
              iconBgClass={s.iconBgClass}
              onClick={() => {
                onSelectBucket(bucket === 'all' ? 'all' : 'all');
              }}
              isActive={bucket === 'all'}
            />
          );
        }

        return (
          <StatCard
            key={s.title}
            title={s.title}
            value={s.value}
            subtext={s.subtext}
            icon={s.icon}
            colorClass={s.colorClass}
            iconBgClass={s.iconBgClass}
            {...(targetBucket !== null
              ? {
                  onClick: () => {
                    onSelectBucket(bucket === targetBucket ? 'all' : targetBucket);
                  },
                  isActive: bucket === targetBucket,
                }
              : {})}
          />
        );
      })}
    </div>
  );
};

const CurrencyBreakdown: React.FC<{ byCurrency: DebtAnalytics['by_currency'] }> = ({
  byCurrency,
}) => {
  const list = byCurrency ?? [];
  if (list.length === 0) return null;
  return (
    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm max-md:p-2.5">
      <h3 className="mb-3 text-sm font-bold text-[var(--app-text)] max-md:mb-2">
        التوزيع حسب العملة
      </h3>
      <div className="flex flex-wrap gap-3 max-md:gap-1.5">
        {list.map(c => (
          <div
            key={c.currency}
            className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-hover)] px-4 py-3 max-md:px-2.5 max-md:py-2"
          >
            <span className="block text-[10px] font-bold text-[var(--app-text-secondary)]">
              {c.currency}
            </span>
            <span className="block font-mono text-lg font-bold text-blue-600 max-md:text-base">
              {formatCurrency(asNumber(c.balance), c.currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface BucketChipsProps {
  bucket: DebtQueueBucket;
  onSelect: (bucket: DebtQueueBucket) => void;
}

/** شرائح فلترة الطابور — تُغطّي بِكِتات لا تقابلها بطاقة KPI (أسبوع/حرج). */
const BucketChips: React.FC<BucketChipsProps> = ({ bucket, onSelect }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <span className="text-[10px] font-bold text-[var(--app-text-secondary)]">تصفية الطابور:</span>
    {BUCKET_CHIPS.map(chip => (
      <button
        key={chip.bucket}
        type="button"
        onClick={() => {
          onSelect(chip.bucket);
        }}
        className={cn(
          'rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors',
          bucket === chip.bucket
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
            : 'border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]'
        )}
        aria-pressed={bucket === chip.bucket}
      >
        {chip.label}
      </button>
    ))}
  </div>
);

/** لا نعرض أصفاراً في بطاقات KPI كأنها حقيقة عند فقد التحليلات. */
const isAnalyticsUnavailable = (
  isLoading: boolean,
  isError: boolean,
  analytics: DebtAnalytics | null | undefined
): boolean => !isLoading && (isError || analytics === null || analytics === undefined);

/** بديل موحّد: خطأ صريح مع إعادة محاولة، أو تنبيه هادئ عند غياب الدالة. */
const AnalyticsPlaceholder: React.FC<{ isError: boolean; onRetry: () => void }> = ({
  isError,
  onRetry,
}) => {
  if (isError) {
    return (
      <DebtQueryError
        message="فشل استدعاء تحليلات الديون، لذا أُخفيت المؤشرات وشرائح التقادم بدل عرض أصفار قد تُقرأ كحقيقة."
        onRetry={onRetry}
      />
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-amber-800 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300 max-md:p-3">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-bold">مؤشرات الديون غير متاحة حالياً</p>
        <p className="mt-0.5 text-[11px] leading-relaxed">
          تعذّر جلب تحليلات الديون من الخادم (قد يكون دالة التحليلات غير مثبّتة على هذا الإصدار).
          المهام والإجراءات أدناه تعمل بشكل طبيعي، لكن الإجماليات وشرائح التقادم لن تُعرض حتى عودة
          الخدمة.
        </p>
      </div>
    </div>
  );
};

const OverviewPage: React.FC = () => {
  const { currency } = useAnalyticsFilterStore();
  const { data: analytics, isLoading, isError, refetch } = useDebtAnalytics();
  const [bucket, setBucket] = useState<DebtQueueBucket>('all');
  const { data: company } = useCompany();

  const companyCurrency = company?.base_currency;
  const baseCurrency =
    currency !== 'ALL'
      ? currency
      : companyCurrency !== undefined && companyCurrency !== ''
        ? companyCurrency
        : 'SAR';
  const a = (analytics ?? {}) as DebtAnalytics;
  const analyticsUnavailable = isAnalyticsUnavailable(isLoading, isError, analytics);

  const handleRetry = (): void => {
    void refetch();
  };

  return (
    <div className="space-y-4 max-md:space-y-3">
      {/* 1. Unified Filter Bar */}
      <AnalyticsUnifiedFilterBar onRefresh={handleRetry} isRefreshing={isLoading} />

      <AIDebtAdvisor />
      {analyticsUnavailable ? (
        <AnalyticsPlaceholder isError={isError} onRetry={handleRetry} />
      ) : (
        <>
          <StatsGrid
            analytics={analytics ?? null}
            isLoading={isLoading}
            baseCurrency={baseCurrency}
            currencyMode={currency}
            bucket={bucket}
            onSelectBucket={setBucket}
          />
          <AgingBuckets aging={a.aging} baseCurrency={baseCurrency} />
        </>
      )}
      {/* شرائح الفلترة: تُغطّي كل بِكِتات الطابور، وتبقى ظاهرة حتى لو تعذّرت
          التحليلات — لأن الطابور مصدره مهام التحصيل لا بطاقات KPI. */}
      <BucketChips bucket={bucket} onSelect={setBucket} />
      <PriorityQueueCard bucket={bucket} onBucketChange={setBucket} />
      {/* S1: الإجراءات المجدولة (customer_activities.pending) — كانت بلا قارئ */}
      <FollowupActionsCard />
      {!analyticsUnavailable && <CurrencyBreakdown byCurrency={a.by_currency} />}
    </div>
  );
};

export default OverviewPage;
