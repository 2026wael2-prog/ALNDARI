/* eslint-disable complexity, max-lines-per-function, max-params, @typescript-eslint/explicit-function-return-type, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowDown, ArrowRightLeft, ArrowUpCircle } from 'lucide-react';
import type { BondFormData, BondType } from '../types';
import { useAccounts, usePaymentAccounts } from '../../accounting/hooks/index';
import { useParties } from '../../parties/hooks';
import { useFeedbackStore } from '../../feedback/store';
import { formatLocalDate } from '../../../core/utils';
import {
  convertToBaseCurrency,
  ensureLatinDigits,
  getDefaultExchangeOperator,
} from '../../../core/utils/currencyUtils';
import { createIdempotencyKey } from '../../../core/utils/idempotency';
import {
  buildOverAllocationMessage,
  computeRequestedAllocation,
  evaluateInvoiceSettlement,
  exceedsInvoiceRemaining,
  INVOICE_AMOUNT_EPSILON,
  resolveInvoiceDocumentAmounts,
  type InvoiceDocumentAmountsInput,
  type InvoiceSettlementEvaluation,
} from '../invoiceAllocationGuard';
import { useBondNumericInputs } from './useBondNumericInputs';
import { useBondCurrencyConversion } from './useBondCurrencyConversion';
import { resolveBondPartyBalance } from '../utils/bondPartyBalance';

/**
 * تعبئة مسبقة لنموذج السند — تُستخدم من منظومة الديون («تحصيل الآن»).
 * يجب تمرير كائن ثابت الهوية (useMemo) وإلا أُعيدت التعبئة أثناء الكتابة.
 */
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
  const [selectedInvoice, setSelectedInvoice] = useState<SelectedInvoiceSnapshot | null>(null);

  const { data: allParties } = useParties('all', partyQuery);

  const parties = useMemo(() => {
    return allParties || [];
  }, [allParties]);

  const idempotencyKeyRef = React.useRef(createIdempotencyKey('bond'));
  // المتبقي على الفاتورة المختارة بعملة الفاتورة الأصلية (SAR أو YER) — متطابق مع وحدة mainAmount.
  const invoiceRemainingRef = React.useRef<number | null>(null);
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

  // Sub-hook 1: Strict Latin digit sanitization & input string states
  const numericInputs = useBondNumericInputs({
    selectedCurrency,
    setValue,
    watch,
  });

  const {
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
  } = numericInputs;

  // Sub-hook 2: Currency conversion, rate resolution, and tafqeet
  const currencyConversion = useBondCurrencyConversion({
    selectedCurrency,
    setValue,
    watch,
    amountInputStr,
    equivalentSarInputStr,
    setRateInputStr,
    setEquivalentSarInputStr,
    preserveNextRateRef,
  });

  const {
    currencies,
    rates,
    currencyObj,
    isDivide,
    tafqeetText,
    enteredAmount,
    handleCalculateRateFromEquivalent,
    handleCurrencyQuickSwitch,
  } = currencyConversion;

  useEffect(() => {
    if (isOpen) {
      idempotencyKeyRef.current = createIdempotencyKey('bond');
      invoiceRemainingRef.current = null;
      preserveNextRateRef.current = false;
      setSelectedInvoice(null);
      const targetAccount = defaultAccountId
        ? allAccounts?.find(a => a.id === defaultAccountId)
        : undefined;
      const initialCurrency = targetAccount?.currency_code || 'SAR';

      reset({
        type,
        date: formatLocalDate(),
        currency_code: initialCurrency,
        exchange_rate: 1,
        counterparty_type: type === 'transfer' ? 'account' : 'party',
        payment_method: 'cash',
        cash_account_id: defaultAccountId || '',
      });
      setPartyQuery('');
      setShowPartyDropdown(false);
      resetNumericInputs();
    }
  }, [isOpen, type, reset, defaultAccountId, allAccounts, resetNumericInputs]);

  // Prefill hook from debt management ("Collect Now")
  useEffect(() => {
    if (!isOpen || !prefill) return;
    const currency = prefill.currencyCode || 'SAR';
    const partyLabel = prefill.partyName ? `: ${prefill.partyName}` : '';

    setValue('counterparty_type', 'party');
    setValue('counterparty_id', prefill.partyId);
    setValue('currency_code', currency);
    setValue('description', prefill.description || `تحصيل دفعة من العميل${partyLabel}`);
    if (prefill.invoiceId) setValue('invoice_id', prefill.invoiceId);
    invoiceRemainingRef.current = null;
    setSelectedInvoice(null);

    setAmountInputStr(prefill.amount > 0 ? String(prefill.amount) : '');
    if (currency === 'SAR') {
      setValue('amount', prefill.amount);
      setValue('foreign_amount', 0);
    } else {
      setValue('foreign_amount', prefill.amount);
    }

    setPartyQuery(prefill.partyName ?? '');
    setShowPartyDropdown(false);
  }, [isOpen, prefill, setValue, setAmountInputStr]);

  const { cashAccounts, otherAccounts } = useMemo(() => {
    const accountMap = new Map((allAccounts ?? []).map(a => [a.id, a]));
    const paymentList = paymentAccounts ?? [];
    const cash =
      paymentList.length > 0
        ? paymentList.map(p => {
            const linked = accountMap.get(p.id);
            return {
              id: p.id,
              code: linked?.code || p.code || p.currency_code || '101',
              name: p.name_ar || linked?.name || 'صندوق',
              currency_code: p.currency_code || linked?.currency_code || 'SAR',
            };
          })
        : allAccounts?.filter(acc => acc.code.startsWith('10') && acc.allow_posting) || [];
    const paymentIds = new Set(cash.map(c => c.id));
    const others =
      allAccounts?.filter(
        acc =>
          !paymentIds.has(acc.id) &&
          !acc.code.startsWith('10') &&
          !(acc.code.startsWith('MZ-') && (acc.type === 'asset' || acc.type === 'liability'))
      ) || [];
    return { cashAccounts: cash, otherAccounts: others };
  }, [allAccounts, paymentAccounts]);

  // Auto-select branch cash account matching selectedCurrency if none selected or invalid
  useEffect(() => {
    const currentCashId = watch('cash_account_id');
    const isValid = Boolean(currentCashId && cashAccounts.some(a => a.id === currentCashId));
    if (cashAccounts.length > 0 && !isValid) {
      const currencyMatch = cashAccounts.find(
        a => (a.currency_code ?? 'SAR').toUpperCase() === (selectedCurrency || 'SAR').toUpperCase()
      );
      const primaryCash = currencyMatch || cashAccounts[0];
      if (primaryCash) {
        setValue('cash_account_id', primaryCash.id);
      }
    }
  }, [cashAccounts, selectedCurrency, setValue, watch]);

  const handlePartySelect = useCallback(
    (party: PartySelectOption) => {
      setValue('counterparty_id', party.id);
      setValue('invoice_id', undefined);
      invoiceRemainingRef.current = null;
      setSelectedInvoice(null);
      setPartyQuery(party.name);
      setShowPartyDropdown(false);
    },
    [setValue]
  );

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
    [type, setValue, setRateInputStr, setAmountInputStr, setEquivalentSarInputStr]
  );

  const handleInvoiceSelect = useCallback(
    (inv: InvoiceSelectOption | null | undefined) => {
      if (!inv) {
        setValue('invoice_id', undefined);
        invoiceRemainingRef.current = null;
        setSelectedInvoice(null);
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
      // خزّن المتبقي بعملة الفاتورة الأصلية (SAR أو YER) ليطابق mainAmount دائماً
      invoiceRemainingRef.current = Number.isFinite(resolved.docRemaining)
        ? resolved.docRemaining
        : null;

      // CRITICAL FIX:
      // إذا كان المستخدم قد أدخل بالفعل مبلغاً جزئياً بنفس عملة الفاتورة قبل اختيار الفاتورة
      // (مثلاً كتب 500 ر.س ثم ضغط على فاتورة بـ 1,360 ر.س)، نُبقي مبلغه الجزئي كما هو ولا نمسحه بكامل الفاتورة!
      const currentCurrency = (watch('currency_code') || 'SAR').toUpperCase().trim();
      const currentEntered = Number(
        watch(currentCurrency === 'SAR' ? 'amount' : 'foreign_amount') || 0
      );
      const hasValidPreEnteredPartial =
        currentEntered > 0 &&
        currentCurrency === resolved.currency &&
        currentEntered < resolved.docRemaining - INVOICE_AMOUNT_EPSILON;

      if (hasValidPreEnteredPartial) {
        applyAmountForInvoice(snapshot, currentEntered, true);
      } else {
        applyAmountForInvoice(snapshot, resolved.docRemaining, false);
      }
    },
    [setValue, watch, applyAmountForInvoice]
  );

  const applyInvoicePaymentPreset = useCallback(
    (preset: InvoicePaymentPreset) => {
      if (!selectedInvoice) return;
      if (preset === 'full') {
        applyAmountForInvoice(selectedInvoice, selectedInvoice.docRemaining, false);
        return;
      }
      if (preset === 'half') {
        applyAmountForInvoice(selectedInvoice, selectedInvoice.docRemaining * 0.5, true);
        return;
      }
      if (preset === 'quarter') {
        applyAmountForInvoice(selectedInvoice, selectedInvoice.docRemaining * 0.25, true);
        return;
      }
      // 'custom': clear amount so the user enters any exact partial payment immediately
      applyAmountForInvoice(selectedInvoice, 0, true);
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

  const onValidSubmit = useCallback(
    (data: BondFormData) => {
      // 1. Sanitize reference number
      if (data.reference_number) {
        data.reference_number = ensureLatinDigits(data.reference_number);
      }

      // 2. Validate transfer accounts
      if (
        type === 'transfer' &&
        data.cash_account_id &&
        data.counterparty_id &&
        data.cash_account_id === data.counterparty_id
      ) {
        showToast(
          'لا يمكن إجراء تحويل داخلي إلى نفس الحساب (حساب المصدر وحساب الهدف متطابقان)',
          'error'
        );
        return;
      }

      // 3. Validate positive amount
      const bondCurrency = (data.currency_code || 'SAR').toUpperCase().trim();
      const mainAmount =
        bondCurrency === 'SAR' ? data.amount : data.foreign_amount || data.amount;
      if (!mainAmount || mainAmount <= 0) {
        showToast('يجب إدخال مبلغ صحيح أكبر من الصفر', 'error');
        return;
      }

      // 4. التحقق من عملة الفاتورة وعدم تجاوز المتبقي (بنفس عملة الفاتورة الأصلية!)
      if (data.invoice_id && selectedInvoice) {
        if (bondCurrency !== selectedInvoice.currency) {
          showToast(
            `عملة السند (${bondCurrency}) تختلف عن عملة الفاتورة المحددة (${selectedInvoice.currency}). غيّر عملة السند إلى ${selectedInvoice.currency} أو ألغِ ربط الفاتورة.`,
            'error'
          );
          return;
        }
      }

      if (data.invoice_id && invoiceRemainingRef.current !== null) {
        const requestedAllocation = computeRequestedAllocation({
          mainAmount,
          commissionAmount: data.commission_amount,
          currencyCode: bondCurrency,
        });
        if (exceedsInvoiceRemaining(requestedAllocation, invoiceRemainingRef.current)) {
          showToast(
            buildOverAllocationMessage(
              requestedAllocation,
              invoiceRemainingRef.current,
              selectedInvoice?.currency ?? bondCurrency
            ),
            'error'
          );
          return;
        }

        // إذا كان السداد جزئياً والبيان الافتراضي لا يزال "سداد فاتورة..." نحدّثه إلى "دفعة جزئية من فاتورة..."
        const isPartialNow =
          requestedAllocation < invoiceRemainingRef.current - INVOICE_AMOUNT_EPSILON;
        if (
          isPartialNow &&
          selectedInvoice &&
          typeof data.description === 'string' &&
          data.description.startsWith('سداد فاتورة ')
        ) {
          data.description = data.description.replace(/^سداد فاتورة /, 'دفعة جزئية من فاتورة ');
        }
      }

      // 5. Validate exchange rate for foreign currency
      if (bondCurrency !== 'SAR' && (!data.exchange_rate || data.exchange_rate <= 0)) {
        showToast('يجب تحديد سعر صرف صالح أكبر من الصفر', 'error');
        return;
      }

      // 6. Validate commission account if commission amount is entered
      if (data.commission_amount && data.commission_amount > 0 && !data.commission_account_id) {
        showToast('يجب تحديد الحساب المحاسبي لتوجيه مبلغ العمولة / الخصم', 'error');
        return;
      }

      onSubmit({ ...data, idempotency_key: idempotencyKeyRef.current });
    },
    [type, showToast, onSubmit, selectedInvoice]
  );

  // Derived Account Names for Live Journal Preview
  const selectedCashAccount = useMemo(() => {
    return cashAccounts.find(a => a.id === cashAccountId);
  }, [cashAccounts, cashAccountId]);

  const selectedCounterpartyAccount = useMemo(() => {
    if (counterpartyType === 'account') {
      return (type === 'transfer' ? cashAccounts : otherAccounts).find(
        a => a.id === counterpartyId
      );
    }
    return null;
  }, [counterpartyType, counterpartyId, type, cashAccounts, otherAccounts]);

  const selectedParty = useMemo(() => {
    if (counterpartyType === 'party') {
      return parties.find(p => p.id === counterpartyId);
    }
    return null;
  }, [counterpartyType, counterpartyId, parties]);

  const currentExchangeRate = Number(watch('exchange_rate')) || 1;
  const partyBalanceSummary = useMemo(() => {
    if (counterpartyType !== 'party' || !selectedParty) return null;
    return resolveBondPartyBalance({
      party: selectedParty,
      bondType: type,
      bondCurrency: selectedCurrency,
      bondAmount: enteredAmount,
      exchangeRate: currentExchangeRate,
      exchangeOperator: isDivide ? 'divide' : 'multiply',
    });
  }, [
    counterpartyType,
    selectedParty,
    type,
    selectedCurrency,
    enteredAmount,
    currentExchangeRate,
    isDivide,
  ]);

  const selectedCommissionAccount = useMemo(() => {
    return otherAccounts.find(a => a.id === commissionAccountId);
  }, [otherAccounts, commissionAccountId]);

  const theme = useMemo(() => {
    if (type === 'receipt') {
      return {
        color: 'emerald',
        icon: ArrowDown,
        title: 'سند قبض جديد',
        description: 'تسجيل عملية قبض نقدية أو بنكية في وضع ملء الشاشة للكمبيوتر',
      };
    }
    if (type === 'transfer') {
      return {
        color: 'blue',
        icon: ArrowRightLeft,
        title: 'تحويل داخلي جديد',
        description: 'تحويل مبالغ بين الخزائن والحسابات البنكية في وضع ملء الشاشة للكمبيوتر',
      };
    }
    return {
      color: 'rose',
      icon: ArrowUpCircle,
      title: 'سند صرف جديد',
      description: 'تسجيل عملية صرف نقدية أو بنكية في وضع ملء الشاشة للكمبيوتر',
    };
  }, [type]);

  return {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    currencies,
    rates,
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
    enteredAmount,
    commissionAmount,
    currencyObj,
    isDivide,
    cashAccounts,
    otherAccounts,
    handlePartySelect,
    handleInvoiceSelect,
    applyInvoicePaymentPreset,
    handleQuickAmount,
    handleClearAmount,
    onValidSubmit,
    selectedCashAccount,
    selectedCounterpartyAccount,
    selectedParty,
    partyBalanceSummary,
    selectedCommissionAccount,
    tafqeetText,
    theme,
    amountInputStr,
    setAmountInputStr,
    rateInputStr,
    setRateInputStr,
    equivalentSarInputStr,
    setEquivalentSarInputStr,
    commissionInputStr,
    setCommissionInputStr,
    setAmountNumeric,
    setRateNumeric,
    setCommissionNumeric,
    handleAmountChange,
    handleRateChange,
    handleEquivalentSarChange,
    handleCalculateRateFromEquivalent,
    handleCurrencyQuickSwitch,
    handleCommissionChange,
  };
}
