import type React from 'react';
import { useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { Party } from '../../types';
import { exportGenericTableToExcel } from '@/core/utils/genericExcelExporter';
import { useCustomerCreditAnalytics } from '../../hooks/useCustomerCreditAnalytics';
import type {
  AgingBucketKey,
  CreditGrade,
  EnrichedCustomerCreditRow,
  QuickCreditFilter,
} from '../../utils/creditScoring';
import { CreditAnalyticsToolbar, type CreditFilterCounts } from './CreditAnalyticsToolbar';
import { CreditKpiStrip } from './CreditKpiStrip';
import { AgingAndRiskCharts } from './AgingAndRiskCharts';
import { CreditPortfolioTable } from './CreditPortfolioTable';
import { CreditLimitQuickModal, PromiseToPayModal } from './CreditActionModals';

interface CustomerCreditAnalyticsDashboardProps {
  parties?: Party[];
  onViewStatement: (party: Party, currencyCode?: string) => void;
}

const HIGH_RISK_GRADES = new Set<CreditGrade>(['C', 'D', 'F']);

function matchesQuickFilter(row: EnrichedCustomerCreditRow, filter: QuickCreditFilter): boolean {
  switch (filter) {
    case 'over_limit':
      return row.isOverLimit;
    case 'overdue_60':
      return row.aging_61_90 + row.aging_90_plus > 0.01;
    case 'high_risk':
      return HIGH_RISK_GRADES.has(row.creditGrade);
    case 'champions':
      return row.rfmSegment === 'champions' || row.creditGrade === 'A+';
    case 'has_promise':
      return row.next_promise_date !== null;
    case 'blocked':
      return row.status === 'blocked';
    default:
      return true;
  }
}

function matchesAgingBucket(row: EnrichedCustomerCreditRow, bucket: AgingBucketKey): boolean {
  switch (bucket) {
    case 'current':
      return row.aging_current > 0.01;
    case 'd1_30':
      return row.aging_1_30 > 0.01;
    case 'd31_60':
      return row.aging_31_60 > 0.01;
    case 'd61_90':
      return row.aging_61_90 > 0.01;
    case 'd90_plus':
      return row.aging_90_plus > 0.01;
    default:
      return true;
  }
}

function computeFilterCounts(rows: EnrichedCustomerCreditRow[]): CreditFilterCounts {
  return {
    all: rows.length,
    overLimit: rows.filter(r => r.isOverLimit).length,
    overdue60: rows.filter(r => r.aging_61_90 + r.aging_90_plus > 0.01).length,
    highRisk: rows.filter(r => HIGH_RISK_GRADES.has(r.creditGrade)).length,
    champions: rows.filter(r => r.rfmSegment === 'champions' || r.creditGrade === 'A+').length,
    hasPromise: rows.filter(r => r.next_promise_date !== null).length,
    blocked: rows.filter(r => r.status === 'blocked').length,
  };
}

function exportCreditPortfolioExcel(rows: EnrichedCustomerCreditRow[], currency: string): void {
  if (rows.length === 0) return;
  void exportGenericTableToExcel({
    title: `تقرير تحليلات الائتمان وأعمار الديون (${currency})`,
    headers: [
      'العميل',
      'الهاتف',
      'التصنيف',
      'الدرجة (100)',
      `الرصيد (${currency})`,
      'السقف الائتماني',
      'جاري',
      '1-30 يوم',
      '31-60 يوم',
      '61-90 يوم',
      '+90 يوم',
      'أيام التأخير',
      'مخصص ECL',
      'آخر سداد',
      'وعد السداد',
    ],
    rows: rows.map(r => [
      r.name,
      r.phone ?? '',
      r.creditGrade,
      r.creditScore,
      r.balance,
      r.credit_limit,
      r.aging_current,
      r.aging_1_30,
      r.aging_31_60,
      r.aging_61_90,
      r.aging_90_plus,
      r.max_days_overdue,
      r.eclAmount,
      r.last_payment_date ?? '',
      r.next_promise_date ?? '',
    ]),
    fileName: `customer-credit-aging-${currency}.xlsx`,
    colorTheme: 'emerald',
  });
}

const LoadingState: React.FC<{ currency: string }> = ({ currency }) => (
  <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
    <RefreshCw size={22} className="animate-spin text-blue-600" />
    <p className="text-xs font-black text-black dark:text-slate-200">
      جاري تحليل محفظة الائتمان وأعمار الديون ({currency})...
    </p>
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/70 p-6 text-center dark:border-rose-900 dark:bg-rose-950/20">
    <AlertTriangle size={22} className="text-rose-600" />
    <p className="text-xs font-black text-rose-900 dark:text-rose-200">
      تعذر تحميل تحليلات الائتمان: {message}
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-black text-white hover:bg-rose-700"
    >
      إعادة المحاولة
    </button>
  </div>
);

interface CreditFilterCriteria {
  quickFilter: QuickCreditFilter;
  agingBucket: AgingBucketKey;
  gradeFilter: CreditGrade | 'ALL';
  searchTerm: string;
}

function filterCreditRows(
  customers: EnrichedCustomerCreditRow[],
  criteria: CreditFilterCriteria
): EnrichedCustomerCreditRow[] {
  const q = criteria.searchTerm.trim().toLowerCase();
  return customers.filter(row => {
    if (!matchesQuickFilter(row, criteria.quickFilter) || !matchesAgingBucket(row, criteria.agingBucket)) return false;
    if (criteria.gradeFilter !== 'ALL' && row.creditGrade !== criteria.gradeFilter) return false;
    if (q.length === 0) return true;
    return `${row.name} ${row.phone ?? ''} ${row.category_name ?? ''}`.toLowerCase().includes(q);
  });
}

function resolvePartyForStatement(
  partyById: Map<string, Party>,
  row: EnrichedCustomerCreditRow
): Party {
  return (
    partyById.get(row.party_id) ??
    ({
      id: row.party_id,
      name: row.name,
      phone: row.phone,
      type: 'customer',
      status: row.status === 'blocked' ? 'blocked' : 'active',
    } as Party)
  );
}

const AnalyticsSummarySection: React.FC<{
  summary: NonNullable<ReturnType<typeof useCustomerCreditAnalytics>['summary']>;
  customers: EnrichedCustomerCreditRow[];
  currency: 'SAR' | 'YER';
  agingBucket: AgingBucketKey;
  gradeFilter: CreditGrade | 'ALL';
  onSelectAgingBucket: (b: AgingBucketKey) => void;
  onSelectGradeFilter: (g: CreditGrade | 'ALL') => void;
  onToggleFilter: (f: QuickCreditFilter) => void;
}> = ({ summary, customers, currency, agingBucket, gradeFilter, onSelectAgingBucket, onSelectGradeFilter, onToggleFilter }) => (
  <>
    <CreditKpiStrip
      summary={summary}
      currency={currency}
      onClickOverLimit={() => { onToggleFilter('over_limit'); }}
      onClickOverdue={() => { onToggleFilter('overdue_60'); }}
    />
    <AgingAndRiskCharts
      summary={summary}
      customers={customers}
      currency={currency}
      activeAgingBucket={agingBucket}
      onSelectAgingBucket={onSelectAgingBucket}
      activeGradeFilter={gradeFilter}
      onSelectGradeFilter={onSelectGradeFilter}
    />
  </>
);

export const CustomerCreditAnalyticsDashboard: React.FC<CustomerCreditAnalyticsDashboardProps> = ({
  parties = [],
  onViewStatement,
}) => {
  const [currency, setCurrency] = useState<'SAR' | 'YER'>('SAR');
  const [periodDays, setPeriodDays] = useState(90);
  const [quickFilter, setQuickFilter] = useState<QuickCreditFilter>('all');
  const [agingBucket, setAgingBucket] = useState<AgingBucketKey>('all');
  const [gradeFilter, setGradeFilter] = useState<CreditGrade | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [policyModalRow, setPolicyModalRow] = useState<EnrichedCustomerCreditRow | null>(null);
  const [promiseModalRow, setPromiseModalRow] = useState<EnrichedCustomerCreditRow | null>(null);

  const { summary, customers, isLoading, isFetching, error, refetch } = useCustomerCreditAnalytics({ currency, periodDays });
  const partyById = useMemo(() => new Map(parties.map(p => [p.id, p])), [parties]);
  const counts = useMemo(() => computeFilterCounts(customers), [customers]);
  const filteredRows = useMemo(
    () => filterCreditRows(customers, { quickFilter, agingBucket, gradeFilter, searchTerm }),
    [customers, quickFilter, agingBucket, gradeFilter, searchTerm]
  );

  if (isLoading && summary === null) return <LoadingState currency={currency} />;
  if (error !== null && summary === null) return <ErrorState message={error.message} onRetry={() => { void refetch(); }} />;

  return (
    <div className="space-y-2">
      <CreditAnalyticsToolbar
        currency={currency}
        onCurrencyChange={curr => { setCurrency(curr); setAgingBucket('all'); }}
        periodDays={periodDays}
        onPeriodChange={setPeriodDays}
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        counts={counts}
        isFetching={isFetching}
        onRefresh={() => { void refetch(); }}
        onExportExcel={() => { exportCreditPortfolioExcel(filteredRows, currency); }}
      />
      {summary !== null && (
        <AnalyticsSummarySection summary={summary} customers={customers} currency={currency} agingBucket={agingBucket} gradeFilter={gradeFilter} onSelectAgingBucket={setAgingBucket} onSelectGradeFilter={setGradeFilter} onToggleFilter={f => { setQuickFilter(prev => (prev === f ? 'all' : f)); }} />
      )}
      <CreditPortfolioTable rows={filteredRows} currency={currency} onViewStatement={row => { onViewStatement(resolvePartyForStatement(partyById, row), currency); }} onEditPolicy={setPolicyModalRow} onLogPromise={setPromiseModalRow} />
      {policyModalRow !== null && <CreditLimitQuickModal customer={policyModalRow} currency={currency} onClose={() => { setPolicyModalRow(null); }} />}
      {promiseModalRow !== null && <PromiseToPayModal customer={promiseModalRow} currency={currency} onClose={() => { setPromiseModalRow(null); }} />}
    </div>
  );
};

export default CustomerCreditAnalyticsDashboard;
