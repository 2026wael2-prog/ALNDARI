/**
 * queueGrid — منطق شبكة طابور التحصيل (نقي: بلا React وبلا Supabase).
 *
 * الفصل مقصود: الدرجة والترتيب يُحسبان في SQL (الواجهة لا تملك مبالغ موحّدة
 * العملة ولا سجل التواصل)، وهنا فقط الفلترة والعرض والمجاميع والتصدير — قابلة
 * للاختبار وحدها بلا DOM.
 *
 * قاعدة محاسبية: كل مجموع مالي لشبكة الطابور يُبنى على `amount_base`
 * (المبلغ محوَّلاً للعملة الأساس على الخادم) لأن جمع عملات مختلفة في رقم واحد
 * ينتج رقماً مضلِّلاً. أما `amount` فيُعرض بعملته كما هو.
 */
import { formatCurrency } from '../../../core/utils/currencyUtils';
import { normalizeSearch } from '../../../core/utils/search';
import type { DebtPriorityQueueRow, DebtQueueBucket } from '../types';

/** عتبة «بلا تواصل» بالأيام — تطابق سائق الدرجة في `get_debt_priority_queue`. */
export const STALE_CONTACT_DAYS = 7;

/** حالة الفلترة المتقدمة لشبكة الطابور (كلها على العميل بعد الترتيب من الخادم). */
export interface QueueFilters {
  search: string;
  minScore: number;
  minDaysLate: number;
  /** '' = كل العملات */
  currency: string;
  /** '' = كل المراحل (monitor/reminder/call/visit/legal) */
  stage: string;
  /** '' = كل المسؤولين */
  assignee: string;
  onlyPhone: boolean;
  onlyOverdue: boolean;
  onlyStaleContact: boolean;
}

export const EMPTY_QUEUE_FILTERS: QueueFilters = {
  search: '',
  minScore: 0,
  minDaysLate: 0,
  currency: '',
  stage: '',
  assignee: '',
  onlyPhone: false,
  onlyOverdue: false,
  onlyStaleContact: false,
};

const withPatch = (patch: Partial<QueueFilters>): QueueFilters => ({
  ...EMPTY_QUEUE_FILTERS,
  ...patch,
});

/** عرض محفوظ (preset): فلترة جاهزة بزر واحد بدل إعادة ضبط خمسة حقول. */
export interface QueueSavedView {
  id: string;
  label: string;
  hint: string;
  filters: QueueFilters;
}

export const QUEUE_SAVED_VIEWS: readonly QueueSavedView[] = [
  {
    id: 'critical',
    label: 'حرج',
    hint: 'درجة الأهمية ≥ 70',
    filters: withPatch({ minScore: 70 }),
  },
  {
    id: 'long_overdue',
    label: 'تأخر مطوّل',
    hint: 'متأخر 30 يوماً وأكثر',
    filters: withPatch({ minDaysLate: 30 }),
  },
  {
    id: 'remindable',
    label: 'قابل للتذكير',
    hint: 'له رقم هاتف فقط',
    filters: withPatch({ onlyPhone: true }),
  },
  {
    id: 'stale',
    label: 'منقطع التواصل',
    hint: 'لا تواصل منذ 7 أيام أو لا سجل',
    filters: withPatch({ onlyStaleContact: true }),
  },
];

/** مفتاح الصف في الشبكة: معرّف المهمة فريد داخل الطابور. */
export const queueRowId = (row: DebtPriorityQueueRow | undefined | null): string =>
  row?.task_id ?? '';

/** هل مضى على آخر تواصل عتبة الانقطاع (أو لا سجل تواصل أصلاً)؟ */
export const isStaleContact = (daysSinceContact: number | null): boolean =>
  daysSinceContact === null || daysSinceContact >= STALE_CONTACT_DAYS;

/** نص البحث الموحّد للصف (اسم/هاتف/مرجع/أمر/مسؤول/أسباب الدرجة). */
const rowSearchText = (row: DebtPriorityQueueRow): string => {
  const parts: Array<string | null> = [
    row.party_name,
    row.party_phone,
    row.reference_info,
    row.next_action,
    row.assigned_name,
    ...(row.score_drivers ?? []),
  ];
  return normalizeSearch(parts.map(part => part ?? '').join(' '));
};

const passesRanges = (row: DebtPriorityQueueRow, filters: QueueFilters): boolean => {
  if (filters.minScore > 0 && row.priority_score < filters.minScore) return false;
  return !(filters.minDaysLate > 0 && row.days_late < filters.minDaysLate);
};

const passesSelections = (row: DebtPriorityQueueRow, filters: QueueFilters): boolean => {
  if (filters.currency !== '' && (row.currency_code ?? '') !== filters.currency) return false;
  if (filters.stage !== '' && (row.escalation_stage ?? '') !== filters.stage) return false;
  return !(filters.assignee !== '' && (row.assigned_to ?? '') !== filters.assignee);
};

const passesFlags = (row: DebtPriorityQueueRow, filters: QueueFilters): boolean => {
  if (filters.onlyPhone && (row.party_phone ?? '') === '') return false;
  if (filters.onlyOverdue && row.days_late <= 0) return false;
  if (filters.onlyStaleContact && !isStaleContact(row.days_since_contact)) return false;
  return true;
};

/** هل يطابق الصف كل شروط الفلترة؟ */
export const matchesQueueFilters = (row: DebtPriorityQueueRow, filters: QueueFilters): boolean => {
  if (!passesRanges(row, filters)) return false;
  if (!passesSelections(row, filters)) return false;
  if (!passesFlags(row, filters)) return false;
  const term = normalizeSearch(filters.search);
  if (term === '') return true;
  return rowSearchText(row).includes(term);
};

export const filterQueueRows = (
  rows: DebtPriorityQueueRow[],
  filters: QueueFilters
): DebtPriorityQueueRow[] => rows.filter(row => matchesQueueFilters(row, filters));

/** هل العرض المحفوظ هو المطبَّق حالياً؟ (لتلوين الزر النشط) */
export const isSavedViewActive = (filters: QueueFilters, view: QueueSavedView): boolean =>
  Object.keys(view.filters).every(key => {
    const current = filters[key as keyof QueueFilters];
    const expected = view.filters[key as keyof QueueFilters];
    return current === expected;
  });

/** هل توجد أي فلاتر نشطة تخالف الحالة الافتراضية؟ */
export const isFilterActive = (filters: QueueFilters): boolean =>
  filters.search.trim() !== '' ||
  filters.minScore > 0 ||
  filters.minDaysLate > 0 ||
  filters.currency !== '' ||
  filters.stage !== '' ||
  filters.assignee !== '' ||
  filters.onlyPhone ||
  filters.onlyOverdue ||
  filters.onlyStaleContact;

/** ملخص الشبكة: كل المبالغ بالعملة الأساس، والمعدلات مقرّبة لخانة واحدة. */
export interface QueueSummary {
  count: number;
  baseTotal: number;
  overdueBaseTotal: number;
  avgDaysLate: number;
  maxDaysLate: number;
  avgScore: number;
  currencies: number;
  withPhone: number;
  staleContact: number;
}

const totalOf = (
  rows: DebtPriorityQueueRow[],
  pick: (row: DebtPriorityQueueRow) => number
): number => rows.reduce((acc, row) => acc + pick(row), 0);

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** قائمة العملات المختلفة (كل مجموع يبقى بعملته — لا خلط). */
export const currencyList = (rows: DebtPriorityQueueRow[]): string[] => {
  const seen = new Set<string>();
  rows.forEach(row => {
    if (row.currency_code !== null && row.currency_code !== '') seen.add(row.currency_code);
  });
  return [...seen].sort();
};

export const summarizeQueue = (rows: DebtPriorityQueueRow[]): QueueSummary => {
  const count = rows.length;
  const daysList = rows.map(row => row.days_late);
  return {
    count,
    baseTotal: round1(totalOf(rows, row => row.amount_base)),
    overdueBaseTotal: round1(
      totalOf(
        rows.filter(row => row.days_late > 0),
        row => row.amount_base
      )
    ),
    avgDaysLate: count === 0 ? 0 : round1(totalOf(rows, row => row.days_late) / count),
    maxDaysLate: daysList.length === 0 ? 0 : Math.max(...daysList),
    avgScore: count === 0 ? 0 : round1(totalOf(rows, row => row.priority_score) / count),
    currencies: currencyList(rows).length,
    withPhone: rows.filter(row => (row.party_phone ?? '') !== '').length,
    staleContact: rows.filter(row => isStaleContact(row.days_since_contact)).length,
  };
};

/** نسبة مساهمة الصف في إجمالي الطابور (تحليل باريتو: أين يتركّز المال). */
export const coverageShare = (value: number, total: number): number =>
  total <= 0 ? 0 : Math.round((value / total) * 1000) / 10;

export type HeatLevel = 0 | 1 | 2 | 3;

/** شدّة اللون الحراري نسبياً لأقصى قيمة في العرض الحالي. */
export const heatLevel = (value: number, max: number): HeatLevel => {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  if (ratio >= 0.66) return 3;
  if (ratio >= 0.33) return 2;
  return 1;
};

export const heatClasses = (level: HeatLevel): string => {
  switch (level) {
    case 3:
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
    case 2:
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
    case 1:
      return 'bg-sky-500/10 text-sky-700 dark:text-sky-300';
    default:
      return 'text-[var(--app-text-secondary)]';
  }
};

export type ScoreBand = 'critical' | 'high' | 'normal';

export const scoreBand = (score: number): ScoreBand => {
  if (score >= 70) return 'critical';
  if (score >= 45) return 'high';
  return 'normal';
};

export const scoreBandClasses = (band: ScoreBand): string => {
  switch (band) {
    case 'critical':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300';
    case 'high':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    default:
      return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300';
  }
};

/** عرض شريط الدرجة بالنسبة المئوية (0..100). */
export const scoreBarWidth = (score: number): string =>
  `${String(Math.max(0, Math.min(100, Math.round(score))))}%`;

/** خيارات الفلترة المتاحة من البيانات نفسها (لا قوائم ثابتة تتقادم). */
export interface QueueFilterOptions {
  currencies: string[];
  stages: string[];
  assignees: Array<{ id: string; name: string }>;
}

export const buildQueueFilterOptions = (rows: DebtPriorityQueueRow[]): QueueFilterOptions => {
  const stages = new Set<string>();
  const assignees = new Map<string, string>();
  rows.forEach(row => {
    if (row.escalation_stage !== null && row.escalation_stage !== '') {
      stages.add(row.escalation_stage);
    }
    if (row.assigned_to !== null && row.assigned_to !== '') {
      assignees.set(row.assigned_to, row.assigned_name ?? row.assigned_to);
    }
  });
  return {
    currencies: currencyList(rows),
    stages: [...stages].sort(),
    assignees: [...assignees.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
  };
};

/** سطر إجمالي الطابور بالعملة الأساس فقط (آمن محاسبياً). */
export const baseTotalLabel = (summary: QueueSummary, baseCurrency: string): string =>
  formatCurrency(summary.baseTotal, baseCurrency);

/**
 * تسمية عربية لنوع المهمة — switch صريح بدل فهرسة كائن بمفتاح متغيّر.
 * مصدر واحد يستهلكه الجدول والتصدير معاً كي لا تختلف التسمية بينهما.
 */
export const queueTaskLabel = (taskType: string): string => {
  switch (taskType) {
    // الخادم يُعيد 'overdue' للفاتورة التي مضى استحقاقها (هجرة 20261103000006).
    case 'overdue':
      return 'متأخر';
    // لم يحن أجلها بعد: «مستحقة» كانت تعني تذكيراً في غير وقته (هجرة 07).
    case 'upcoming':
      return 'لم يحن أجلها';
    case 'due_today':
      return 'فاتورة مستحقة';
    case 'promise_due':
      return 'وعد اليوم';
    case 'broken_promise':
      return 'وعد مخلَف';
    case 'critical_debt':
      return 'دين حرج';
    case 'follow_up':
      return 'متابعة مجدولة';
    case 'failed_message':
      return 'رسالة فاشلة';
    default:
      return 'مهمة تحصيل';
  }
};

/** تسمية عربية لِبِكِت الطابور. */
export const queueBucketLabel = (bucket: DebtQueueBucket): string => {
  switch (bucket) {
    case 'overdue':
      return 'متأخر';
    case 'today':
      return 'مستحق اليوم';
    case 'week':
      return 'خلال الأسبوع';
    case 'promises':
      return 'الوعود';
    case 'critical':
      return 'حرج';
    case 'nocontact':
      return 'بلا تواصل';
    default:
      return 'كل المهام';
  }
};
