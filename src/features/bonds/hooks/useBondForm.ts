/* eslint-disable max-lines-per-function, max-params, @typescript-eslint/explicit-function-return-type */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import type { BondFormData, BondType } from '../types';
import { useAccounts, usePaymentAccounts } from '../../accounting/hooks/index';
import { useParties } from '../../parties/hooks';
import { useFeedbackStore } from '../../feedback/store';
import { formatLocalDate } from '../../../core/utils';
import { createIdempotencyKey } from '../../../core/utils/idempotency';
import type { InvoiceDocumentAmountsInput } from '../invoiceAllocationGuard';
import { useBondNumericInputs } from './useBondNumericInputs';
import { useBondCurrencyConversion } from './useBondCurrencyConversion';
import { resolveBondPartyBalance } from '../utils/bondPartyBalance';
import {
  getBondTheme,
  partitionBondAccounts,
  validateBondSubmission,
} from './bond-form/bondFormHelpers';
import { useBondInvoiceLink } from './bond-form/useBondInvoiceLink';

export interface BondPrefill {
  partyId: string;
  partyName?: string;
  amount: number;
  currencyCode?: string;
  invoiceId?: string;
  description?: string;
}

interface PartySelectOption {
  id: string;
  name: string;
}

export interface InvoiceSelectOption extends InvoiceDocumentAmountsInput {
  id: string;
  invoice_number?: string;
  issue_date?: string;
}

export interface SelectedInvoiceSnapshot {
  id: string;
  invoiceNumber: string;
  issueDate?: string;
  currency: string;
  isForeign: boolean;
  docTotal: number;
  docPaid: number;
  docRemaining: number;
  baseTotal: number;
  basePaid: number;
  baseRemaining: number;
  displayRate: number;
}

export type InvoicePaymentPreset = 'full' | 'half' | 'quarter' | 'custom';

export function useBondForm(
  isOpen: boolean,
  type: BondType,
  defaultAccountId: string | null | undefined,
  onSubmit: (data: BondFormData) => void,
  prefill?: BondPrefill | null
) {
  const { data: allAccounts } = useAccounts();
  const { data: paymentAccounts } = usePaymentAccounts();
  const { showToast } = useFeedbackStore();
  const [partyQuery, setPartyQuery] = useState('');
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);

  const { data: allParties } = useParties('all', partyQuery);
  const parties = useMemo(() => allParties || [], [allParties]);

  const idempotencyKeyRef = React.useRef(createIdempotencyKey('bond'));
  const preserveNextRateRef = React.useRef<boolean>(false);

  const { register, handleSubmit, reset, watch, setValue } = useForm<BondFormData>({
    defaultValues: {
      type,
      date: formatLocalDate(),
      currency_code: 'SAR',
      exchange_rate: 1,
      counterparty_type: type === 'transfer' ? 'account' : 'party',
      payment_method: 'cash',
      cash_account_id: defaultAccountId || '',
    },
  });

  const selectedCurrency = watch('currency_code');
  const counterpartyType = watch('counterparty_type');
  const counterpartyId = watch('counterparty_id');
  const selectedInvoiceId = watch('invoice_id');
  const cashAccountId = watch('cash_account_id');
  const commissionAmount = watch('commission_amount') || 0;
  const commissionAccountId = watch('commission_account_id');

  const numericInputs = useBondNumericInputs({ selectedCurrency, setValue, watch });
  const currencyConversion = useBondCurrencyConversion({
    selectedCurrency,
    setValue,
    watch,
    amountInputStr: numericInputs.amountInputStr,
    equivalentSarInputStr: numericInputs.equivalentSarInputStr,
    setRateInputStr: numericInputs.setRateInputStr,
    setEquivalentSarInputStr: numericInputs.setEquivalentSarInputStr,
    preserveNextRateRef,
  });

  const {
    selectedInvoice,
    invoiceRemainingRef,
    resetInvoiceLink,
    handleInvoiceSelect,
    applyInvoicePaymentPreset,
    invoiceSettlementPreview,
  } = useBondInvoiceLink({
    type,
    selectedCurrency,
    enteredAmount: currencyConversion.enteredAmount,
    setValue,
    watch,
    setRateInputStr: numericInputs.setRateInputStr,
    setAmountInputStr: numericInputs.setAmountInputStr,
    setEquivalentSarInputStr: numericInputs.setEquivalentSarInputStr,
    preserveNextRateRef,
  });

  useEffect(() => {
    if (!isOpen) return;
    idempotencyKeyRef.current = createIdempotencyKey('bond');
    preserveNextRateRef.current = false;
    resetInvoiceLink();
    const targetAccount = defaultAccountId
      ? allAccounts?.find(a => a.id === defaultAccountId)
      : undefined;
    reset({
      type,
      date: formatLocalDate(),
      currency_code: targetAccount?.currency_code || 'SAR',
      exchange_rate: 1,
      counterparty_type: type === 'transfer' ? 'account' : 'party',
      payment_method: 'cash',
      cash_account_id: defaultAccountId || '',
    });
    setPartyQuery('');
    setShowPartyDropdown(false);
    numericInputs.resetNumericInputs();
  }, [isOpen, type, reset, defaultAccountId, allAccounts, numericInputs.resetNumericInputs, resetInvoiceLink]);

  useEffect(() => {
    if (!isOpen || !prefill) return;
    const currency = prefill.currencyCode || 'SAR';
    const partyLabel = prefill.partyName ? `: ${prefill.partyName}` : '';
    setValue('counterparty_type', 'party');
    setValue('counterparty_id', prefill.partyId);
    setValue('currency_code', currency);
    setValue('description', prefill.description || `تحصيل دفعة من العميل${partyLabel}`);
    if (prefill.invoiceId) setValue('invoice_id', prefill.invoiceId);
    resetInvoiceLink();

    numericInputs.setAmountInputStr(prefill.amount > 0 ? String(prefill.amount) : '');
    if (currency === 'SAR') {
      setValue('amount', prefill.amount);
      setValue('foreign_amount', 0);
    } else {
      setValue('foreign_amount', prefill.amount);
    }
    setPartyQuery(prefill.partyName ?? '');
    setShowPartyDropdown(false);
  }, [isOpen, prefill, setValue, numericInputs.setAmountInputStr, resetInvoiceLink]);

  const { cashAccounts, otherAccounts } = useMemo(
    () => partitionBondAccounts(allAccounts, paymentAccounts),
    [allAccounts, paymentAccounts]
  );

  useEffect(() => {
    const currentCashId = watch('cash_account_id');
    const isValid = Boolean(currentCashId && cashAccounts.some(a => a.id === currentCashId));
    if (cashAccounts.length > 0 && !isValid) {
      const currencyMatch = cashAccounts.find(
        a => (a.currency_code ?? 'SAR').toUpperCase() === (selectedCurrency || 'SAR').toUpperCase()
      );
      const primaryCash = currencyMatch || cashAccounts[0];
      if (primaryCash) setValue('cash_account_id', primaryCash.id);
    }
  }, [cashAccounts, selectedCurrency, setValue, watch]);

  const handlePartySelect = useCallback(
    (party: PartySelectOption) => {
      setValue('counterparty_id', party.id);
      setValue('invoice_id', undefined);
      resetInvoiceLink();
      setPartyQuery(party.name);
      setShowPartyDropdown(false);
    },
    [setValue, resetInvoiceLink]
  );

  const onValidSubmit = useCallback(
    (data: BondFormData) => {
      const validation = validateBondSubmission({
        data,
        type,
        selectedInvoice,
        invoiceRemaining: invoiceRemainingRef.current,
      });
      if (!validation.ok) {
        showToast(validation.error, 'error');
        return;
      }
      onSubmit({ ...validation.prepared, idempotency_key: idempotencyKeyRef.current });
    },
    [type, showToast, onSubmit, selectedInvoice, invoiceRemainingRef]
  );

  const selectedCashAccount = useMemo(
    () => cashAccounts.find(a => a.id === cashAccountId),
    [cashAccounts, cashAccountId]
  );

  const selectedCounterpartyAccount = useMemo(
    () =>
      counterpartyType === 'account'
        ? (type === 'transfer' ? cashAccounts : otherAccounts).find(a => a.id === counterpartyId)
        : null,
    [counterpartyType, counterpartyId, type, cashAccounts, otherAccounts]
  );

  const selectedParty = useMemo(
    () => (counterpartyType === 'party' ? parties.find(p => p.id === counterpartyId) : null),
    [counterpartyType, counterpartyId, parties]
  );

  const currentExchangeRate = Number(watch('exchange_rate')) || 1;
  const partyBalanceSummary = useMemo(() => {
    if (counterpartyType !== 'party' || !selectedParty) return null;
    return resolveBondPartyBalance({
      party: selectedParty,
      bondType: type,
      bondCurrency: selectedCurrency,
      bondAmount: currencyConversion.enteredAmount,
      exchangeRate: currentExchangeRate,
      exchangeOperator: currencyConversion.isDivide ? 'divide' : 'multiply',
    });
  }, [
    counterpartyType,
    selectedParty,
    type,
    selectedCurrency,
    currencyConversion.enteredAmount,
    currentExchangeRate,
    currencyConversion.isDivide,
  ]);

  const selectedCommissionAccount = useMemo(
    () => otherAccounts.find(a => a.id === commissionAccountId),
    [otherAccounts, commissionAccountId]
  );

  const theme = useMemo(() => getBondTheme(type), [type]);

  return {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    parties,
    partyQuery,
    setPartyQuery,
    showPartyDropdown,
    setShowPartyDropdown,
    selectedCurrency,
    counterpartyType,
    counterpartyId,
    selectedInvoiceId,
    selectedInvoice,
    invoiceSettlementPreview,
    cashAccountId,
    commissionAmount,
    cashAccounts,
    otherAccounts,
    handlePartySelect,
    handleInvoiceSelect,
    applyInvoicePaymentPreset,
    onValidSubmit,
    selectedCashAccount,
    selectedCounterpartyAccount,
    selectedParty,
    partyBalanceSummary,
    selectedCommissionAccount,
    theme,
    ...currencyConversion,
    ...numericInputs,
  };
}
