import { ArrowDown, ArrowRightLeft, ArrowUpCircle } from 'lucide-react';
import type { BondFormData, BondType } from '../../types';
import { ensureLatinDigits } from '../../../../core/utils/currencyUtils';
import {
  buildOverAllocationMessage,
  computeRequestedAllocation,
  exceedsInvoiceRemaining,
  INVOICE_AMOUNT_EPSILON,
} from '../../invoiceAllocationGuard';
import type { SelectedInvoiceSnapshot } from '../useBondForm';

export interface BondAccountItem {
  id: string;
  code: string;
  name: string;
  currency_code?: string | null;
  type?: string;
  allow_posting?: boolean;
}

export interface BondPaymentAccountItem {
  id: string;
  code?: string | null;
  name_ar?: string | null;
  currency_code?: string | null;
}

export function partitionBondAccounts(
  allAccounts: BondAccountItem[] | undefined,
  paymentAccounts: BondPaymentAccountItem[] | undefined
) {
  const accountMap = new Map((allAccounts ?? []).map(a => [a.id, a]));
  const paymentList = paymentAccounts ?? [];
  const cashAccounts =
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
      : (allAccounts ?? []).filter(acc => acc.code.startsWith('10') && acc.allow_posting);

  const paymentIds = new Set(cashAccounts.map(c => c.id));
  const otherAccounts = (allAccounts ?? []).filter(
    acc =>
      !paymentIds.has(acc.id) &&
      !acc.code.startsWith('10') &&
      !(acc.code.startsWith('MZ-') && (acc.type === 'asset' || acc.type === 'liability'))
  );

  return { cashAccounts, otherAccounts };
}

export function getBondTheme(type: BondType) {
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
}

export function validateBondSubmission(params: {
  data: BondFormData;
  type: BondType;
  selectedInvoice: SelectedInvoiceSnapshot | null;
  invoiceRemaining: number | null;
}): { ok: true; prepared: BondFormData } | { ok: false; error: string } {
  const { data, type, selectedInvoice, invoiceRemaining } = params;
  const prepared: BondFormData = { ...data };

  if (prepared.reference_number) {
    prepared.reference_number = ensureLatinDigits(prepared.reference_number);
  }

  if (
    type === 'transfer' &&
    prepared.cash_account_id &&
    prepared.counterparty_id &&
    prepared.cash_account_id === prepared.counterparty_id
  ) {
    return {
      ok: false,
      error: 'لا يمكن إجراء تحويل داخلي إلى نفس الحساب (حساب المصدر وحساب الهدف متطابقان)',
    };
  }

  const bondCurrency = (prepared.currency_code || 'SAR').toUpperCase().trim();
  const mainAmount =
    bondCurrency === 'SAR' ? prepared.amount : prepared.foreign_amount || prepared.amount;
  if (!mainAmount || mainAmount <= 0) {
    return { ok: false, error: 'يجب إدخال مبلغ صحيح أكبر من الصفر' };
  }

  if (prepared.invoice_id && selectedInvoice && bondCurrency !== selectedInvoice.currency) {
    return {
      ok: false,
      error: `عملة السند (${bondCurrency}) تختلف عن عملة الفاتورة المحددة (${selectedInvoice.currency}). غيّر عملة السند إلى ${selectedInvoice.currency} أو ألغِ ربط الفاتورة.`,
    };
  }

  if (prepared.invoice_id && invoiceRemaining !== null) {
    const requestedAllocation = computeRequestedAllocation({
      mainAmount,
      commissionAmount: prepared.commission_amount,
      currencyCode: bondCurrency,
    });
    if (exceedsInvoiceRemaining(requestedAllocation, invoiceRemaining)) {
      return {
        ok: false,
        error: buildOverAllocationMessage(
          requestedAllocation,
          invoiceRemaining,
          selectedInvoice?.currency ?? bondCurrency
        ),
      };
    }

    const isPartialNow = requestedAllocation < invoiceRemaining - INVOICE_AMOUNT_EPSILON;
    if (
      isPartialNow &&
      selectedInvoice &&
      typeof prepared.description === 'string' &&
      prepared.description.startsWith('سداد فاتورة ')
    ) {
      prepared.description = prepared.description.replace(/^سداد فاتورة /, 'دفعة جزئية من فاتورة ');
    }
  }

  if (bondCurrency !== 'SAR' && (!prepared.exchange_rate || prepared.exchange_rate <= 0)) {
    return { ok: false, error: 'يجب تحديد سعر صرف صالح أكبر من الصفر' };
  }

  if (
    prepared.commission_amount &&
    prepared.commission_amount > 0 &&
    !prepared.commission_account_id
  ) {
    return { ok: false, error: 'يجب تحديد الحساب المحاسبي لتوجيه مبلغ العمولة / الخصم' };
  }

  return { ok: true, prepared };
}
