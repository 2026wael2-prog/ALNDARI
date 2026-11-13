import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabaseClient';

export interface CustomerCreditAlertData {
  partyId: string;
  partyName: string;
  phone?: string | null;
  balance: number; // Positive = customer owes us (debt), Negative = we owe customer (credit)
  balancesByCurrency: Array<{
    currency_code: string;
    balance: number;
  }>;
  lastPayment?: {
    id: string;
    amount: number;
    currency_code: string;
    payment_date: string;
    payment_number?: string | null;
    payment_method?: string | null;
  } | null;
}

/**
 * useCustomerCreditAlert
 * Fetches the customer's previous balance (overall + multi-currency) and the last payment/receipt.
 */
export const useCustomerCreditAlert = (
  customerId?: string | null,
  companyId?: string | null
) => {
  return useQuery<CustomerCreditAlertData | null>({
    queryKey: ['customer_credit_alert', companyId, customerId],
    queryFn: async () => {
      if (!customerId || !companyId) return null;

      const [partyRes, balancesRes, currencyBalancesRes, lastPaymentRes] = await Promise.all([
        supabase
          .from('parties')
          .select('id, name, phone')
          .eq('id', customerId)
          .eq('company_id', companyId)
          .maybeSingle(),
        supabase
          .from('party_balances')
          .select('balance')
          .eq('party_id', customerId)
          .maybeSingle(),
        supabase
          .from('party_balances_by_currency')
          .select('currency_code, balance')
          .eq('party_id', customerId),
        supabase
          .from('payments')
          .select('id, amount, currency_code, payment_date, payment_number, payment_method')
          .eq('party_id', customerId)
          .eq('type', 'receipt')
          .neq('status', 'void')
          .is('deleted_at', null)
          .order('payment_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const partyData = partyRes.data;
      if (!partyData) return null;

      const balancesByCurrency = (currencyBalancesRes.data || []).map((b: { currency_code: string | null; balance: number | null }) => ({
        currency_code: b.currency_code || 'SAR',
        balance: Number(b.balance || 0),
      }));

      // Base currency balance from party_balances (already converted to SAR in SQL; never sum raw multi-currency rows)
      const directBalance = balancesRes.data?.balance ? Number(balancesRes.data.balance) : 0;
      const computedBalance =
        balancesRes.data !== null && balancesRes.data !== undefined
          ? directBalance
          : balancesByCurrency
              .filter(b => (b.currency_code || 'SAR').toUpperCase() === 'SAR')
              .reduce((sum: number, b: { balance: number }) => sum + b.balance, 0);

      return {
        partyId: partyData.id,
        partyName: partyData.name,
        phone: partyData.phone,
        balance: computedBalance,
        balancesByCurrency,
        lastPayment: lastPaymentRes.data
          ? {
              id: lastPaymentRes.data.id,
              amount: Number(lastPaymentRes.data.amount || 0),
              currency_code: lastPaymentRes.data.currency_code || 'SAR',
              payment_date: lastPaymentRes.data.payment_date,
              payment_number: lastPaymentRes.data.payment_number,
              payment_method: lastPaymentRes.data.payment_method,
            }
          : null,
      };
    },
    enabled: Boolean(customerId && companyId),
    staleTime: 30 * 1000, // 30 seconds fresh cache
  });
};
