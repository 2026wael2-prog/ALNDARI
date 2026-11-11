/**
 * محرك تنبيهات التحصيل داخل هيكل التطبيق (App) بدل قسم الديون فقط.
 *
 * بوابة الصلاحية إلزامية: استدعاء `get_debt_followup_dashboard` بلا `debts:read`
 * يرفضه الخادم (SECURITY DEFINER + fn_assert_company_access)، فبدون هذا الحاجز
 * كان كل مستخدم عادي سيولّد أخطاء صلاحيات متكررة في السجلات كل 5 دقائق.
 *
 * الفصل إلى مكوّنين مقصود: `useDebtAlerts` خطّاف لا يجوز استدعاؤه شرطياً،
 * فنُركّب المكوّن النشط فقط بعد تأكيد الصلاحية.
 */
import React from 'react';
import { usePermission } from '../../../core/hooks/usePermission';
import { useDebtAlerts } from '../hooks/useDebtAlerts';

const DebtAlertsActive: React.FC = () => {
  useDebtAlerts();
  return null;
};

export const DebtAlertsRunner: React.FC = () => {
  const { hasPermission, isLoading } = usePermission('debts:read');
  if (isLoading || !hasPermission) return null;
  return <DebtAlertsActive />;
};

export default DebtAlertsRunner;
