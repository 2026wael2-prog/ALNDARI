import type { Bond } from '../../types';
import { formatCurrency } from '../../../../core/utils';
import { tafqeet } from '../../../../core/utils/tafqeet';
import type { VoucherBalanceSnapshot } from '../../utils/bondPartyBalance';

export interface BondVoucherCompanyInfo {
  name_ar: string;
  address: string;
  phone: string;
  tax_number: string;
  logo_url: string;
}

export interface BondVoucherDerived {
  isReceipt: boolean;
  isPayment: boolean;
  voucherTitle: string;
  personLabel: string;
  forWhatLabel: string;
  currencySymbol: string;
  tafqeetText: string;
  paymentMethodLabel: string;
}

export function deriveBondVoucherMeta(bond: Bond): BondVoucherDerived {
  const isReceipt = bond.type === 'receipt';
  const isPayment = bond.type === 'payment' || (bond.type as string) === 'disbursement';

  const voucherTitle = isReceipt ? 'سند قبض' : isPayment ? 'سند صرف' : 'سند تحويل مالي';
  const personLabel = isReceipt
    ? 'استلمنا من السيد / السادة:'
    : isPayment
      ? 'صرفنا إلى السيد / السادة:'
      : 'تحويل لصالح:';
  const forWhatLabel = isReceipt ? 'وذلك مقابل:' : isPayment ? 'وذلك عن:' : 'الغرض من التحويل:';

  const currencyCodeUpper = (bond.currency_code || 'SAR').toUpperCase();
  const currencySymbol =
    currencyCodeUpper === 'SAR'
      ? 'ريال سعودي'
      : currencyCodeUpper === 'YER'
        ? 'ريال يمني'
        : currencyCodeUpper === 'OMR'
          ? 'ريال عماني'
          : currencyCodeUpper === 'USD'
            ? 'دولار أمريكي'
            : bond.currency_code;

  const tafqeetText = tafqeet(bond.amount, currencySymbol);

  const paymentMethodLabel = (() => {
    switch ((bond.payment_method ?? '').toLowerCase()) {
      case 'bank':
      case 'transfer':
        return 'حوالة بنكية';
      case 'card':
      case 'network':
        return 'بطاقة / شبكة';
      case 'check':
      case 'cheque':
        return 'شيك';
      default:
        return 'نقداً';
    }
  })();

  return {
    isReceipt,
    isPayment,
    voucherTitle,
    personLabel,
    forWhatLabel,
    currencySymbol,
    tafqeetText,
    paymentMethodLabel,
  };
}

export function buildBondWhatsAppText(params: {
  bond: Bond;
  meta: BondVoucherDerived;
  waHeader: string;
  voucherBalance: VoucherBalanceSnapshot | null;
}): string {
  const { bond, meta, waHeader, voucherBalance } = params;
  const bondRecord = bond as unknown as Record<string, string | undefined>;
  return [
    waHeader ? waHeader.trim() : '',
    `📄 *${meta.voucherTitle} رقم:* ${bond.payment_number}`,
    `📅 *التاريخ:* ${bondRecord.payment_date || bond.date || ''}`,
    `👤 *${meta.personLabel.replace(/:$/, '')}:* ${bond.party_name || bondRecord.counterparty_account_name || 'عام'}`,
    `🏦 *الصندوق / الحساب:* ${bond.account_name || '—'}`,
    `💳 *طريقة الدفع:* ${meta.paymentMethodLabel}`,
    `💰 *المبلغ:* ${formatCurrency(bond.amount, bond.currency_code)}`,
    voucherBalance
      ? `📊 *الرصيد السابق:* ${formatCurrency(voucherBalance.previousDirection.absAmount, voucherBalance.currency)} (${voucherBalance.previousDirection.label})`
      : '',
    voucherBalance
      ? `📌 *الرصيد بعد السند:* ${formatCurrency(voucherBalance.afterDirection.absAmount, voucherBalance.currency)} (${voucherBalance.afterDirection.label})`
      : '',
    bond.description ? `📝 *البيان:* ${bond.description}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
