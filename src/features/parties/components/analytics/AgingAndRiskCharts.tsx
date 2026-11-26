import type React from 'react';
import { Award, BarChart3, ShieldAlert } from 'lucide-react';
import { cn, formatCurrency, formatNumberDisplay } from '@/core/utils';
import type {
  AgingBucketKey,
  CreditGrade,
  CustomerCreditSummary,
  EnrichedCustomerCreditRow,
  RfmSegment,
} from '../../utils/creditScoring';

interface AgingAndRiskChartsProps {
  summary: CustomerCreditSummary;
  customers: EnrichedCustomerCreditRow[];
  currency: string;
  activeAgingBucket: AgingBucketKey;
  onSelectAgingBucket: (bucket: AgingBucketKey) => void;
  activeGradeFilter: CreditGrade | 'ALL';
  onSelectGradeFilter: (grade: CreditGrade | 'ALL') => void;
}

const GRADE_STYLE = new Map<CreditGrade, { bg: string; label: string }>([
  ['A+', { bg: 'bg-emerald-600 text-white', label: 'ممتاز' }],
  ['A', { bg: 'bg-emerald-500 text-white', label: 'جيد جداً' }],
  ['B', { bg: 'bg-blue-600 text-white', label: 'متوسط' }],
  ['C', { bg: 'bg-amber-500 text-white', label: 'مرتفع' }],
  ['D', { bg: 'bg-orange-600 text-white', label: 'حرج' }],
  ['F', { bg: 'bg-rose-700 text-white', label: 'متعثر' }],
]);

const SEGMENT_META: Array<{ id: RfmSegment; label: string; cls: string }> = [
  { id: 'champions', label: 'أبطال (شراء عالٍ + سداد ممتاز)', cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200' },
  { id: 'loyal', label: 'مخلصون ومنتظمون', cls: 'bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200' },
  { id: 'high_value_risk', label: 'مبيعات عالية مع تأخر سداد', cls: 'bg-amber-100 text-amber-950 dark:bg-amber-950/60 dark:text-amber-200' },
  { id: 'at_risk', label: 'مخاطر تعثر / متأخرون', cls: 'bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200' },
  { id: 'potential', label: 'عملاء جدد واعدون', cls: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200' },
  { id: 'dormant', label: 'خاملون / منقطعون', cls: 'bg-slate-200 text-black dark:bg-slate-800 dark:text-slate-200' },
];

const AgingBucketCard: React.FC<{
  label: string;
  eclRate: string;
  amount: number;
  count: number;
  pct: number;
  barCls: string;
  currency: string;
  selected: boolean;
  onClick: () => void;
}> = ({ label, eclRate, amount, count, pct, barCls, currency, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'w-full rounded-lg border p-1.5 text-right transition-all',
      selected
        ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500/30 dark:border-blue-400 dark:bg-blue-950/30'
        : 'border-slate-100 bg-slate-50/50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40'
    )}
  >
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <div className="flex items-center gap-1.5">
        <span className={cn('h-2.5 w-2.5 rounded-sm', barCls)} />
        <span className="font-black text-black dark:text-slate-100">{label}</span>
        <span className="rounded bg-white px-1.5 py-0.2 font-mono text-[9.5px] font-bold text-black/75 dark:bg-slate-800 dark:text-slate-300">
          مخصص {eclRate}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-black/70 dark:text-slate-400">
          {formatNumberDisplay(count)} عميل
        </span>
        <span dir="ltr" className="font-mono text-xs font-black text-black dark:text-white">
          {formatCurrency(amount, currency)}
        </span>
        <span className="w-10 text-left font-mono text-[10px] font-black text-blue-700 dark:text-blue-300">
          {String(pct)}%
        </span>
      </div>
    </div>
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
      <div
        className={cn('h-full rounded-full transition-all duration-300', barCls)}
        style={{ width: `${String(Math.min(100, pct))}%` }}
      />
    </div>
  </button>
);

const AgingMatrixPanel: React.FC<{
  summary: CustomerCreditSummary;
  currency: string;
  activeAgingBucket: AgingBucketKey;
  onSelectAgingBucket: (b: AgingBucketKey) => void;
}> = ({ summary, currency, activeAgingBucket, onSelectAgingBucket }) => {
  const totalRec = Math.max(summary.total_receivable, 1);
  const buckets: Array<{ key: AgingBucketKey; label: string; eclRate: string; amount: number; count: number; barCls: string }> = [
    { key: 'current', label: 'جاري (لم يحن)', eclRate: '0.5%', amount: summary.aging.current, count: summary.aging.count_current, barCls: 'bg-emerald-500' },
    { key: 'd1_30', label: '1 – 30 يوماً', eclRate: '2%', amount: summary.aging.d1_30, count: summary.aging.count_1_30, barCls: 'bg-blue-500' },
    { key: 'd31_60', label: '31 – 60 يوماً', eclRate: '8%', amount: summary.aging.d31_60, count: summary.aging.count_31_60, barCls: 'bg-amber-500' },
    { key: 'd61_90', label: '61 – 90 يوماً', eclRate: '25%', amount: summary.aging.d61_90, count: summary.aging.count_61_90, barCls: 'bg-orange-600' },
    { key: 'd90_plus', label: 'أكثر من 90 يوماً', eclRate: '60%', amount: summary.aging.d90_plus, count: summary.aging.count_90_plus, barCls: 'bg-rose-600' },
  ];
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <BarChart3 size={15} className="text-blue-600" />
          <h4 className="text-xs font-black text-black dark:text-white">مصفوفة أعمار الديون التفاعلية (AR Aging + IFRS 9 ECL)</h4>
        </div>
        {activeAgingBucket !== 'all' && (
          <button type="button" onClick={() => { onSelectAgingBucket('all'); }} className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-black text-blue-700 hover:bg-blue-100 dark:bg-slate-800 dark:text-blue-300">
            إلغاء فلتر الشريحة
          </button>
        )}
      </div>
      <div className="space-y-2">
        {buckets.map(({ key, ...rest }) => (
          <AgingBucketCard
            key={key}
            {...rest}
            pct={Math.round((rest.amount / totalRec) * 1000) / 10}
            currency={currency}
            selected={activeAgingBucket === key}
            onClick={() => { onSelectAgingBucket(activeAgingBucket === key ? 'all' : key); }}
          />
        ))}
      </div>
    </div>
  );
};

const CreditGradesStrip: React.FC<{
  gradeCounts: Map<CreditGrade, number>;
  activeGradeFilter: CreditGrade | 'ALL';
  onSelectGradeFilter: (g: CreditGrade | 'ALL') => void;
}> = ({ gradeCounts, activeGradeFilter, onSelectGradeFilter }) => (
  <div>
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <ShieldAlert size={15} className="text-rose-600" />
        <h4 className="text-xs font-black text-black dark:text-white">التصنيف الائتماني (Credit Grades A+ – F)</h4>
      </div>
      {activeGradeFilter !== 'ALL' && (
        <button type="button" onClick={() => { onSelectGradeFilter('ALL'); }} className="text-[10px] font-black text-blue-600 hover:underline">
          عرض الكل
        </button>
      )}
    </div>
    <div className="grid grid-cols-6 gap-1">
      {(['A+', 'A', 'B', 'C', 'D', 'F'] as const).map(grade => {
        const style = GRADE_STYLE.get(grade);
        const isSelected = activeGradeFilter === grade;
        return (
          <button
            key={grade}
            type="button"
            onClick={() => { onSelectGradeFilter(isSelected ? 'ALL' : grade); }}
            className={cn(
              'flex flex-col items-center rounded-lg border p-1.5 transition-all',
              isSelected ? 'border-blue-600 ring-2 ring-blue-500/30' : 'border-slate-200 hover:border-slate-400 dark:border-slate-700'
            )}
          >
            <span className={cn('rounded px-1.5 py-0.5 font-mono text-[11px] font-black', style?.bg)}>{grade}</span>
            <span className="mt-1 font-mono text-xs font-black text-black dark:text-white">{formatNumberDisplay(gradeCounts.get(grade) ?? 0)}</span>
            <span className="truncate text-[9px] font-bold text-black/70 dark:text-slate-400">{style?.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);

const RfmMatrixGrid: React.FC<{ segCounts: Map<RfmSegment, number> }> = ({ segCounts }) => (
  <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
    <div className="mb-1.5 flex items-center gap-1.5">
      <Award size={14} className="text-amber-600" />
      <h4 className="text-xs font-black text-black dark:text-white">مصفوفة القيمة مقابل المخاطر (RFM — فصل الـ VIP عن المتعثرين)</h4>
    </div>
    <div className="grid grid-cols-2 gap-1">
      {SEGMENT_META.map(seg => (
        <div key={seg.id} className={cn('flex items-center justify-between gap-1 rounded-lg px-2 py-1 text-[10.5px] font-black', seg.cls)}>
          <span className="truncate">{seg.label}</span>
          <span className="shrink-0 font-mono text-xs">{formatNumberDisplay(segCounts.get(seg.id) ?? 0)}</span>
        </div>
      ))}
    </div>
  </div>
);

const GradesAndRfmPanel: React.FC<{
  gradeCounts: Map<CreditGrade, number>;
  segCounts: Map<RfmSegment, number>;
  activeGradeFilter: CreditGrade | 'ALL';
  onSelectGradeFilter: (g: CreditGrade | 'ALL') => void;
}> = ({ gradeCounts, segCounts, activeGradeFilter, onSelectGradeFilter }) => (
  <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
    <CreditGradesStrip gradeCounts={gradeCounts} activeGradeFilter={activeGradeFilter} onSelectGradeFilter={onSelectGradeFilter} />
    <RfmMatrixGrid segCounts={segCounts} />
  </div>
);

export const AgingAndRiskCharts: React.FC<AgingAndRiskChartsProps> = ({
  summary,
  customers,
  currency,
  activeAgingBucket,
  onSelectAgingBucket,
  activeGradeFilter,
  onSelectGradeFilter,
}) => {
  const gradeCounts = new Map<CreditGrade, number>();
  const segCounts = new Map<RfmSegment, number>();
  for (const c of customers) {
    gradeCounts.set(c.creditGrade, (gradeCounts.get(c.creditGrade) ?? 0) + 1);
    segCounts.set(c.rfmSegment, (segCounts.get(c.rfmSegment) ?? 0) + 1);
  }
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
      <AgingMatrixPanel
        summary={summary}
        currency={currency}
        activeAgingBucket={activeAgingBucket}
        onSelectAgingBucket={onSelectAgingBucket}
      />
      <GradesAndRfmPanel
        gradeCounts={gradeCounts}
        segCounts={segCounts}
        activeGradeFilter={activeGradeFilter}
        onSelectGradeFilter={onSelectGradeFilter}
      />
    </div>
  );
};
