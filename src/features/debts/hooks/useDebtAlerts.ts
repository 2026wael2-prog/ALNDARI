/**
 * تنبيهات تحصيل الديون — محرك مركزي يعمل في هيكل التطبيق (App)، لا داخل قسم
 * الديون فقط: كان `useDebtAlerts` يُستدعى في `DebtsLayout` وحده، فلا يصل أي
 * تنبيه لمن لم يفتح القسم.
 *
 * الوسوم ثابتة لمَنْع تكرار الصف في القائمة، لكن `store.addNotification` يرسل
 * إشعار نظام عند تغيّر المحتوى فعلياً — لذلك نُضمّن الأرقام في الرسالة كي
 * يكون التغيّر ملموساً (عدد العملاء + أقصى تأخير) بدل نص ثابت يصمت للأبد.
 */
import { useEffect } from 'react';
import { ROUTES } from '../../../core/routes/paths';
import { useAuthStore } from '../../auth/store';
import { useNotificationStore } from '../../notifications/store';
import { useDebtDashboard } from './useDebtQueries';
import type { FollowUpDashboardRow } from '../types';

/** رسالة الديون الحرجة — خارج الخطّاف لإبقاء تعقيده منخفضاً. */
const criticalMessage = (rows: FollowUpDashboardRow[]): string => {
  const maxDays = rows.reduce((max, row) => Math.max(max, row.days_overdue), 0);
  const topNames = rows
    .slice(0, 2)
    .map(row => row.party_name)
    .join('، ');
  const maxPart = maxDays > 0 ? ` (أقصى تأخير ${String(maxDays)} يوماً)` : '';
  const namesPart = topNames.length > 0 ? ` — أبرزهم: ${topNames}` : '';
  return `${String(rows.length)} عميل تجاوز تأخيرهم الحد الحرج${maxPart}${namesPart}. يرجى بدء التحصيل اليوم.`;
};

/** رسالة الوعود المخلَفة. */
const brokenPromiseMessage = (rows: FollowUpDashboardRow[]): string => {
  const newestName = rows.length > 0 ? rows[0].party_name : '';
  const namesPart = newestName.length > 0 ? ` — أحدثها: ${newestName}` : '';
  return `${String(rows.length)} عميل لديهم وعود سداد مخلَفة${namesPart}. تحتاج متابعة وإعادة جدولة.`;
};

export const useDebtAlerts = (): void => {
  const { user } = useAuthStore();
  const { data: rows } = useDebtDashboard();
  const addNotification = useNotificationStore(state => state.addNotification);

  useEffect(() => {
    const companyId = user?.company_id;
    if (companyId === undefined || rows === undefined) return;

    const critical = rows.filter(row => row.classification === 'critical');
    if (critical.length > 0) {
      addNotification({
        companyId,
        tag: 'debt_critical_summary',
        category: 'debt',
        // 'urgent' ⇒ requireInteraction في إشعار سطح المكتب، فلا يختفي وحده.
        priority: 'urgent',
        title: 'ديون حرجة تحتاج تدخلاً فورياً',
        message: criticalMessage(critical),
        type: 'warning',
        link: ROUTES.DASHBOARD.DEBTS_FOLLOWUP,
        actions: [{ label: 'بدء التحصيل', link: ROUTES.DASHBOARD.DEBTS_FOLLOWUP, isPrimary: true }],
      });
    }

    const broken = rows.filter(row => row.has_broken_promise);
    if (broken.length > 0) {
      addNotification({
        companyId,
        tag: 'promise_broken_summary',
        category: 'debt',
        priority: 'urgent',
        title: 'وعود سداد مخلَفة',
        message: brokenPromiseMessage(broken),
        type: 'warning',
        link: ROUTES.DASHBOARD.DEBTS_PROMISES,
        actions: [
          { label: 'متابعة الوعود', link: ROUTES.DASHBOARD.DEBTS_PROMISES, isPrimary: true },
        ],
      });
    }
  }, [rows, user?.company_id, addNotification]);
};
