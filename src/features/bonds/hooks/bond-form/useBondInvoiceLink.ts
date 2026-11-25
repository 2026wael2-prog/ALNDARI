import type React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { UseFormSetValue, UseFormWatch } from 'react-hook-form';
import type { BondFormData, BondType } from '../../types';
import {
  convertToBaseCurrency,
  getDefaultExchangeOperator,
} from '../../../../core/utils/currencyUtils';
import {
  evaluateInvoiceSettlement,
  INVOICE_AMOUNT_EPSILON,
  resolveInvoiceDocumentAmounts,
  type InvoiceSettlementEvaluation,
} from '../../invoiceAllocationGuard';
import type {
  InvoicePaymentPreset,
  InvoiceSelectOption,
  SelectedInvoiceSnapshot,
} from '../useBondForm';

interface UseBondInvoiceLinkParams {
  type: BondType;
  selectedCurrency: string;
  enteredAmount: number;
  setValue: UseFormSetValue<BondFormData>;
  watch: UseFormWatch<BondFormData>;
  setRateInputStr: React.Dispatch<React.SetStateAction<string>>;
  setAmountInputStr: React.Dispatch<React.SetStateAction<string>>;
  setEquivalentSarInputStr: React.Dispatch<React.SetStateAction<string>>;
  preserveNextRateRef: React.MutableRefObject<boolean>;
}

export function useBondInvoiceLink({
  type,
  selectedCurrency,
  enteredAmount,
  setValue,
  watch,
  setRateInputStr,
  setAmountInputStr,
  setEquivalentSarInputStr,
  preserveNextRateRef,
}: UseBondInvoiceLinkParams) {
  const [selectedInvoice, setSelectedInvoice] = useState<SelectedInvoiceSnapshot | null>(null);
  const invoiceRemainingRef = useRef<number | null>(null);

  const resetInvoiceLink = useCallback(() => {
    invoiceRemainingRef.current = null;
    setSelectedInvoice(null);
  }, []);

  const applyAmountForInvoice = useCallback(
    (snapshot: SelectedInvoiceSnapshot, targetDocAmount: number, isPartialLabel: boolean) => {
      const invCurrency = snapshot.currency;
      const invRate = snapshot.displayRate;
      const operator = getDefaultExchangeOperator(invCurrency);
      const cleanDocAmount =
        invCurrency === 'YER'
          ? Math.round(Math.max(0, targetDocAmount))
          : Math.round(Math.max(0, targetDocAmount) * 100) / 100;

      if (invCurrency !== 'SAR') {
        preserveNextRateRef.current = true;
        setValue('currency_code', invCurrency);
        setValue('exchange_rate', invRate);
        setRateInputStr(String(invRate));
        const baseEquiv =
          cleanDocAmount > 0
            ? convertToBaseCurrency({
                amount: cleanDocAmount,
                currencyCode: invCurrency,
                exchangeRate: invRate,
                exchangeOperator: operator,
              })
            : 0;
        setValue('foreign_amount', cleanDocAmount);
        setValue('amount', baseEquiv);
        setAmountInputStr(cleanDocAmount > 0 ? String(cleanDocAmount) : '');
        setEquivalentSarInputStr(baseEquiv > 0 ? String(baseEquiv) : '');
      } else {
        setValue('currency_code', 'SAR');
        setValue('exchange_rate', 1);
        setRateInputStr('1');
        setValue('amount', cleanDocAmount);
        setValue('foreign_amount', 0);
        setAmountInputStr(cleanDocAmount > 0 ? String(cleanDocAmount) : '');
        setEquivalentSarInputStr(cleanDocAmount > 0 ? String(cleanDocAmount) : '');
      }

      const invKind = type === 'receipt' ? 'مبيعات' : 'مشتريات';
      setValue(
        'description',
        isPartialLabel
          ? `دفعة جزئية من فاتورة ${invKind} رقم ${snapshot.invoiceNumber}`
          : `سداد فاتورة ${invKind} رقم ${snapshot.invoiceNumber}`
      );
    },
    [type, setValue, setRateInputStr, setAmountInputStr, setEquivalentSarInputStr, preserveNextRateRef]
  );

  const handleInvoiceSelect = useCallback(
    (inv: InvoiceSelectOption | null | undefined) => {
      if (!inv) {
        setValue('invoice_id', undefined);
        resetInvoiceLink();
        return;
      }

      const resolved = resolveInvoiceDocumentAmounts(inv);
      const snapshot: SelectedInvoiceSnapshot = {
        id: inv.id,
        invoiceNumber: inv.invoice_number ?? '',
        ...(inv.issue_date ? { issueDate: inv.issue_date } : {}),
        currency: resolved.currency,
        isForeign: resolved.isForeign,
        docTotal: resolved.docTotal,
        docPaid: resolved.docPaid,
        docRemaining: resolved.docRemaining,
        baseTotal: resolved.baseTotal,
        basePaid: resolved.basePaid,
        baseRemaining: resolved.baseRemaining,
        displayRate: resolved.displayRate,
      };

      setValue('invoice_id', inv.id);
      setSelectedInvoice(snapshot);
      invoiceRemainingRef.current = Number.isFinite(resolved.docRemaining)
        ? resolved.docRemaining
        : null;

      const currentCurrency = (watch('currency_code') || 'SAR').toUpperCase().trim();
      const currentEntered = Number(
        watch(currentCurrency === 'SAR' ? 'amount' : 'foreign_amount') || 0
      );
      const hasValidPreEnteredPartial =
        currentEntered > 0 &&
        currentCurrency === resolved.currency &&
        currentEntered < resolved.docRemaining - INVOICE_AMOUNT_EPSILON;

      applyAmountForInvoice(
        snapshot,
        hasValidPreEnteredPartial ? currentEntered : resolved.docRemaining,
        hasValidPreEnteredPartial
      );
    },
    [setValue, watch, applyAmountForInvoice, resetInvoiceLink]
  );

  const applyInvoicePaymentPreset = useCallback(
    (preset: InvoicePaymentPreset) => {
      if (!selectedInvoice) return;
      if (preset === 'full') {
        applyAmountForInvoice(selectedInvoice, selectedInvoice.docRemaining, false);
      } else if (preset === 'half') {
        applyAmountForInvoice(selectedInvoice, selectedInvoice.docRemaining * 0.5, true);
      } else if (preset === 'quarter') {
        applyAmountForInvoice(selectedInvoice, selectedInvoice.docRemaining * 0.25, true);
      } else {
        applyAmountForInvoice(selectedInvoice, 0, true);
      }
    },
    [selectedInvoice, applyAmountForInvoice]
  );

  const invoiceSettlementPreview = useMemo<InvoiceSettlementEvaluation | null>(() => {
    if (!selectedInvoice) return null;
    return evaluateInvoiceSettlement({
      enteredAmount,
      docTotal: selectedInvoice.docTotal,
      docPaid: selectedInvoice.docPaid,
      docRemaining: selectedInvoice.docRemaining,
      invoiceCurrency: selectedInvoice.currency,
      bondCurrency: selectedCurrency,
    });
  }, [selectedInvoice, enteredAmount, selectedCurrency]);

  return {
    selectedInvoice,
    invoiceRemainingRef,
    resetInvoiceLink,
    handleInvoiceSelect,
    applyInvoicePaymentPreset,
    invoiceSettlementPreview,
  };
}
