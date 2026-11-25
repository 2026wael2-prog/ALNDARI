import React from 'react';
import NumericInput from '../../../../ui/base/NumericInput';
import { cn, formatCurrency } from '../../../../core/utils';
import {
  currencySymbol,
  getCurrencyCounts,
  getDenominationCount,
  getDenominationsFor,
  resolveEffectiveRate,
  setDenominationCount,
  type CashCountsByCurrency,
  type CurrencyCashRow,
} from '../../services/reconciliationService';
import { CashTotalsBar, CurrencyRateRow, CurrencyTabs } from './CashCountCurrencyControls';

const DenominationCell: React.FC<{
  value: number;
  label: string;
  count: number;
  currency: string;
  disabled: boolean;
  onCountChange: (count: number) => void;
}> = ({ value, label, count, currency, disabled, onCountChange }) => (
  <div
    className={cn(
      'rounded-lg border p-2 transition-colors',
      count > 0
        ? 'border-emerald-500/40 bg-emerald-500/5'
        : 'border-[var(--app-border)] bg-[var(--app-surface)]'
    )}
  >
    <div className="mb-1 flex items-center justify-between">
      <span className="text-xs font-bold text-[var(--app-text)]">{label}</span>
      <span className="font-mono text-[11px] font-bold text-[var(--app-text-secondary)]">
        {formatCurrency(value * count, currency)}
      </span>
    </div>
    <NumericInput
      value={count}
      min={0}
      step={1}
      disabled={disabled}
      onChange={onCountChange}
      className="w-full"
    />
  </div>
);

const DenominationGrid: React.FC<{
  currency: string;
  countsByCurrency: CashCountsByCurrency;
  disabled: boolean;
  onCountChange: (currency: string, denomination: string, count: number) => void;
}> = ({ currency, countsByCurrency, disabled, onCountChange }) => {
  const denominations = getDenominationsFor(currency);
  const counts = getCurrencyCounts(countsByCurrency, currency);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {denominations.map(denomination => {
        const key = String(denomination.value);
        return (
          <DenominationCell
            key={`${currency}-${key}`}
            value={denomination.value}
            label={denomination.label}
            count={getDenominationCount(counts, key)}
            currency={currency}
            disabled={disabled}
            onCountChange={count => {
              onCountChange(currency, key, count);
            }}
          />
        );
      })}
    </div>
  );
};

export const QuickModeBody: React.FC<{
  manualTotal: number;
  onManualTotalChange: (value: number) => void;
  baseCurrency: string;
  rows: CurrencyCashRow[];
  baseTotal: number;
  missingRateCurrencies: string[];
  disabled: boolean;
}> = ({
  manualTotal,
  onManualTotalChange,
  baseCurrency,
  rows,
  baseTotal,
  missingRateCurrencies,
  disabled,
}) => (
  <div className="space-y-2.5">
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
      <label
        htmlFor="reconciliation-quick-total"
        className="mb-1.5 block text-xs font-bold text-[var(--app-text)]"
      >
        إجمالي الكاش الفعلي المعدود بالدرج ({currencySymbol(baseCurrency)}):
      </label>
      <NumericInput
        value={manualTotal}
        min={0}
        step={1}
        disabled={disabled}
        onChange={onManualTotalChange}
        className="max-w-xs"
      />
      <p className="mt-1.5 text-[11px] text-[var(--app-text-secondary)]">
        أدخل الإجمالي مباشرة إذا عددت الكاش بآلة أو استلمته جاهزاً. للجرد بعملات متعددة استخدم
        «تفقيط الفئات».
      </p>
    </div>
    <CashTotalsBar
      rows={rows}
      baseCurrency={baseCurrency}
      baseTotal={baseTotal}
      missingRateCurrencies={missingRateCurrencies}
    />
  </div>
);

export const DenominationModeBody: React.FC<{
  countsByCurrency: CashCountsByCurrency;
  onCountsChange: (next: CashCountsByCurrency) => void;
  activeCurrency: string;
  onActiveCurrencyChange: (code: string) => void;
  currencies: string[];
  rates: Record<string, number>;
  onRateChange: (currency: string, rate: number) => void;
  baseCurrency: string;
  rows: CurrencyCashRow[];
  baseTotal: number;
  missingRateCurrencies: string[];
  disabled: boolean;
}> = ({
  countsByCurrency,
  onCountsChange,
  activeCurrency,
  onActiveCurrencyChange,
  currencies,
  rates,
  onRateChange,
  baseCurrency,
  rows,
  baseTotal,
  missingRateCurrencies,
  disabled,
}) => {
  const activeTotal = rows.find(row => row.currency === activeCurrency)?.total ?? 0;

  return (
    <div className="space-y-2.5">
      <CurrencyTabs
        currencies={currencies}
        activeCurrency={activeCurrency}
        rows={rows}
        disabled={disabled}
        onSelect={onActiveCurrencyChange}
      />
      <DenominationGrid
        currency={activeCurrency}
        countsByCurrency={countsByCurrency}
        disabled={disabled}
        onCountChange={(currency, denomination, count) => {
          onCountsChange(setDenominationCount(countsByCurrency, currency, denomination, count));
        }}
      />
      <CurrencyRateRow
        currency={activeCurrency}
        baseCurrency={baseCurrency}
        rate={resolveEffectiveRate(rates, activeCurrency, baseCurrency)}
        total={activeTotal}
        disabled={disabled}
        onRateChange={onRateChange}
      />
      <CashTotalsBar
        rows={rows}
        baseCurrency={baseCurrency}
        baseTotal={baseTotal}
        missingRateCurrencies={missingRateCurrencies}
      />
    </div>
  );
};
