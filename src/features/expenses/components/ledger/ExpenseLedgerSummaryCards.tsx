/* eslint-disable max-lines-per-function, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
import React from 'react';
import { isDebitNormalAccount } from '../../../accounting/utils/ledgerBalance';
import { formatCurrency } from '@/core/utils';
import type { LedgerMetrics } from './types';

interface ExpenseLedgerSummaryCardsProps {
  selectedAccount?:
    | {
        name: string;
        code: string;
        type?: string | undefined;
        currency_code?: string | null | undefined;
      }
    | null
    | undefined;
  ledgerMetrics: LedgerMetrics;
}

export const ExpenseLedgerSummaryCards: React.FC<ExpenseLedgerSummaryCardsProps> = ({
  selectedAccount,
  ledgerMetrics,
}) => {
  if (!selectedAccount) return null;

  const code = selectedAccount.code || '';
  const name = selectedAccount.name || '';
  const isDebitNormal = isDebitNormalAccount(selectedAccount.type);
  const isEmployeeOrCustody =
    code.startsWith('140') ||
    name.includes('راتب') ||
    name.includes('عهدة') ||
    name.includes('سلفة');
  const isRentAccount = code.startsWith('240') || name.includes('إيجار') || name.includes('ايجار');
  const isCashbox = code.startsWith('101') || code.startsWith('102') || name.includes('صندوق');

  const debitLabel = isRentAccount
    ? 'إجمالي ما عليه (سحبيات / دفعات)'
    : isEmployeeOrCustody
      ? 'إجمالي ما عليه (صرف / سلف)'
      : isCashbox
        ? 'إجمالي الوارد (إيداع)'
        : 'إجمالي ما عليه (صرف)';

  const debitBadge = isCashbox ? 'وارد (+)' : 'عليه (+)';

  const creditLabel = isRentAccount
    ? 'إجمالي ما له (استحقاق الإيجار)'
    : isEmployeeOrCustody
      ? 'إجمالي ما له (راتب / تسويات)'
      : isCashbox
        ? 'إجمالي المنصرف (دفع)'
        : 'إجمالي ما له (سداد)';

  const creditBadge = isCashbox ? 'منصرف (-)' : 'له (-)';

  const isZero = ledgerMetrics.closingBalance > -0.001 && ledgerMetrics.closingBalance < 0.001;
  const closingMagnitude =
    ledgerMetrics.closingBalance < 0 ? -ledgerMetrics.closingBalance : ledgerMetrics.closingBalance;
  const isCredit = isDebitNormal
    ? ledgerMetrics.closingBalance < 0
    : ledgerMetrics.closingBalance > 0;

  let balanceStatusText = '';
  let balanceBadgeText = '';
  let badgeColorClass = '';

  if (isZero) {
    balanceStatusText = isEmployeeOrCustody
      ? 'خالص الذمة'
      : isRentAccount
        ? 'تمت تسوية الإيجار بالكامل'
        : 'رصيد متزن';
    balanceBadgeText = 'متزن (خالص)';
    badgeColorClass = 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300';
  } else if (!isCredit) {
    // Net Debit -> عليه
    balanceStatusText = isEmployeeOrCustody
      ? 'متبقي في ذمته لم يُسدد (سحب زيادة)'
      : isRentAccount
        ? 'متبقي عليه (سحبيات تجاوزت الإيجار)'
        : isCashbox
          ? 'رصيد متوفر بالصندوق'
          : 'رصيد منصرف مستحق';
    balanceBadgeText = isCashbox ? 'رصيد الصندوق' : 'متبقي عليه';
    badgeColorClass =
      'border border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300';
  } else {
    // Net Credit -> له
    balanceStatusText = isEmployeeOrCustody
      ? 'مستحق للموظف بذمة المنشأة'
      : isRentAccount
        ? 'مستحق لصاحب الإيجار في ذمة المنشأة'
        : isCashbox
          ? 'عجز بالسحب'
          : 'رصيد دائن مستحق له';
    balanceBadgeText = isCashbox ? 'عجز' : 'مستحق له';
    badgeColorClass =
      'border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
  }

  return (
    <div className="grid grid-cols-4 gap-1 sm:gap-3">
      <div className="min-w-0 rounded-lg border border-gray-100 bg-[var(--app-surface)] p-1.5 shadow-xs dark:border-slate-800 sm:rounded-2xl sm:p-3.5">
        <p className="truncate text-[10px] font-bold text-[var(--app-text-secondary)] sm:text-[10px] sm:uppercase sm:tracking-wider">
          الحساب المحدد
        </p>
        <h4 className="truncate text-[10.5px] font-black text-[var(--app-text)] sm:text-sm">
          {selectedAccount.name}
        </h4>
        <p dir="ltr" className="truncate font-mono text-[10px] font-bold text-blue-600 sm:text-xs">
          {selectedAccount.code} • {selectedAccount.currency_code || 'SAR'}
        </p>
      </div>

      <div className="min-w-0 rounded-lg border border-rose-100 bg-rose-50/40 p-1.5 shadow-xs dark:border-rose-900/30 dark:bg-rose-950/20 sm:rounded-2xl sm:p-3.5">
        <div className="flex items-center justify-between gap-0.5">
          <p className="truncate text-[10px] font-bold text-rose-800 dark:text-rose-300 sm:text-[10px] sm:uppercase sm:tracking-wider">
            {debitLabel}
          </p>
          <span className="hidden shrink-0 rounded bg-rose-100 px-1 py-0.5 text-[10px] font-black text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 sm:inline">
            {debitBadge}
          </span>
        </div>
        <h4 dir="ltr" className="truncate text-right font-mono text-[10.5px] font-black text-rose-700 dark:text-rose-400 sm:text-base">
          {formatCurrency(ledgerMetrics.totalDebit)}
        </h4>
        <p className="hidden truncate text-[10px] font-semibold text-rose-600 dark:text-rose-400 sm:block">
          {ledgerMetrics.count} حركة مقيدة
        </p>
      </div>

      <div className="min-w-0 rounded-lg border border-emerald-100 bg-emerald-50/40 p-1.5 shadow-xs dark:border-emerald-900/30 dark:bg-emerald-950/20 sm:rounded-2xl sm:p-3.5">
        <div className="flex items-center justify-between gap-0.5">
          <p className="truncate text-[10px] font-bold text-emerald-800 dark:text-emerald-300 sm:text-[10px] sm:uppercase sm:tracking-wider">
            {creditLabel}
          </p>
          <span className="hidden shrink-0 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-black text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 sm:inline">
            {creditBadge}
          </span>
        </div>
        <h4
          dir="ltr"
          className="truncate text-right font-mono text-[10.5px] font-black text-emerald-700 dark:text-emerald-400 sm:text-base"
        >
          {formatCurrency(ledgerMetrics.totalCredit)}
        </h4>
        <p className="hidden truncate text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 sm:block">
          تسويات وسدادات
        </p>
      </div>

      <div className="min-w-0 rounded-lg border border-blue-100 bg-blue-50/40 p-1.5 shadow-xs dark:border-blue-900/30 dark:bg-blue-950/20 sm:rounded-2xl sm:p-3.5">
        <div className="flex items-center justify-between gap-0.5">
          <p className="truncate text-[10px] font-bold text-blue-800 dark:text-blue-300 sm:text-[10px] sm:uppercase sm:tracking-wider">
            الرصيد الختامي
          </p>
          <span className={`hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black sm:inline ${badgeColorClass}`}>
            {balanceBadgeText}
          </span>
        </div>
        <h4 dir="ltr" className="truncate text-right font-mono text-[10.5px] font-black text-blue-700 dark:text-blue-400 sm:text-base">
          {formatCurrency(closingMagnitude)}
        </h4>
        <p className="hidden truncate text-[10px] font-bold text-blue-600 dark:text-blue-400 sm:block">
          {balanceStatusText}
        </p>
      </div>
    </div>
  );
};
