import React from 'react';
import { AlertTriangle, Coins } from 'lucide-react';
import NumericInput from '../../../../ui/base/NumericInput';
import { cn, formatCurrency } from '../../../../core/utils';
import { currencySymbol, type CurrencyCashRow } from '../../services/reconciliationService';

const CurrencyTab: React.FC<{
  code: string;
  total: number;
  isActive: boolean;
  disabled: boolean;
  onSelect: (code: string) => void;
}> = ({ code, total, isActive, disabled, onSelect }) => (
  <button
    type="button"
    role="tab"
    aria-selected={isActive}
    disabled={disabled}
    onClick={() => {
      onSelect(code);
    }}
    className={cn(
      'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors',
      isActive
        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]',
      disabled && 'cursor-not-allowed opacity-60'
    )}
  >
    <span>{code}</span>
    {total > 0 && (
      <span className="rounded bg-emerald-500/15 px-1 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
        {formatCurrency(total, code)}
      </span>
    )}
  </button>
);

export const CurrencyTabs: React.FC<{
  currencies: string[];
  activeCurrency: string;
  rows: CurrencyCashRow[];
  onSelect: (code: string) => void;
  disabled: boolean;
}> = ({ currencies, activeCurrency, rows, onSelect, disabled }) => (
  <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="عملات الدرج">
    {currencies.map(code => (
      <CurrencyTab
        key={code}
        code={code}
        total={rows.find(row => row.currency === code)?.total ?? 0}
        isActive={code === activeCurrency}
        disabled={disabled}
        onSelect={onSelect}
      />
    ))}
  </div>
);

const RateEditor: React.FC<{
  currency: string;
  baseCurrency: string;
  rate: number;
  disabled: boolean;
  onRateChange: (currency: string, rate: number) => void;
}> = ({ currency, baseCurrency, rate, disabled, onRateChange }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-[11px] text-[var(--app-text-secondary)]">سعر التحويل:</span>
    <NumericInput
      value={rate}
      min={0}
      step={1}
      showSteppers={false}
      disabled={disabled}
      className="w-24"
      onChange={value => {
        onRateChange(currency, value);
      }}
    />
    <span className="text-[11px] text-[var(--app-text-secondary)]">
      {currencySymbol(baseCurrency)}
    </span>
  </div>
);

export const CurrencyRateRow: React.FC<{
  currency: string;
  baseCurrency: string;
  rate: number;
  total: number;
  disabled: boolean;
  onRateChange: (currency: string, rate: number) => void;
}> = ({ currency, baseCurrency, rate, total, disabled, onRateChange }) => (
  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-2">
    <span className="text-xs font-bold text-[var(--app-text)]">{currency}</span>
    <span className="text-[11px] text-[var(--app-text-secondary)]">
      إجمالي الفئات:{' '}
      <strong className="text-[var(--app-text)]">{formatCurrency(total, currency)}</strong>
    </span>

    {currency === baseCurrency ? (
      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
        عملة الأساس
      </span>
    ) : (
      <RateEditor
        currency={currency}
        baseCurrency={baseCurrency}
        rate={rate}
        disabled={disabled}
        onRateChange={onRateChange}
      />
    )}
  </div>
);

export const CashTotalsBar: React.FC<{
  rows: CurrencyCashRow[];
  baseCurrency: string;
  baseTotal: number;
  missingRateCurrencies: string[];
}> = ({ rows, baseCurrency, baseTotal, missingRateCurrencies }) => (
  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 dark:bg-emerald-950/20">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
        <Coins className="h-4 w-4" />
        إجمالي الدرج بعملة الأساس:
      </span>
      <span className="font-mono text-base font-black text-emerald-600 dark:text-emerald-400">
        {formatCurrency(baseTotal, baseCurrency)}
      </span>
    </div>

    {rows.length > 0 && (
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--app-text-secondary)]">
        {rows.map(row => (
          <span key={row.currency}>
            {formatCurrency(row.total, row.currency)}
            {row.currency !== baseCurrency && (
              <span className="mx-1 text-[var(--app-text-secondary)]">
                ≈ {formatCurrency(row.baseTotal, baseCurrency)}
              </span>
            )}
          </span>
        ))}
      </div>
    )}

    {missingRateCurrencies.length > 0 && (
      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        لا يوجد سعر صرف لـ {missingRateCurrencies.join('، ')} — لن يُحتسب معادلها قبل ضبط السعر.
      </p>
    )}
  </div>
);
