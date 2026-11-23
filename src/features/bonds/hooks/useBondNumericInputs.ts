/* eslint-disable max-lines-per-function, @typescript-eslint/explicit-function-return-type */
import type React from 'react';
import { useState, useCallback } from 'react';
import type { UseFormSetValue, UseFormWatch } from 'react-hook-form';
import type { BondFormData } from '../types';
import {
  evaluateMathExpression,
  sanitizeMathInput,
} from '../../../core/utils/mathExpression';

interface UseBondNumericInputsProps {
  selectedCurrency: string;
  setValue: UseFormSetValue<BondFormData>;
  watch: UseFormWatch<BondFormData>;
}

export function useBondNumericInputs({
  selectedCurrency,
  setValue,
  watch,
}: UseBondNumericInputsProps) {
  // Controlled String States for strict English digits sanitization (No Arabic numerals)
  const [amountInputStr, setAmountInputStr] = useState<string>('');
  const [rateInputStr, setRateInputStr] = useState<string>('1');
  const [equivalentSarInputStr, setEquivalentSarInputStr] = useState<string>('');
  const [commissionInputStr, setCommissionInputStr] = useState<string>('');

  const resetNumericInputs = useCallback(() => {
    setAmountInputStr('');
    setRateInputStr('1');
    setEquivalentSarInputStr('');
    setCommissionInputStr('');
  }, []);

  const setAmountNumeric = useCallback(
    (numVal: number) => {
      const cleanNum = Number.isFinite(numVal) && numVal >= 0 ? numVal : 0;
      if (selectedCurrency === 'SAR') {
        setValue('amount', cleanNum);
      } else {
        setValue('foreign_amount', cleanNum);
      }
    },
    [selectedCurrency, setValue]
  );

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const sanitized = sanitizeMathInput(e.target.value);
      setAmountInputStr(sanitized);
      if (sanitized.trim() === '') {
        setAmountNumeric(0);
        return;
      }
      const evaluated = evaluateMathExpression(sanitized, { allowNegative: false, maxDecimals: 4 });
      if (evaluated !== null) {
        setAmountNumeric(evaluated);
      }
    },
    [setAmountNumeric]
  );

  const setRateNumeric = useCallback(
    (numVal: number) => {
      const cleanNum = Number.isFinite(numVal) && numVal > 0 ? numVal : 1;
      setValue('exchange_rate', cleanNum);
    },
    [setValue]
  );

  const handleRateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const sanitized = sanitizeMathInput(e.target.value);
      setRateInputStr(sanitized);
      if (sanitized.trim() === '') {
        setRateNumeric(1);
        return;
      }
      const evaluated = evaluateMathExpression(sanitized, { allowNegative: false, maxDecimals: 6 });
      if (evaluated !== null && evaluated > 0) {
        setRateNumeric(evaluated);
      }
    },
    [setRateNumeric]
  );

  const handleEquivalentSarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeMathInput(e.target.value);
    setEquivalentSarInputStr(sanitized);
  }, []);

  const handleQuickAmount = useCallback(
    (delta: number) => {
      const watchVal = watch(selectedCurrency === 'SAR' ? 'amount' : 'foreign_amount');
      const current = typeof watchVal === 'number' ? watchVal : 0;
      const updated = Math.max(0, current + delta);
      if (selectedCurrency === 'SAR') {
        setValue('amount', updated);
      } else {
        setValue('foreign_amount', updated);
      }
      setAmountInputStr(String(updated));
    },
    [selectedCurrency, setValue, watch]
  );

  const handleClearAmount = useCallback(() => {
    if (selectedCurrency === 'SAR') {
      setValue('amount', 0);
    } else {
      setValue('foreign_amount', 0);
    }
    setAmountInputStr('');
    setEquivalentSarInputStr('');
  }, [selectedCurrency, setValue]);

  const setCommissionNumeric = useCallback(
    (numVal: number) => {
      setValue('commission_amount', Number.isFinite(numVal) && numVal >= 0 ? numVal : 0);
    },
    [setValue]
  );

  const handleCommissionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const sanitized = sanitizeMathInput(e.target.value);
      setCommissionInputStr(sanitized);
      if (sanitized.trim() === '') {
        setCommissionNumeric(0);
        return;
      }
      const evaluated = evaluateMathExpression(sanitized, { allowNegative: false, maxDecimals: 4 });
      if (evaluated !== null) {
        setCommissionNumeric(evaluated);
      }
    },
    [setCommissionNumeric]
  );

  return {
    amountInputStr,
    setAmountInputStr,
    rateInputStr,
    setRateInputStr,
    equivalentSarInputStr,
    setEquivalentSarInputStr,
    commissionInputStr,
    setCommissionInputStr,
    resetNumericInputs,
    setAmountNumeric,
    setRateNumeric,
    setCommissionNumeric,
    handleAmountChange,
    handleRateChange,
    handleEquivalentSarChange,
    handleQuickAmount,
    handleClearAmount,
    handleCommissionChange,
  };
}
