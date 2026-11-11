import React from 'react';
import { Banknote, Calculator, Hash, RotateCcw, AlertTriangle, Coins } from 'lucide-react';
import Card from '../../../ui/base/Card';
import NumericInput from '../../../ui/base/NumericInput';
import { cn, formatCurrency } from '../../../core/utils';
import {
  currencySymbol,
  getCurrencyCounts,
  getDenominationCount,
  getDenominationsFor,
  resolveEffectiveRate,
  setDenominationCount,
  type CashCountsByCurrency,
  type CurrencyCashRow,
} from '../services/reconciliationService';

interface CashCountBoardProps {
  countsByCurrency: CashCountsByCurrency;
  onCountsChange: (next: CashCountsByCurrency) => void;
  manualTotal: number;
  onManualTotalChange: (value: number) => void;
  countMode: 'denominations' | 'quick';
  onCountModeChange: (mode: 'denominations' | 'quick') => void;
  activeCurrency: string;
  onActiveCurrencyChange: (code: string) => void;
  /** عملات المنشأة المتاحة للجرد (الأساس ضمنها دائماً) */
  currencies: string[];
  rates: Record<string, number>;
  onRateChange: (currency: string, rate: number) => void;
  baseCurrency: string;
  /** صفوف الجرد الحالية من الـ view (إجمالي كل عملة + معادلها) */
  rows: CurrencyCashRow[];
  baseTotal: number;
  missingRateCurrencies: string[];
  disabled?: boolean | undefined;
}

/** زر طريقة العدّ (إجمالي سريع / تفقيط فئات) */
const ModeButton: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ active, icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
      active
        ? 'bg-[var(--app-surface)] font-bold text-emerald-600 shadow-sm dark:text-emerald-400'
        : 'font-semibold text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
    )}
  >
    {icon}
    <span>{label}</span>
  </button>
);

interface TabsProps {
  currencies: string[];
  activeCurrency: string;
  rows: CurrencyCashRow[];
  onSelect: (code: string) => void;
  disabled: boolean;
}

/** تبويب عملة واحدة مع إجماليها كما عُدّت */
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

/** تبويبات العملات: كل عملة بإجماليها كما عُدّت فعلياً (بلا تحويل) */
const CurrencyTabs: React.FC<TabsProps> = ({
  currencies,
  activeCurrency,
  rows,
  onSelect,
  disabled,
}) => (
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

interface RateRowProps {
  currency: string;
  baseCurrency: string;
  rate: number;
  total: number;
  disabled: boolean;
  onRateChange: (currency: string, rate: number) => void;
}

/** محرّر سعر التحويل لعملة غير أساسية */
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

/** سطر سعر الصرف: معامل ظاهر وقابل للتعديل + المعادل بالأساس */
const CurrencyRateRow: React.FC<RateRowProps> = ({
  currency,
  baseCurrency,
  rate,
  total,
  disabled,
  onRateChange,
}) => (
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

interface DenominationCellProps {
  value: number;
  label: string;
  count: number;
  currency: string;
  disabled: boolean;
  onCountChange: (count: number) => void;
}

/** خانة فئة واحدة: عدّاد لمسي + إجمالي الفئة */
const DenominationCell: React.FC<DenominationCellProps> = ({
  value,
  label,
  count,
  currency,
  disabled,
  onCountChange,
}) => (
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

interface GridProps {
  currency: string;
  countsByCurrency: CashCountsByCurrency;
  disabled: boolean;
  onCountChange: (currency: string, denomination: string, count: number) => void;
}

/** شبكة فئات العملة المختارة — فئاتها الحقيقية لا فئات عملة أخرى */
const DenominationGrid: React.FC<GridProps> = ({
  currency,
  countsByCurrency,
  disabled,
  onCountChange,
}) => {
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

interface QuickInputProps {
  manualTotal: number;
  currency: string;
  disabled: boolean;
  onManualTotalChange: (value: number) => void;
}

/** إدخال سريع لإجمالي الكاش المعدود بعملة الأساس */
const QuickTotalInput: React.FC<QuickInputProps> = ({
  manualTotal,
  currency,
  disabled,
  onManualTotalChange,
}) => (
  <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
    <label
      htmlFor="reconciliation-quick-total"
      className="mb-1.5 block text-xs font-bold text-[var(--app-text)]"
    >
      إجمالي الكاش الفعلي المعدود بالدرج ({currencySymbol(currency)}):
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
);

interface TotalsBarProps {
  rows: CurrencyCashRow[];
  baseCurrency: string;
  baseTotal: number;
  missingRateCurrencies: string[];
}

/** شريط الإجمالي: كل عملة كما عُدّت + الإجمالي بالأساس */
const CashTotalsBar: React.FC<TotalsBarProps> = ({
  rows,
  baseCurrency,
  baseTotal,
  missingRateCurrencies,
}) => (
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

/**
 * لوحة جرد الدرج متعدد العملات.
 *
 * تُعيد بناء ما كان `DenominationTouchCounter`: عدّاد واحد بعملة واحدة وفئات سعودية
 * مثبّتة. الآن: تبويب لكل عملة في المنشأة، فئاتها الحقيقية، سعر تحويل ظاهر وقابل
 * للتعديل لكل عملة، وإجمالي واحد بعملة الأساس للمقارنة بالمتوقع.
 */
/** جسم اللوحة: تبديل بين الإدخال السريع وتفقيط الفئات */
const CashCountBody: React.FC<CashCountBoardProps> = props =>
  props.countMode === 'quick' ? (
    <QuickModeBody
      manualTotal={props.manualTotal}
      onManualTotalChange={props.onManualTotalChange}
      baseCurrency={props.baseCurrency}
      rows={props.rows}
      baseTotal={props.baseTotal}
      missingRateCurrencies={props.missingRateCurrencies}
      disabled={props.disabled === true}
    />
  ) : (
    <DenominationModeBody
      countsByCurrency={props.countsByCurrency}
      onCountsChange={props.onCountsChange}
      activeCurrency={props.activeCurrency}
      onActiveCurrencyChange={props.onActiveCurrencyChange}
      currencies={props.currencies}
      rates={props.rates}
      onRateChange={props.onRateChange}
      baseCurrency={props.baseCurrency}
      rows={props.rows}
      baseTotal={props.baseTotal}
      missingRateCurrencies={props.missingRateCurrencies}
      disabled={props.disabled === true}
    />
  );

export const CashCountBoard: React.FC<CashCountBoardProps> = props => (
  <Card className="p-3 sm:p-4">
    <BoardHeader
      countMode={props.countMode}
      disabled={props.disabled === true}
      onCountModeChange={props.onCountModeChange}
      onReset={() => {
        props.onCountsChange({});
      }}
    />
    <CashCountBody {...props} />
  </Card>
);

/** مبدّل طريقة العد وزر التصفير */
const CountModeSwitch: React.FC<{
  countMode: 'denominations' | 'quick';
  disabled: boolean;
  onCountModeChange: (mode: 'denominations' | 'quick') => void;
  onReset: () => void;
}> = ({ countMode, disabled, onCountModeChange, onReset }) => (
  <div className="flex items-center gap-2">
    <div
      className="flex rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-0.5 text-xs"
      role="group"
      aria-label="طريقة الجرد"
    >
      <ModeButton
        active={countMode === 'quick'}
        icon={<Hash className="h-3.5 w-3.5" />}
        label="إجمالي سريع"
        onClick={() => {
          onCountModeChange('quick');
        }}
      />
      <ModeButton
        active={countMode === 'denominations'}
        icon={<Calculator className="h-3.5 w-3.5" />}
        label="تفقيط الفئات"
        onClick={() => {
          onCountModeChange('denominations');
        }}
      />
    </div>

    {!disabled && countMode === 'denominations' && (
      <button
        type="button"
        onClick={onReset}
        title="تصفير الجرد"
        aria-label="تصفير الجرد"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-red-500"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    )}
  </div>
);

/** رأس اللوحة: العنوان ومبدّل طريقة العد وتصفير الجرد */
const BoardHeader: React.FC<{
  countMode: 'denominations' | 'quick';
  disabled: boolean;
  onCountModeChange: (mode: 'denominations' | 'quick') => void;
  onReset: () => void;
}> = ({ countMode, disabled, onCountModeChange, onReset }) => (
  <div className="mb-3 flex flex-col gap-2 border-b border-[var(--app-border)] pb-2.5 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Banknote className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-[var(--app-text)]">جرد الكاش بالدرج</h3>
        <p className="text-xs text-[var(--app-text-secondary)]">
          عُدّ كل عملة بفئاتها، والنظام يجمعها بعملة الأساس بسعر ظاهر
        </p>
      </div>
    </div>

    <div className="flex items-center gap-2">
      <CountModeSwitch
        countMode={countMode}
        disabled={disabled}
        onCountModeChange={onCountModeChange}
        onReset={onReset}
      />
    </div>
  </div>
);

interface QuickModeBodyProps {
  manualTotal: number;
  onManualTotalChange: (value: number) => void;
  baseCurrency: string;
  rows: CurrencyCashRow[];
  baseTotal: number;
  missingRateCurrencies: string[];
  disabled: boolean;
}

/** جسم وضع الإدخال السريع */
const QuickModeBody: React.FC<QuickModeBodyProps> = ({
  manualTotal,
  onManualTotalChange,
  baseCurrency,
  rows,
  baseTotal,
  missingRateCurrencies,
  disabled,
}) => (
  <div className="space-y-2.5">
    <QuickTotalInput
      manualTotal={manualTotal}
      currency={baseCurrency}
      disabled={disabled}
      onManualTotalChange={onManualTotalChange}
    />
    <CashTotalsBar
      rows={rows}
      baseCurrency={baseCurrency}
      baseTotal={baseTotal}
      missingRateCurrencies={missingRateCurrencies}
    />
  </div>
);

/** جسم وضع تفقيط الفئات: تبويبات العملات + الشبكة + السعر + الإجمالي */
const DenominationModeBody: React.FC<{
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




