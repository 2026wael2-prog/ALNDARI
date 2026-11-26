import { formatCurrency } from '@/core/utils';

export type CreditGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export type RfmSegment =
  | 'champions'
  | 'loyal'
  | 'potential'
  | 'high_value_risk'
  | 'at_risk'
  | 'dormant'
  | 'settled';

export type AgingBucketKey = 'all' | 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export type QuickCreditFilter =
  | 'all'
  | 'over_limit'
  | 'overdue_60'
  | 'high_risk'
  | 'champions'
  | 'has_promise'
  | 'blocked';

export interface CreditAgingSummary {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  count_current: number;
  count_1_30: number;
  count_31_60: number;
  count_61_90: number;
  count_90_plus: number;
}

export interface CustomerCreditSummary {
  total_customers: number;
  debtors_count: number;
  creditors_count: number;
  settled_count: number;
  total_receivable: number;
  total_credit_balance: number;
  total_overdue: number;
  overdue_percent: number;
  period_total_sales: number;
  period_credit_sales: number;
  period_collections: number;
  dso_days: number;
  cei_percent: number;
  over_limit_count: number;
  over_limit_amount: number;
  concentration_top5_percent: number;
  ecl_provision: number;
  aging: CreditAgingSummary;
}

export interface CustomerCreditRawRow {
  party_id: string;
  name: string;
  phone: string | null;
  status: string;
  party_type: string;
  category_name: string | null;
  credit_limit: number;
  payment_terms_days: number;
  customer_since: string | null;
  balance: number;
  other_currency_balance: number;
  other_currency_code: string;
  aging_current: number;
  aging_1_30: number;
  aging_31_60: number;
  aging_61_90: number;
  aging_90_plus: number;
  overdue_amount: number;
  oldest_unpaid_date: string | null;
  max_days_overdue: number;
  sales_12m: number;
  credit_sales_12m: number;
  returns_12m: number;
  invoices_count_12m: number;
  last_invoice_date: string | null;
  collections_12m: number;
  last_payment_date: string | null;
  last_payment_amount: number;
  days_since_last_payment: number | null;
  next_promise_date: string | null;
  next_promise_subject: string | null;
  next_promise_status: string | null;
}

export interface CustomerCreditAnalyticsResponse {
  currency: string;
  other_currency: string;
  period_days: number;
  generated_at: string;
  summary: CustomerCreditSummary;
  customers: CustomerCreditRawRow[];
}

export interface CreditScoreBreakdown {
  punctuality: number;
  aging: number;
  utilization: number;
  velocity: number;
  returns: number;
}

export interface EnrichedCustomerCreditRow extends CustomerCreditRawRow {
  creditScore: number;
  creditGrade: CreditGrade;
  scoreBreakdown: CreditScoreBreakdown;
  utilizationPercent: number | null;
  isOverLimit: boolean;
  eclAmount: number;
  rfmSegment: RfmSegment;
  policyLabel: string;
}

export const ECL_RATES = {
  current: 0.005,
  d1_30: 0.02,
  d31_60: 0.08,
  d61_90: 0.25,
  d90_plus: 0.6,
} as const;

const clampScore = (val: number): number => Math.max(0, Math.min(100, Math.round(val)));

function scorePunctuality(row: CustomerCreditRawRow): number {
  if (row.balance <= 0.01) return 100;
  const overdueRatio = row.balance > 0 ? row.overdue_amount / row.balance : 0;
  const baseCollection =
    row.credit_sales_12m > 0
      ? Math.min(1, row.collections_12m / row.credit_sales_12m)
      : row.collections_12m > 0
        ? 0.85
        : 0.25;
  const recencyPenalty =
    row.days_since_last_payment === null
      ? 25
      : row.days_since_last_payment > 90
        ? 25
        : row.days_since_last_payment > 45
          ? 12
          : 0;
  return clampScore(baseCollection * 60 + (1 - overdueRatio) * 40 - recencyPenalty);
}

function scoreAging(row: CustomerCreditRawRow): number {
  if (row.balance <= 0.01) return 100;
  const weightedRisk =
    (row.aging_1_30 * 0.2 +
      row.aging_31_60 * 0.5 +
      row.aging_61_90 * 0.8 +
      row.aging_90_plus * 1.0) /
    row.balance;
  return clampScore(100 - weightedRisk * 100);
}

function scoreUtilization(row: CustomerCreditRawRow): number {
  if (row.balance <= 0.01) return 100;
  if (row.credit_limit <= 0) {
    return row.overdue_amount > 0.01 ? 55 : 80;
  }
  const pct = (row.balance / row.credit_limit) * 100;
  if (pct <= 60) return 100;
  if (pct <= 85) return 75;
  if (pct <= 100) return 45;
  return 0;
}

function scoreVelocity(row: CustomerCreditRawRow): number {
  const invScore = Math.min(60, row.invoices_count_12m * 8);
  const hasRecentPurchase =
    row.last_invoice_date !== null &&
    Date.now() - new Date(row.last_invoice_date).getTime() <= 60 * 86400_000;
  return clampScore(25 + invScore + (hasRecentPurchase ? 15 : 0));
}

function scoreReturns(row: CustomerCreditRawRow): number {
  if (row.sales_12m <= 0.01) return 85;
  const ratio = row.returns_12m / row.sales_12m;
  return clampScore(100 - ratio * 250);
}

export function computeCreditScore(row: CustomerCreditRawRow): {
  score: number;
  grade: CreditGrade;
  breakdown: CreditScoreBreakdown;
} {
  const breakdown: CreditScoreBreakdown = {
    punctuality: scorePunctuality(row),
    aging: scoreAging(row),
    utilization: scoreUtilization(row),
    velocity: scoreVelocity(row),
    returns: scoreReturns(row),
  };

  let weighted =
    breakdown.punctuality * 0.35 +
    breakdown.aging * 0.25 +
    breakdown.utilization * 0.2 +
    breakdown.velocity * 0.1 +
    breakdown.returns * 0.1;

  if (row.status === 'blocked') {
    weighted = Math.min(weighted, 35);
  }

  const score = clampScore(weighted);
  return { score, grade: gradeFromScore(score), breakdown };
}

export function gradeFromScore(score: number): CreditGrade {
  if (score >= 90) return 'A+';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

export function getCreditPolicyLabel(grade: CreditGrade): string {
  switch (grade) {
    case 'A+':
      return 'ممتاز — مؤهل لرفع السقف';
    case 'A':
      return 'جيد جداً — ائتمان منتظم';
    case 'B':
      return 'متوسط — مراقبة دورية';
    case 'C':
      return 'مخاطر مرتفعة — دفعة 50%';
    case 'D':
    case 'F':
      return 'حرج — تجميد آجل / نقدي فقط';
  }
}

export function computeCustomerEcl(row: CustomerCreditRawRow): number {
  if (row.balance <= 0.01) return 0;
  const ecl =
    row.aging_current * ECL_RATES.current +
    row.aging_1_30 * ECL_RATES.d1_30 +
    row.aging_31_60 * ECL_RATES.d31_60 +
    row.aging_61_90 * ECL_RATES.d61_90 +
    row.aging_90_plus * ECL_RATES.d90_plus;
  return Math.round(ecl * 100) / 100;
}

function isHighValueCustomer(row: CustomerCreditRawRow): boolean {
  return row.invoices_count_12m >= 6 && row.sales_12m > 0;
}

export function classifyRfmSegment(row: CustomerCreditRawRow, creditScore: number): RfmSegment {
  const isRisky = creditScore < 55 || row.aging_61_90 + row.aging_90_plus > 0.01;
  if (isHighValueCustomer(row)) {
    if (isRisky) return 'high_value_risk';
    if (creditScore >= 75) return 'champions';
  }
  if (isRisky) return 'at_risk';
  if (row.invoices_count_12m >= 2 && creditScore >= 65) return 'loyal';
  if (row.invoices_count_12m === 1) return 'potential';
  return row.balance <= 0.01 ? 'settled' : 'dormant';
}

export function enrichCreditCustomer(row: CustomerCreditRawRow): EnrichedCustomerCreditRow {
  const { score, grade, breakdown } = computeCreditScore(row);
  const utilizationPercent =
    row.credit_limit > 0 && row.balance > 0
      ? Math.round((row.balance / row.credit_limit) * 1000) / 10
      : null;

  return {
    ...row,
    creditScore: score,
    creditGrade: grade,
    scoreBreakdown: breakdown,
    utilizationPercent,
    isOverLimit: row.credit_limit > 0 && row.balance > row.credit_limit,
    eclAmount: computeCustomerEcl(row),
    rfmSegment: classifyRfmSegment(row, score),
    policyLabel: getCreditPolicyLabel(grade),
  };
}

export function buildSmartCollectionMessage(
  row: EnrichedCustomerCreditRow,
  currency: string
): string {
  const balText = formatCurrency(row.balance, currency);
  const overdueText = formatCurrency(row.overdue_amount, currency);

  if (row.max_days_overdue > 60 || row.creditGrade === 'D' || row.creditGrade === 'F') {
    return `السلام عليكم أستاذ ${row.name}، نود إشعاركم بوجود رصيد متأخر السداد على حسابكم بمبلغ ${overdueText} (إجمالي الرصيد: ${balText}) تجاوز ${String(row.max_days_overdue)} يوماً. نرجو سرعة التسوية تفادياً لتجميد المبيعات الآجلة على الحساب. شاكرين تفهمكم وتعاونكم.`;
  }
  if (row.max_days_overdue > 30) {
    return `مرحباً أستاذ ${row.name}، نذكّركم بلطف باستحقاق مبلغ ${overdueText} من إجمالي رصيدكم البالغ ${balText} (تأخير ${String(row.max_days_overdue)} يوماً). نأمل التكرم بالتحويل أو تحديد موعد السداد المناسب. ولكم جزيل الشكر.`;
  }
  return `مرحباً أستاذ ${row.name}، نود تذكيركم بلطف برصيد حسابكم الحالي البالغ ${balText} لدى المنشأة. نسعد دائماً بخدمتكم ونأمل التكرم بالمراجعة والتسوية في أقرب وقت.`;
}
