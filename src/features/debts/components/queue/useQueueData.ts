import { useMemo, useState } from 'react';
import { useDebtPriorityQueue } from '../../hooks/useDebtQueries';
import {
  EMPTY_QUEUE_FILTERS,
  buildQueueFilterOptions,
  filterQueueRows,
  summarizeQueue,
  type QueueFilters,
} from '../../lib/queueGrid';
import type { DebtQueueBucket } from '../../types';
import { FOCUS_ROWS, QUEUE_LIMIT } from './queueCardConstants';
import type { QueueData } from './queueTypes';

/**
 * بيانات الطابور + حالة الفلترة (بحث/درجة/عملة/تصعيد/مسؤول/مفاتيح).
 * الفلترة والتركيز مشتقان بـ`useMemo` كي لا يُعاد بناؤهما في كل تصيير.
 */
export const useQueueData = (bucket: DebtQueueBucket): QueueData => {
  const query = useDebtPriorityQueue(bucket, QUEUE_LIMIT);
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const [filters, setFilters] = useState<QueueFilters>(EMPTY_QUEUE_FILTERS);
  const [focusOnly, setFocusOnly] = useState(false);
  const filtered = useMemo(() => filterQueueRows(rows, filters), [rows, filters]);
  const visible = useMemo(
    () => (focusOnly ? filtered.slice(0, FOCUS_ROWS) : filtered),
    [filtered, focusOnly]
  );
  const options = useMemo(() => buildQueueFilterOptions(rows), [rows]);
  const summary = useMemo(() => summarizeQueue(visible), [visible]);
  return { query, rows, filters, setFilters, focusOnly, setFocusOnly, visible, options, summary };
};
