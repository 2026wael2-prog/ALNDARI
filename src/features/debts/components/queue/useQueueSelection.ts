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
    const existing = (dashboardRows ?? []).find(row => row.party_id === remindRow.party_id);
    if (existing) return existing;

    // صف احتياطي متكامل للسماح بالتذكير المباشر من طابور الأولوية لأي عميل
    return {
      party_id: remindRow.party_id,
      party_name: remindRow.party_name,
      party_phone: remindRow.party_phone,
      category: '',
      credit_limit: null,
      currency_code: remindRow.currency_code ?? 'SAR',
      outstanding_balance: Number(remindRow.amount ?? 0),
      overdue_amount: remindRow.is_overdue ? Number(remindRow.amount ?? 0) : 0,
      oldest_due_date: remindRow.due_at ? remindRow.due_at.slice(0, 10) : null,
      next_due_date: remindRow.due_at ? remindRow.due_at.slice(0, 10) : null,
      days_overdue: remindRow.days_late,
      classification: remindRow.is_overdue ? 'overdue' : 'normal',
      reminder_status: 'ready',
      last_reminded_at: null,
      last_contact_date: null,
      has_broken_promise: remindRow.task_type === 'broken_promise',
      pending_promise_count: 0,
      pending_promise_amount: 0,
      pending_promise_date: null,
      invoice_count: 1,
      opening_balance: 0,
      escalation_stage: remindRow.escalation_stage ?? '',
    };
  }, [dashboardRows, remindRow]);

  const partiesWithDetail = useMemo(
    () => new Set((dashboardRows ?? []).map(row => row.party_id)),
    [dashboardRows]
  );

  return { partiesWithDetail, remindRow, setRemindRow, promiseRow, setPromiseRow, reminderTarget };
};
