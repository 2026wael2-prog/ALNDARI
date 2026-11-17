import React, { useMemo } from 'react';
import { useLedger, useAccounts } from '../../hooks';
import { formatCurrency } from '../../../../core/utils';
import { getDefaultExchangeOperator } from '../../../../core/utils/currencyUtils';
import { getLedgerBalanceLabel } from '../../utils/ledgerBalance';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import StatCard from '../../../../ui/common/StatCard';

interface Props {
  accountId: string;
  dateRange: { from: string; to: string };
}

const TreasurySummaryStats: React.FC<Props> = ({ accountId, dateRange }) => {
  const { data: accounts } = useAccounts();
  const { data: ledger, isLoading } = useLedger(accountId, dateRange.from, dateRange.to);

  const account = useMemo(() => accounts?.find(a => a.id === accountId), [accounts, accountId]);
  const currencyCode =
    account?.currency_code ||
    (ledger && ledger.length > 0 ? ledger[ledger.length - 1].currency_code : undefined);

  const isForeign = Boolean(currencyCode && currencyCode !== 'SAR');

  const accountAggregate = useMemo(() => {
    if (!accounts || !accountId) {
      return { balance: 0, foreignBalance: 0, totalDebit: 0, totalCredit: 0 };
    }
    const byId = new Map(accounts.map(a => [a.id, a]));
    const target = byId.get(accountId);
    if (!target) {
      return { balance: 0, foreignBalance: 0, totalDebit: 0, totalCredit: 0 };
    }

    const childrenMap = new Map<string, typeof accounts>();
    for (const acc of accounts) {
      if (acc.parent_id) {
        const list = childrenMap.get(acc.parent_id) || [];
        list.push(acc);
        childrenMap.set(acc.parent_id, list);
      }
    }

    const collectSubtree = (id: string): typeof accounts => {
      const node = byId.get(id);
      const children = childrenMap.get(id) || [];
      if (children.length === 0) return node ? [node] : [];
      return [...(node ? [node] : []), ...children.flatMap(c => collectSubtree(c.id))];
    };

    const subtree = collectSubtree(accountId);
    let balance = 0;
    let foreignBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    for (const node of subtree) {
      balance += Number(node.balance) || 0;
      foreignBalance += Number(node.foreign_balance ?? node.balance) || 0;
      totalDebit += Number(node.total_debit) || 0;
      totalCredit += Number(node.total_credit) || 0;
    }
    return { balance, foreignBalance, totalDebit, totalCredit };
  }, [accounts, accountId]);

  const stats = useMemo(() => {
    if (!ledger || ledger.length === 0) {
      return {
        balance: accountAggregate.balance,
        foreignBalance: accountAggregate.foreignBalance,
        totalDebit: Math.max(0, accountAggregate.totalDebit),
        totalCredit: Math.max(0, accountAggregate.totalCredit),
        foreignTotalDebit: isForeign ? 0 : Math.max(0, accountAggregate.totalDebit),
        foreignTotalCredit: isForeign ? 0 : Math.max(0, accountAggregate.totalCredit),
        isCumulativeFallback:
          accountAggregate.totalDebit > 0 || accountAggregate.totalCredit > 0,
      };
    }

    let totalDebit = 0;
    let totalCredit = 0;
    let foreignTotalDebit = 0;
    let foreignTotalCredit = 0;
    let hasPeriodMovements = false;

    for (const item of ledger) {
      // Ignore virtual opening balance line in inflow/outflow gross sums
      if (item.entry_number === 0) continue;
      hasPeriodMovements = true;

      const desc = item.description || '';
      const ref = item.reference_type || '';

      const isOutflowReversal =
        ref === 'expense_void' ||
        ref === 'payment_bond_void' ||
        ref === 'payment_void' ||
        desc.startsWith('عكس مصروف') ||
        desc.startsWith('عكس: صرف') ||
        desc.includes('عكس سند صرف') ||
        desc.includes('عكس سند: صرف');

      const isInflowReversal =
        ref === 'receipt_bond_void' ||
        ref === 'receipt_void' ||
        ref === 'sales_return' ||
        desc.startsWith('عكس سند قبض') ||
        desc.startsWith('عكس: قبض') ||
        desc.includes('عكس سند: قبض') ||
        desc.includes('عكس مبيعات');

      const itemDebit = item.debit_amount || 0;
      const itemCredit = item.credit_amount || 0;
      const itemRate = Number(item.exchange_rate ?? 0);
      const isDivideCurrency = getDefaultExchangeOperator(currencyCode || 'SAR') === 'divide';
      const toForeignFallback = (baseAmt: number) => {
        if (!itemRate || itemRate <= 0) return baseAmt;
        if (isDivideCurrency) return itemRate < 1 ? baseAmt / itemRate : baseAmt * itemRate;
        return baseAmt / itemRate;
      };
      const foreignLineDebit = isForeign
        ? item.foreign_amount && itemDebit > 0
          ? item.foreign_amount
          : toForeignFallback(itemDebit)
        : itemDebit;
      const foreignLineCredit = isForeign
        ? item.foreign_amount && itemCredit > 0
          ? item.foreign_amount
          : toForeignFallback(itemCredit)
        : itemCredit;

      if (isOutflowReversal) {
        // Red Storno: Inverting an outflow (credit) puts amount in debit.
        // Under Storno netting, it reduces gross outflows rather than inflating receipts.
        totalCredit -= itemDebit;
        foreignTotalCredit -= foreignLineDebit;
      } else if (isInflowReversal) {
        // Red Storno: Inverting an inflow (debit) puts amount in credit.
        // Under Storno netting, it reduces gross inflows rather than inflating payments.
        totalDebit -= itemCredit;
        foreignTotalDebit -= foreignLineCredit;
      } else {
        totalDebit += itemDebit;
        totalCredit += itemCredit;
        foreignTotalDebit += foreignLineDebit;
        foreignTotalCredit += foreignLineCredit;
      }
    }

    const lastEntry = ledger[ledger.length - 1];
    const useAggregateBalance =
      !lastEntry ||
      (!hasPeriodMovements &&
        Math.abs(lastEntry.balance) <= 0.001 &&
        Math.abs(accountAggregate.balance) > 0.001);
    const currentBalance = useAggregateBalance ? accountAggregate.balance : lastEntry.balance;
    const currentForeignBalance = useAggregateBalance
      ? accountAggregate.foreignBalance
      : (lastEntry.foreign_balance ?? lastEntry.balance);

    const useAggregateTotals =
      !hasPeriodMovements &&
      totalDebit === 0 &&
      totalCredit === 0 &&
      (accountAggregate.totalDebit > 0 || accountAggregate.totalCredit > 0);

    return {
      balance: currentBalance,
      foreignBalance: currentForeignBalance,
      totalDebit: Math.max(0, useAggregateTotals ? accountAggregate.totalDebit : totalDebit),
      totalCredit: Math.max(0, useAggregateTotals ? accountAggregate.totalCredit : totalCredit),
      foreignTotalDebit: Math.max(
        0,
        useAggregateTotals ? (isForeign ? 0 : accountAggregate.totalDebit) : foreignTotalDebit
      ),
      foreignTotalCredit: Math.max(
        0,
        useAggregateTotals ? (isForeign ? 0 : accountAggregate.totalCredit) : foreignTotalCredit
      ),
      isCumulativeFallback: useAggregateTotals,
    };
  }, [ledger, isForeign, currencyCode, accountAggregate]);

  if (isLoading) {
    return (
      <div className="mb-6 grid grid-cols-1 gap-4 max-md:mb-3 max-md:gap-3 md:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="h-24 animate-pulse border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm"
          />
        ))}
      </div>
    );
  }

  // Determine sign by account nature (ledger RPC returns sign-normalised balances)
  const lastLedgerRow = ledger && ledger.length > 0 ? ledger[ledger.length - 1] : undefined;
  const { isCredit: isCreditBalance } = getLedgerBalanceLabel(
    stats.balance,
    lastLedgerRow?.accountType ?? account?.type
  );

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 max-md:mb-3 max-md:gap-3 md:grid-cols-3">
      <StatCard
        title="الرصيد الحالي"
        value={
          isForeign
            ? formatCurrency(stats.foreignBalance >= 0 ? stats.foreignBalance : -stats.foreignBalance, currencyCode)
            : formatCurrency(stats.balance >= 0 ? stats.balance : -stats.balance, 'SAR')
        }
        subtext={
          isForeign
            ? `${isCreditBalance ? 'رصيد دائن (مكشوف)' : 'رصيد مدين (متوفر)'} • يعادل ${formatCurrency(stats.balance >= 0 ? stats.balance : -stats.balance, 'SAR')}`
            : isCreditBalance
              ? 'رصيد دائن (مكشوف)'
              : 'رصيد مدين (متوفر)'
        }
        icon={Wallet}
        colorClass="text-blue-600"
        iconBgClass="bg-blue-100 dark:bg-blue-900/30"
      />
      <StatCard
        title="إجمالي المقبوضات"
        value={
          isForeign
            ? formatCurrency(stats.foreignTotalDebit, currencyCode)
            : formatCurrency(stats.totalDebit, 'SAR')
        }
        subtext={
          isForeign
            ? `${stats.isCumulativeFallback ? 'إجمالي تراكمي • ' : 'حركات الإيداع والقبض • '}يعادل ${formatCurrency(stats.totalDebit, 'SAR')}`
            : stats.isCumulativeFallback
              ? 'حركات الإيداع والقبض (إجمالي تراكمي)'
              : 'حركات الإيداع والقبض'
        }
        icon={TrendingUp}
        colorClass="text-emerald-600"
        iconBgClass="bg-emerald-100 dark:bg-emerald-900/30"
      />
      <StatCard
        title="إجمالي المدفوعات"
        value={
          isForeign
            ? formatCurrency(stats.foreignTotalCredit, currencyCode)
            : formatCurrency(stats.totalCredit, 'SAR')
        }
        subtext={
          isForeign
            ? `${stats.isCumulativeFallback ? 'إجمالي تراكمي • ' : 'حركات الصرف والتحويل • '}يعادل ${formatCurrency(stats.totalCredit, 'SAR')}`
            : stats.isCumulativeFallback
              ? 'حركات الصرف والتحويل (إجمالي تراكمي)'
              : 'حركات الصرف والتحويل'
        }
        icon={TrendingDown}
        colorClass="text-red-600"
        iconBgClass="bg-red-100 dark:bg-red-900/30"
      />
    </div>
  );
};

export default TreasurySummaryStats;
