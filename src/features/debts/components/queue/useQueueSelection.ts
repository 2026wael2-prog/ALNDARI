import { useMemo, useState } from 'react';
import type { DebtPriorityQueueRow, FollowUpDashboardRow } from '../../types';
import type { QueueSelection } from './queueTypes';

/** حالة اختيار الصف + اشتقاق ما تحتاجه النوافذ (تذكير/وعد) من لوحة المتابعة. */
export const useQueueSelection = (
  dashboardRows: FollowUpDashboardRow[] | undefined
): QueueSelection => {
  const [remindRow, setRemindRow] = useState<DebtPriorityQueueRow | null>(null);
  const [promiseRow, setPromiseRow] = useState<DebtPriorityQueueRow | null>(null);

  const reminderTarget = useMemo<FollowUpDashboardRow | null>(() => {
    if (remindRow === null) return null;
    return (dashboardRows ?? []).find(row => row.party_id === remindRow.party_id) ?? null;
  }, [dashboardRows, remindRow]);

  const partiesWithDetail = useMemo(
    () => new Set((dashboardRows ?? []).map(row => row.party_id)),
    [dashboardRows]
  );

  return { partiesWithDetail, remindRow, setRemindRow, promiseRow, setPromiseRow, reminderTarget };
};
