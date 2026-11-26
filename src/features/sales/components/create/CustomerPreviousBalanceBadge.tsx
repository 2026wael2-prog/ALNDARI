import type React from 'react';
import { useMemo } from 'react';
import { CheckCircle2, Wallet } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import {
  useCustomerCreditAlert,
  type CustomerCreditAlertData,
} from '../../hooks/useCustomerCreditAlert';
import {
  resolveCustomerBalanceForCurrency,
  type ResolvedCustomerBalance,
} from '../../utils/customerBalanceDisplay';
import { cn, formatCurrency } from '@/core/utils';

interface CustomerPreviousBalanceBadgeProps {
  customerId?: string | undefined;
  invoiceCurrency: string;
  exchangeRate?: number | undefined;
  exchangeOperator?: 'multiply' | 'divide' | undefined;
}

function buildBalanceTooltip(
  data: CustomerCreditAlertData,
  resolved: ResolvedCustomerBalance,
  primaryText: string
): string {
  const statusLabel =
    resolved.status === 'debt' ? 'عليه' : resolved.status === 'credit' ? 'له' : 'خالص';
  const lastPayText =
    data.lastPayment !== null && data.lastPayment !== undefined
      ? `آخر دفعة: ${formatCurrency(data.lastPayment.amount, data.lastPayment.currency_code)} (${data.lastPayment.payment_date})`
      : 'لا توجد دفعات قبض سابقة';

  return [
    `الرصيد السابق: ${primaryText} (${statusLabel})`,
    ...resolved.otherBalances.map(
      b =>
        `رصيد ${b.currency_code}: ${formatCurrency(Math.abs(b.balance), b.currency_code)} (${b.balance > 0 ? 'عليه' : 'له'})`
    ),
    lastPayText,
  ].join(' • ');
}

const SettledBalancePill: React.FC<{ tooltip: string }> = ({ tooltip }) => (
  <span
    title={tooltip}
    className="inline-flex items-center gap-1 rounded-full border border-emerald-200/90 bg-gradient-to-l from-emerald-50 via-white to-emerald-50/70 px-2 py-0.5 text-[10px] font-black text-emerald-800 shadow-2xs dark:border-emerald-800/60 dark:from-emerald-950/60 dark:via-slate-900 dark:to-emerald-950/40 dark:text-emerald-300"
  >
    <CheckCircle2 size={11} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
    <span>السابق:</span>
    <span dir="ltr" className="font-mono">
      0.00
    </span>
    <span className="rounded bg-emerald-100/90 px-1 text-[9px] text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
      خالص
    </span>
  </span>
);

const ActiveBalancePill: React.FC<{
  isDebt: boolean;
  primaryText: string;
  secondaryText: string | null;
  tooltip: string;
}> = ({ isDebt, primaryText, secondaryText, tooltip }) => (
  <span
    title={tooltip}
    className={cn(
      'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-black shadow-2xs transition-all',
      isDebt
        ? 'border-rose-300/90 bg-gradient-to-l from-rose-50 via-white to-rose-100/70 text-rose-950 dark:border-rose-800/70 dark:from-rose-950/70 dark:via-slate-900 dark:to-rose-950/40 dark:text-rose-200'
        : 'border-emerald-300/90 bg-gradient-to-l from-emerald-50 via-white to-emerald-100/70 text-emerald-950 dark:border-emerald-800/70 dark:from-emerald-950/70 dark:via-slate-900 dark:to-emerald-950/40 dark:text-emerald-200'
    )}
  >
    <span
      className={cn(
        'h-1.5 w-1.5 shrink-0 rounded-full',
        isDebt ? 'bg-rose-600 dark:bg-rose-400' : 'bg-emerald-600 dark:bg-emerald-400'
      )}
    />
    <Wallet
      size={11}
      className={cn(
        'shrink-0',
        isDebt ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
      )}
    />
    <span className="shrink-0 text-[9.5px] opacity-80">السابق:</span>
    <span dir="ltr" className="truncate font-mono text-[10.5px] font-black tabular-nums">
      {primaryText}
    </span>
    <span
      className={cn(
        'shrink-0 rounded px-1 py-0 text-[9px] font-black text-white',
        isDebt ? 'bg-rose-600 dark:bg-rose-700' : 'bg-emerald-600 dark:bg-emerald-700'
      )}
    >
      {isDebt ? 'عليه' : 'له'}
    </span>
    {secondaryText !== null && (
      <span
        dir="ltr"
        className="hidden shrink-0 border-r border-slate-300/70 pr-1.5 font-mono text-[9.5px] font-bold opacity-85 dark:border-slate-700 xl:inline"
      >
        {secondaryText}
      </span>
    )}
  </span>
);

const LoadingBalancePill: React.FC = () => (
  <span className="inline-flex animate-pulse items-center gap-1 rounded-full border border-slate-200 bg-slate-100/80 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
    جاري جلب الرصيد...
  </span>
);

export const CustomerPreviousBalanceBadge: React.FC<CustomerPreviousBalanceBadgeProps> = ({
  customerId,
  invoiceCurrency,
  exchangeRate = 1,
  exchangeOperator,
}) => {
  const companyId = useAuthStore(s => s.user?.company_id ?? null);
  const { data, isLoading } = useCustomerCreditAlert(customerId, companyId);

  const resolved = useMemo(() => {
    if (data === null || data === undefined) return null;
    return resolveCustomerBalanceForCurrency({
      baseBalanceSar: data.balance,
      balancesByCurrency: data.balancesByCurrency,
      invoiceCurrency,
      exchangeRate,
      exchangeOperator,
    });
  }, [data, invoiceCurrency, exchangeRate, exchangeOperator]);

  if (customerId === undefined || customerId.length === 0) {
    return (
      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
        اختر عميلاً لعرض رصيده
      </span>
    );
  }
  if (isLoading) return <LoadingBalancePill />;
  if (data === null || data === undefined || resolved === null) return null;

  const primaryText = formatCurrency(Math.abs(resolved.primaryAmount), resolved.primaryCurrency);
  const tooltip = buildBalanceTooltip(data, resolved, primaryText);
  if (resolved.status === 'settled') return <SettledBalancePill tooltip={tooltip} />;

  const other = resolved.otherBalances.at(0);
  const secondaryText =
    other !== undefined ? formatCurrency(Math.abs(other.balance), other.currency_code) : null;

  return (
    <ActiveBalancePill
      isDebt={resolved.status === 'debt'}
      primaryText={primaryText}
      secondaryText={secondaryText}
      tooltip={tooltip}
    />
  );
};

export default CustomerPreviousBalanceBadge;
