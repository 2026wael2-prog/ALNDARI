import { supabase } from '../../../lib/supabaseClient';

/**
 * نقل رصيد الصندوق الرئيسي (1010) إلى صندوق الكاش السعودي (101001)
 * عبر معاملة ذرية واحدة في قاعدة البيانات (migrate_cashbox_balances_atomic).
 */
export const migrateCashboxBalances = async (companyId: string, _userId: string) => {
  const { data, error } = await (supabase.rpc as Function)('migrate_cashbox_balances_atomic', {
    p_company_id: companyId,
  });

  if (error) {
    throw new Error(error.message || 'فشل في ترحيل أرصدة الصندوق');
  }

  const res = (data && typeof data === 'object' ? data : {}) as { message?: string };
  return {
    message:
      res.message ||
      'تم نقل رصيد الصندوق الرئيسي إلى صندوق الكاش السعودي عبر قيد محاسبي متوازن.',
  };
};
