import type { DebtPriorityQueueRow } from '../../types';
import type { QueueFilters } from '../../lib/queueGrid';

/** العملة الأساسية للمنشأة مع سقوط آمن إلى الريال السعودي. */
export const baseCurrencyOf = (currency: string | undefined): string =>
  currency !== undefined && currency !== '' ? currency : 'SAR';

/** رتبة الأولوية من ترتيب الخادم — تُعرض حتى لو أعاد المستخدم فرز الأعمدة. */
export const rankOf = (rows: DebtPriorityQueueRow[]): ReadonlyMap<string, number> =>
  new Map(rows.map((row, index) => [row.task_id, index + 1]));

/** وصف نصي للفلاتر المطبقة — يُكتب في ورقة Excel للتوثيق. */
export const describeFilters = (filters: QueueFilters): string => {
  const parts: string[] = [];
  if (filters.search !== '') parts.push(`بحث: ${filters.search}`);
  if (filters.minScore > 0) parts.push(`درجة ≥ ${String(filters.minScore)}`);
  if (filters.minDaysLate > 0) parts.push(`تأخير ≥ ${String(filters.minDaysLate)} يوم`);
  if (filters.currency !== '') parts.push(`عملة ${filters.currency}`);
  if (filters.stage !== '') parts.push(`تصعيد ${filters.stage}`);
  if (filters.onlyPhone) parts.push('لهاتف');
  if (filters.onlyOverdue) parts.push('متأخر');
  if (filters.onlyStaleContact) parts.push('منقطع التواصل');
  return parts.length === 0 ? 'كل المهام' : parts.join(' • ');
};
