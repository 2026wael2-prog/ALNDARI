import React from 'react';
import { cn, formatCurrency } from '../../../core/utils';
import type { BondType } from '../types';
import type { BondPartyBalanceSummary } from '../utils/bondPartyBalance';

interface PartyLike {
  name?: string | null;
}
interface AccountLike {
  name?: string | null;
}

interface BondSummaryProps {
  type: BondType;
  themeTitle: string;
  counterpartyType: string;
  enteredAmount: number;
  selectedCurrency: string;
  selectedCashAccount: AccountLike | null | undefined;
  selectedCounterpartyAccount: AccountLike | null | undefined;
  selectedParty: PartyLike | null | undefined;
  partyBalanceSummary?: BondPartyBalanceSummary | null | undefined;
  selectedInvoiceId: string | null | undefined;
}

interface SummaryRowProps {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}

const SummaryRow: React.FC<SummaryRowProps> = ({ label, value, valueClassName }) => (
  <div className="flex items-center justify-between text-slate-500">
    <span>{label}</span>
    <span className={cn('font-bold text-slate-900 dark:text-white', valueClassName)}>{value}</span>
  </div>
);

const UNSET_LABEL = 'لم يُحدد بعد';

/** Resolve the counterparty display name for the summary row. */
const resolveCounterpartyName = (
  counterpartyType: string,
  selectedParty: PartyLike | null | undefined,
  selectedCounterpartyAccount: AccountLike | null | undefined
): string => {
  const name =
    counterpartyType === 'party' ? selectedParty?.name : selectedCounterpartyAccount?.name;
  return name ?? UNSET_LABEL;
};

/** True when a specific invoice is linked for settlement. */
const hasLinkedInvoice = (invoiceId: string | null | undefined): boolean =>
  invoiceId !== undefined && invoiceId !== null && invoiceId !== '';

const NET_AMOUNT_TONE: Record<BondType, string> = {
  receipt: 'text-emerald-600',
  payment: 'text-rose-600',
  transfer: 'text-rose-600',
};

/** Executive summary card shown before the bond is committed. */
export const BondSummary: React.FC<BondSummaryProps> = ({
  type,
  themeTitle,
  counterpartyType,
  enteredAmount,
  selectedCurrency,
  selectedCashAccount,
  selectedCounterpartyAccount,
  selectedParty,
  partyBalanceSummary,
  selectedInvoiceId,
}) => {
  const prevDir = partyBalanceSummary?.previousDirection;
  const prevCurr = partyBalanceSummary?.previous.primaryCurrency ?? selectedCurrency;
  const effectiveAfterDir =
    partyBalanceSummary &&
    !partyBalanceSummary.previous.matchesInvoiceCurrency &&
    partyBalanceSummary.convertedAfterApprox
      ? partyBalanceSummary.convertedAfterApprox.direction
      : partyBalanceSummary?.afterDirection;
  const effectiveAfterAmount =
    partyBalanceSummary &&
    !partyBalanceSummary.previous.matchesInvoiceCurrency &&
    partyBalanceSummary.convertedAfterApprox
      ? partyBalanceSummary.convertedAfterApprox.amount
      : partyBalanceSummary?.afterInBondCurrency ?? 0;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/30 sm:rounded-3xl sm:p-5">
      <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
        ملخص السند قبل الاعتماد
      </h4>
      <div className="space-y-2 text-xs">
        <SummaryRow label="نوع العملية:" value={themeTitle} />
        <SummaryRow
          label="الطرف المقابل:"
          value={resolveCounterpartyName(
            counterpartyType,
            selectedParty,
            selectedCounterpartyAccount
          )}
        />
        {counterpartyType === 'party' && prevDir && (
          <SummaryRow
            label="الرصيد السابق:"
            value={
              <span className="inline-flex items-center gap-1.5">
                <span dir="ltr" className="font-mono">
                  {formatCurrency(prevDir.absAmount, prevCurr)}
                </span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-black',
                    prevDir.status === 'debit'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                      : prevDir.status === 'credit'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  )}
                >
                  {prevDir.label}
                </span>
              </span>
            }
          />
        )}
        <SummaryRow label="الصندوق / البنك:" value={selectedCashAccount?.name ?? UNSET_LABEL} />
        {hasLinkedInvoice(selectedInvoiceId) && (
          <SummaryRow
            label="الفاتورة المرتبطة:"
            value="نعم (محددة للسداد)"
            valueClassName="font-mono font-bold text-blue-600 dark:text-blue-400"
          />
        )}
        <div className="flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
          <span className="font-bold text-slate-700 dark:text-slate-300">المبلغ الصافي:</span>
          <span
            className={cn(
              'font-mono text-base font-black',
              // eslint-disable-next-line security/detect-object-injection -- type is a closed BondType union key
              NET_AMOUNT_TONE[type]
            )}
          >
            {formatCurrency(enteredAmount, selectedCurrency)}
          </span>
        </div>
        {counterpartyType === 'party' &&
          effectiveAfterDir &&
          enteredAmount > 0 &&
          (type === 'receipt' || type === 'payment') && (
            <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-2 dark:border-slate-700">
              <span className="font-bold text-slate-700 dark:text-slate-300">
                الرصيد بعد السند:
              </span>
              <span className="inline-flex items-center gap-1.5 font-bold">
                <span
                  dir="ltr"
                  className={cn(
                    'font-mono text-sm font-black',
                    effectiveAfterDir.status === 'debit'
                      ? 'text-rose-600 dark:text-rose-400'
                      : effectiveAfterDir.status === 'credit'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-700 dark:text-slate-200'
                  )}
                >
                  {formatCurrency(Math.abs(effectiveAfterAmount), selectedCurrency)}
                </span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-black',
                    effectiveAfterDir.status === 'debit'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                      : effectiveAfterDir.status === 'credit'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  )}
                >
                  {effectiveAfterDir.label}
                </span>
              </span>
            </div>
          )}
      </div>
    </div>
  );
};

export default BondSummary;
