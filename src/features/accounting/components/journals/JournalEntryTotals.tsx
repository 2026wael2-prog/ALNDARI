import React from 'react';
import { AlertCircle, CheckCircle2, Zap } from 'lucide-react';
import { formatCurrency, convertToBaseCurrency } from '../../../../core/utils';

interface JournalEntryTotalsProps {
  totals: { debit_amount: number; credit_amount: number };
  currencyCode: string;
  exchangeRate: number;
  isDivide: boolean;
  difference: number;
  isBalanced: boolean;
  errors: any;
  onAutoBalance?: () => void;
}

const JournalEntryTotals: React.FC<JournalEntryTotalsProps> = ({
  totals,
  currencyCode,
  exchangeRate,
  isDivide,
  difference,
  isBalanced,
  errors,
  onAutoBalance,
}) => {
  const diffMagnitude = difference < 0 ? -difference : difference;

  return (
    <div className="flex justify-end pt-2">
      <div className="bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl p-4 md:p-5 w-full md:w-88 space-y-3 shadow-sm">
        <div className="flex justify-between items-start text-xs sm:text-sm">
          <span className="font-bold text-[var(--app-text-secondary)] flex items-center gap-1">
            <span>إجمالي المدين</span>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              (من حـ)
            </span>
          </span>
          <div className="flex flex-col items-end">
            <span dir="ltr" className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
              {formatCurrency(totals.debit_amount, currencyCode || 'SAR')}
            </span>
            {currencyCode !== 'SAR' && (
              <span dir="ltr" className="font-mono text-[10px] text-[var(--app-text-secondary)]">
                {formatCurrency(
                  convertToBaseCurrency({
                    amount: totals.debit_amount,
                    currencyCode: currencyCode || 'SAR',
                    exchangeRate,
                    exchangeOperator: isDivide ? 'divide' : 'multiply',
                  }),
                  'SAR'
                )}
              </span>
            )}
          </div>
        </div>

        <div className="flex justify-between items-start text-xs sm:text-sm">
          <span className="font-bold text-[var(--app-text-secondary)] flex items-center gap-1">
            <span>إجمالي الدائن</span>
            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
              (إلى حـ)
            </span>
          </span>
          <div className="flex flex-col items-end">
            <span dir="ltr" className="font-mono font-bold text-rose-700 dark:text-rose-400">
              {formatCurrency(totals.credit_amount, currencyCode || 'SAR')}
            </span>
            {currencyCode !== 'SAR' && (
              <span dir="ltr" className="font-mono text-[10px] text-[var(--app-text-secondary)]">
                {formatCurrency(
                  convertToBaseCurrency({
                    amount: totals.credit_amount,
                    currencyCode: currencyCode || 'SAR',
                    exchangeRate,
                    exchangeOperator: isDivide ? 'divide' : 'multiply',
                  }),
                  'SAR'
                )}
              </span>
            )}
          </div>
        </div>

        <div
          className={`flex justify-between items-start text-xs sm:text-sm pt-3 border-t border-[var(--app-border)] font-bold ${
            isBalanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          <div className="flex flex-col">
            <span>فارق التوازن</span>
            {!isBalanced && diffMagnitude > 0 && (
              <span className="text-[10px] font-normal text-[var(--app-text-secondary)]">
                {difference > 0 ? 'المدين أكبر من الدائن' : 'الدائن أكبر من المدين'}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end">
            <span dir="ltr" className="font-mono text-sm">
              {formatCurrency(diffMagnitude, currencyCode || 'SAR')}
            </span>
            {currencyCode !== 'SAR' && diffMagnitude > 0 && (
              <span dir="ltr" className="font-mono text-[10px] opacity-70">
                {formatCurrency(
                  convertToBaseCurrency({
                    amount: diffMagnitude,
                    currencyCode: currencyCode || 'SAR',
                    exchangeRate,
                    exchangeOperator: isDivide ? 'divide' : 'multiply',
                  }),
                  'SAR'
                )}
              </span>
            )}
          </div>
        </div>

        {/* Action button for auto-balancing */}
        {!isBalanced && diffMagnitude > 0 && onAutoBalance && (
          <button
            type="button"
            onClick={onAutoBalance}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors border border-blue-200 dark:border-blue-800 shadow-sm"
          >
            <Zap size={14} className="text-blue-500 animate-pulse" />
            <span>موازنة الفارق تلقائياً ({formatCurrency(diffMagnitude, currencyCode || 'SAR')})</span>
          </button>
        )}

        {/* Balance Status Message */}
        {isBalanced ? (
          <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 flex items-center justify-center gap-1.5 font-bold">
            <CheckCircle2 size={16} />
            <span>القيد متوازن وجاهز للترحيل</span>
          </div>
        ) : (
          <div className="text-[11px] text-rose-600 dark:text-rose-400 text-center bg-rose-50 dark:bg-rose-900/20 p-2 rounded-lg border border-rose-100 dark:border-rose-900/30 flex items-center justify-center gap-1.5 font-medium">
            <AlertCircle size={14} className="shrink-0" />
            <span>
              {errors.lines?.message ||
                (totals.debit_amount === 0 ? 'يجب إدخال مبالغ' : 'القيد غير متوازن')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default JournalEntryTotals;
