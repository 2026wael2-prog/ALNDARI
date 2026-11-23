import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Scale, Wallet } from 'lucide-react';
import { cn, formatCurrency } from '../../../core/utils';
import type { BondType } from '../types';
import {
  getBalanceDirection,
  type BalanceDirectionStatus,
  type BondPartyBalanceSummary,
} from '../utils/bondPartyBalance';

interface PartyBalanceCardProps {
  summary: BondPartyBalanceSummary;
  bondType: BondType;
  enteredAmount: number;
  partyName?: string | null | undefined;
}

const DIRECTION_STYLES: Record<
  BalanceDirectionStatus,
  { badge: string; amount: string; border: string; bg: string }
> = {
  debit: {
    badge: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800/60',
    amount: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200/70 dark:border-rose-900/40',
    bg: 'bg-rose-50/50 dark:bg-rose-950/20',
  },
  credit: {
    badge:
      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800/60',
    amount: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200/70 dark:border-emerald-900/40',
    bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
  },
  settled: {
    badge:
      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    amount: 'text-slate-700 dark:text-slate-200',
    border: 'border-slate-200/80 dark:border-slate-700/70',
    bg: 'bg-slate-50/70 dark:bg-slate-800/40',
  },
};

const DirectionIcon: React.FC<{ status: BalanceDirectionStatus; size?: number }> = ({
  status,
  size = 12,
}) => {
  if (status === 'debit') return <ArrowUpRight size={size} />;
  if (status === 'credit') return <ArrowDownLeft size={size} />;
  return <Scale size={size} />;
};

/**
 * Compact, high-clarity card displayed inside CreateBondModal once a party is selected.
 * Shows:
 * 1) Previous Balance (الرصيد السابق) with explicit "عليه" / "له" / "متوازن" badge
 * 2) Projected Balance After Bond (الرصيد بعد السند) live-updating as the user enters the amount
 * 3) Any additional currency balances for multi-currency accounts
 */
export const PartyBalanceCard: React.FC<PartyBalanceCardProps> = ({
  summary,
  bondType,
  enteredAmount,
}) => {
  const {
    previous,
    previousDirection,
    afterInBondCurrency,
    afterDirection,
    convertedAfterApprox,
    bondCurrency,
  } = summary;

  // eslint-disable-next-line security/detect-object-injection -- closed BalanceDirectionStatus union
  const prevStyle = DIRECTION_STYLES[previousDirection.status];
  const effectiveAfterDirection =
    !previous.matchesInvoiceCurrency && convertedAfterApprox
      ? convertedAfterApprox.direction
      : afterDirection;
  const effectiveAfterAmount =
    !previous.matchesInvoiceCurrency && convertedAfterApprox
      ? convertedAfterApprox.amount
      : afterInBondCurrency;
  // eslint-disable-next-line security/detect-object-injection -- closed BalanceDirectionStatus union
  const afterStyle = DIRECTION_STYLES[effectiveAfterDirection.status];

  const hasAmount = enteredAmount > 0 && (bondType === 'receipt' || bondType === 'payment');

  return (
    <div
      data-testid="party-balance-card"
      className={cn(
        'animate-in fade-in slide-in-from-top-1 space-y-2.5 rounded-2xl border p-3.5 transition-all duration-200',
        prevStyle.border,
        prevStyle.bg
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-700 dark:text-slate-200">
          <Wallet size={14} className="text-blue-600 dark:text-blue-400" />
          <span>موقف حساب الجهة</span>
        </div>
        <span className="text-[10px] font-bold text-slate-400">
          عليه = مدين لنا • له = دائن عندنا
        </span>
      </div>

      <div className={cn('grid gap-2.5', hasAmount ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1')}>
        {/* Previous Balance */}
        <div className="rounded-xl border border-white/80 bg-white/90 p-2.5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
              الرصيد السابق
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black',
                prevStyle.badge
              )}
            >
              <DirectionIcon status={previousDirection.status} />
              {previousDirection.label}
            </span>
          </div>
          <div className={cn('mt-1 font-mono text-base font-black', prevStyle.amount)} dir="ltr">
            {formatCurrency(previousDirection.absAmount, previous.primaryCurrency)}
          </div>
          {!previous.matchesInvoiceCurrency && previous.convertedEquivalent && (
            <div className="mt-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
              يعادل تقريباً{' '}
              <span dir="ltr" className="font-mono font-black">
                {formatCurrency(
                  Math.abs(previous.convertedEquivalent.amount),
                  previous.convertedEquivalent.currency
                )}
              </span>{' '}
              ({previousDirection.label})
            </div>
          )}
        </div>

        {/* Projected Balance After Bond */}
        {hasAmount && (
          <div className="rounded-xl border border-white/80 bg-white/90 p-2.5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                {!previous.matchesInvoiceCurrency && convertedAfterApprox
                  ? 'الرصيد التقديري بعد السند'
                  : 'الرصيد بعد السند'}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black',
                  afterStyle.badge
                )}
              >
                <DirectionIcon status={effectiveAfterDirection.status} />
                {effectiveAfterDirection.label}
              </span>
            </div>
            <div
              className={cn('mt-1 font-mono text-base font-black', afterStyle.amount)}
              dir="ltr"
            >
              {formatCurrency(Math.abs(effectiveAfterAmount), bondCurrency)}
            </div>
            <div className="mt-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
              {bondType === 'receipt' ? 'بعد خصم سند القبض' : 'بعد إضافة سند الصرف'}{' '}
              <span dir="ltr" className="font-mono font-black">
                {formatCurrency(enteredAmount, bondCurrency)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Additional Currencies Breakdown */}
      {previous.otherBalances.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200/60 pt-2 dark:border-slate-700/60">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
            أرصدة بعملات أخرى:
          </span>
          {previous.otherBalances.map(entry => {
            const dir = getBalanceDirection(entry.balance);
            // eslint-disable-next-line security/detect-object-injection -- closed BalanceDirectionStatus union
            const style = DIRECTION_STYLES[dir.status];
            return (
              <span
                key={entry.currency_code}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black',
                  style.badge
                )}
              >
                <span dir="ltr" className="font-mono">
                  {formatCurrency(dir.absAmount, entry.currency_code)}
                </span>
                <span>{dir.label}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PartyBalanceCard;
