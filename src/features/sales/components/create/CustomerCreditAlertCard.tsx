/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
import React, { useMemo } from 'react';
import { UserCheck, Wallet, ArrowDownRight, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useCustomerCreditAlert } from '../../hooks/useCustomerCreditAlert';
import { useAuthStore } from '../../../auth/store';
import { formatCurrency, cn } from '../../../../core/utils';
import { resolveCustomerBalanceForCurrency } from '../../utils/customerBalanceDisplay';

interface Props {
  customer: {
    id: string;
    name: string;
    phone?: string;
    type?: string;
  };
  invoiceCurrency: string;
  exchangeRate?: number | undefined;
  exchangeOperator?: 'multiply' | 'divide' | undefined;
}

export const CustomerCreditAlertCard: React.FC<Props> = ({
  customer,
  invoiceCurrency,
  exchangeRate = 1,
  exchangeOperator,
}) => {
  const { user } = useAuthStore();
  const { data, isLoading } = useCustomerCreditAlert(customer.id, user?.company_id);

  const resolved = useMemo(() => {
    if (!data) return null;
    return resolveCustomerBalanceForCurrency({
      baseBalanceSar: data.balance,
      balancesByCurrency: data.balancesByCurrency,
      invoiceCurrency,
      exchangeRate,
      exchangeOperator,
    });
  }, [data, invoiceCurrency, exchangeRate, exchangeOperator]);

  if (isLoading) {
    return (
      <div className="flex animate-pulse items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="h-4 w-4 rounded-full bg-slate-300 dark:bg-slate-700" />
        <span>جاري جلب رصيد وسجل العميل...</span>
      </div>
    );
  }

  if (!data || !resolved) return null;

  const hasDebt = resolved.status === 'debt';
  const hasCredit = resolved.status === 'credit';
  const isSettled = resolved.status === 'settled';
  const activeCurrUpper = (invoiceCurrency || 'SAR').toUpperCase();

  return (
    <div className="rounded-xl border border-blue-200/80 bg-blue-50/50 p-2.5 shadow-xs transition-all dark:border-blue-900/40 dark:bg-blue-950/20">
      {/* Header with Customer & Currency-Accurate Balance Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 pb-2 dark:border-blue-900/50">
        <div className="flex items-center gap-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
            <UserCheck size={13} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black text-slate-900 dark:text-slate-100">
                سجل ورصيد العميل: {customer.name}
              </span>
              {customer.phone && (
                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                  ({customer.phone})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Primary Balance Badge — NEVER mislabels SAR as YER; dynamically adapts to invoiceCurrency */}
        <div className="flex flex-wrap items-center gap-1">
          {hasDebt && (
            <span className="flex items-center gap-1 rounded-md border border-rose-300 bg-rose-100/80 px-2 py-0.5 text-[10px] font-black text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-300">
              <AlertCircle size={11} className="shrink-0 text-rose-600 dark:text-rose-400" />
              <span>
                الحساب السابق:{' '}
                <span dir="ltr" className="font-mono">
                  {formatCurrency(resolved.primaryAmount, resolved.primaryCurrency)}
                </span>
                {resolved.convertedEquivalent && (
                  <span dir="ltr" className="mr-1 font-mono text-[9.5px] opacity-85">
                    (≈ {formatCurrency(resolved.convertedEquivalent.amount, resolved.convertedEquivalent.currency)})
                  </span>
                )}
              </span>
            </span>
          )}
          {hasCredit && (
            <span className="flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-100/80 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 size={11} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                رصيد دائن للعميل:{' '}
                <span dir="ltr" className="font-mono">
                  {formatCurrency(Math.abs(resolved.primaryAmount), resolved.primaryCurrency)}
                </span>
                {resolved.convertedEquivalent && (
                  <span dir="ltr" className="mr-1 font-mono text-[9.5px] opacity-85">
                    (≈ {formatCurrency(Math.abs(resolved.convertedEquivalent.amount), resolved.convertedEquivalent.currency)})
                  </span>
                )}
              </span>
            </span>
          )}
          {isSettled && (
            <span className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
              <CheckCircle2 size={11} className="text-emerald-500" />
              الحساب خالص (0.00)
            </span>
          )}
        </div>
      </div>

      {/* Details Row: Multi-currency breakdown & Last Payment */}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* Balances by currency (always formatted with each balance's OWN true currency_code) */}
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300">
          <Wallet size={12} className="shrink-0 text-indigo-500" />
          <span className="font-bold">الأرصدة بالعملات:</span>
          {resolved.normalizedBalances.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              {resolved.normalizedBalances.map((b, idx) => {
                const isActiveCurr = b.currency_code === activeCurrUpper;
                return (
                  <span
                    key={idx}
                    dir="ltr"
                    className={cn(
                      'rounded px-1.5 py-0.5 font-mono font-bold',
                      b.balance > 0
                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                        : b.balance < 0
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'text-slate-500',
                      isActiveCurr && 'ring-1 ring-blue-500/70'
                    )}
                    title={isActiveCurr ? 'مطابق لعملة الفاتورة الحالية' : `رصيد بعملة ${b.currency_code}`}
                  >
                    {formatCurrency(b.balance, b.currency_code)}
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="font-mono text-slate-400">0.00</span>
          )}
        </div>

        {/* Last payment info */}
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300">
          <ArrowDownRight size={13} className="shrink-0 text-emerald-600" />
          <span className="font-bold">آخر دفعة سددها:</span>
          {data.lastPayment ? (
            <div className="flex items-center gap-1 font-mono">
              <span className="font-black text-emerald-700 dark:text-emerald-300" dir="ltr">
                {formatCurrency(data.lastPayment.amount, data.lastPayment.currency_code)}
              </span>
              {data.lastPayment.payment_date && (
                <span className="flex items-center gap-0.5 text-slate-500 dark:text-slate-400">
                  <Clock size={10} />
                  ({data.lastPayment.payment_date})
                </span>
              )}
              {data.lastPayment.payment_number && (
                <span className="text-[10px] text-slate-400">
                  سند #{data.lastPayment.payment_number}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400">لا توجد دفعات قبض سابقة</span>
          )}
        </div>
      </div>
    </div>
  );
};
