import { useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { JournalEntryFormData } from '../types/index';
import { useAccounts } from './index';
import { useCurrencies } from '../../settings/hooks';
import { SOX_BALANCE_TOLERANCE } from '../../../core/utils/decimalUtils/constants';
import { formatLocalDate } from '../../../core/utils/dateUtils';

// توحيد تسامح التوازن مع طبقة الخدمة (journalsApi) ومعيار SOX.
// الواجهة والخدمة وطبقة القاعدة تستخدم الآن نفس الحد — لا مزيد من قبول
// قيود غير متوازنة بصرياً ثم رفضها عند الحفظ (كان 0.01 سابقاً).
const BALANCE_TOLERANCE = Number(SOX_BALANCE_TOLERANCE.toString());

const journalLineSchema = z
  .object({
    account_id: z.string().min(1, 'يجب اختيار الحساب'),
    description: z.string(),
    debit_amount: z.number().min(0),
    credit_amount: z.number().min(0),
  })
  .refine(
    data =>
      (data.debit_amount > 0 && data.credit_amount === 0) ||
      (data.credit_amount > 0 && data.debit_amount === 0),
    {
      message: 'يجب إدخال إما مبلغ مدين أو دائن فقط لكل سطر',
      path: ['debit_amount'],
    }
  );

const journalEntrySchema = z
  .object({
    date: z.string().min(1, 'التاريخ مطلوب'),
    description: z.string().min(3, 'الوصف العام مطلوب (على الأقل 3 أحرف)'),
    currency_code: z.string().optional(),
    exchange_rate: z.number().optional(),
    lines: z.array(journalLineSchema).min(2, 'يجب أن يحتوي القيد على سطرين على الأقل'),
  })
  .refine(
    data => {
      const totalDebit = data.lines.reduce((sum, line) => sum + line.debit_amount, 0);
      const totalCredit = data.lines.reduce((sum, line) => sum + line.credit_amount, 0);
      const imbalance = totalDebit - totalCredit;
      return imbalance > -BALANCE_TOLERANCE && imbalance < BALANCE_TOLERANCE;
    },
    {
      message: 'القيد غير متوازن (إجمالي المدين لا يساوي إجمالي الدائن)',
      path: ['lines'],
    }
  );

export const useJournalEntryForm = (
  onSubmit: (data: JournalEntryFormData) => void,
  isOpen: boolean
) => {
  const { data: accounts, isLoading: isLoadingAccounts } = useAccounts();
  const { currencies, rates } = useCurrencies();

  const form = useForm<JournalEntryFormData>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: {
      date: formatLocalDate(),
      description: '',
      currency_code: 'SAR',
      exchange_rate: 1,
      lines: [
        { account_id: '', description: '', debit_amount: 0, credit_amount: 0 },
        { account_id: '', description: '', debit_amount: 0, credit_amount: 0 },
      ],
    },
  });

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = form;

  const selectedCurrency = watch('currency_code');
  const exchangeRate = watch('exchange_rate') || 1;

  const currencyObj = currencies.data?.find((c: any) => c.code === selectedCurrency);
  const isDivide = currencyObj?.exchange_operator === 'divide';

  useEffect(() => {
    if (selectedCurrency === 'SAR') {
      setValue('exchange_rate', 1);
    } else {
      const rate = rates.data?.find((r: any) => r.currency_code === selectedCurrency);
      if (rate) setValue('exchange_rate', rate.rate_to_base);
    }
  }, [selectedCurrency, rates.data, setValue]);

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  const lines = watch('lines');

  const totals = useMemo(
    () =>
      lines.reduce(
        (acc: any, line: any) => ({
          debit_amount: acc.debit_amount + (Number(line.debit_amount) || 0),
          credit_amount: acc.credit_amount + (Number(line.credit_amount) || 0),
        }),
        { debit_amount: 0, credit_amount: 0 }
      ),
    [lines]
  );

  const difference = totals.debit_amount - totals.credit_amount;
  // توحيد مع SOX_BALANCE_TOLERANCE (مطابق لطبقة الخدمة) بدل 0.01 السابق
  const isBalanced =
    difference > -BALANCE_TOLERANCE &&
    difference < BALANCE_TOLERANCE &&
    totals.debit_amount > 0;

  const autoBalance = () => {
    const currentLines = form.getValues('lines');
    const currentDebit = currentLines.reduce((sum, l) => sum + (Number(l.debit_amount) || 0), 0);
    const currentCredit = currentLines.reduce((sum, l) => sum + (Number(l.credit_amount) || 0), 0);
    const diff = Number((currentDebit - currentCredit).toFixed(2));
    if (diff > -BALANCE_TOLERANCE && diff < BALANCE_TOLERANCE) return;

    if (diff > 0) {
      // المدين أكبر من الدائن: يجب تعويض الفارق في جانب الدائن
      let targetIdx = currentLines.findIndex(l => !l.debit_amount && !l.credit_amount);
      if (targetIdx === -1) {
        targetIdx = currentLines.findIndex(l => Number(l.credit_amount) > 0);
      }
      if (targetIdx === -1 && currentLines.length > 1) {
        targetIdx = currentLines.length - 1;
      }
      if (targetIdx !== -1) {
        const newCredit = Number(
          (Number(currentLines[targetIdx].credit_amount || 0) + diff).toFixed(2)
        );
        setValue(`lines.${targetIdx}.credit_amount`, newCredit, { shouldValidate: true });
        setValue(`lines.${targetIdx}.debit_amount`, 0, { shouldValidate: true });
      }
    } else {
      // الدائن أكبر من المدين: يجب تعويض الفارق في جانب المدين
      // في هذا الفرع diff سالب (الدائن أكبر) — المقدار هو سالبه بلا Math.abs
      const absDiff = -diff;
      let targetIdx = currentLines.findIndex(l => !l.debit_amount && !l.credit_amount);
      if (targetIdx === -1) {
        targetIdx = currentLines.findIndex(l => Number(l.debit_amount) > 0);
      }
      if (targetIdx === -1 && currentLines.length > 0) {
        targetIdx = 0;
      }
      if (targetIdx !== -1) {
        const newDebit = Number(
          (Number(currentLines[targetIdx].debit_amount || 0) + absDiff).toFixed(2)
        );
        setValue(`lines.${targetIdx}.debit_amount`, newDebit, { shouldValidate: true });
        setValue(`lines.${targetIdx}.credit_amount`, 0, { shouldValidate: true });
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      reset();
    }
  }, [isOpen, reset]);

  const handleFormSubmit = (data: JournalEntryFormData) => {
    onSubmit(data);
  };

  return {
    form,
    register,
    handleSubmit: handleSubmit(handleFormSubmit),
    errors,
    setValue,
    fields,
    append,
    remove,
    accounts,
    isLoadingAccounts,
    currencies,
    selectedCurrency,
    exchangeRate,
    isDivide,
    totals,
    difference,
    isBalanced,
    autoBalance,
  };
};
