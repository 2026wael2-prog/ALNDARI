import type { Dispatch, SetStateAction } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type {
  DebtPriorityQueueRow,
  FollowUpDashboardRow,
} from '../../types';
import type { QueueFilterOptions, QueueFilters, QueueSavedView, QueueSummary } from '../../lib/queueGrid';

/** حالة استعلام الطابور كما يعيدها `useDebtPriorityQueue`. */
export type QueueQuery = UseQueryResult<DebtPriorityQueueRow[]>;

/** بيانات الطابور + حالة الفلترة، مشتركة بين الترويسة والشبكة والقائمة. */
export interface QueueData {
  query: QueueQuery;
  rows: DebtPriorityQueueRow[];
  filters: QueueFilters;
  setFilters: Dispatch<SetStateAction<QueueFilters>>;
  focusOnly: boolean;
  setFocusOnly: Dispatch<SetStateAction<boolean>>;
  visible: DebtPriorityQueueRow[];
  options: QueueFilterOptions;
  summary: QueueSummary;
}

/** كل معالجات الطابور في واجهة واحدة. */
export interface QueueHandlers {
  toggleFocus: () => void;
  refresh: () => void;
  patchFilters: (change: Partial<QueueFilters>) => void;
  applyView: (view: QueueSavedView) => void;
  clearFilters: () => void;
  clearSelection: () => void;
  handleAssign: (collectorId: string) => void;
  exportSelected: () => void;
  exportVisible: () => void;
}

/** حالة اختيار الصف + ما تحتاجه نوافذ التذكير/الوعد. */
export interface QueueSelection {
  partiesWithDetail: ReadonlySet<string>;
  remindRow: DebtPriorityQueueRow | null;
  setRemindRow: (row: DebtPriorityQueueRow | null) => void;
  promiseRow: DebtPriorityQueueRow | null;
  setPromiseRow: (row: DebtPriorityQueueRow | null) => void;
  /** ReminderModal يستهلك صف لوحة المتابعة (رصيد + تصنيف + آخر تذكير). */
  reminderTarget: FollowUpDashboardRow | null;
}

export interface QueueExportController {
  isExporting: boolean;
  runExport: (rows: DebtPriorityQueueRow[]) => void;
}
