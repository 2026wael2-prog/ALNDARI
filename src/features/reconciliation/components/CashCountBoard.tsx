import React from 'react';
import Card from '../../../ui/base/Card';
import type { CashCountsByCurrency, CurrencyCashRow } from '../services/reconciliationService';
import { CashCountBoardHeader } from './cash-count/CashCountHeader';
import { DenominationModeBody, QuickModeBody } from './cash-count/CashCountModes';

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

/**
 * لوحة جرد الدرج متعدد العملات.
 */
export const CashCountBoard: React.FC<CashCountBoardProps> = props => (
  <Card className="p-3 sm:p-4">
    <CashCountBoardHeader
      countMode={props.countMode}
      disabled={props.disabled === true}
      onCountModeChange={props.onCountModeChange}
      onReset={() => {
        props.onCountsChange({});
      }}
    />
    {props.countMode === 'quick' ? (
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
    )}
  </Card>
);
