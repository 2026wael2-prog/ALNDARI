import React from 'react';
import type { Bond } from '../../types';
import { formatCurrency } from '../../../../core/utils';
import { AlNadaryPrintShell } from '@/ui/print/AlNadaryPrintShell';
import type { VoucherBalanceSnapshot } from '../../utils/bondPartyBalance';
import type { BondVoucherCompanyInfo, BondVoucherDerived } from './bondVoucherHelpers';

interface BondVoucherSheetProps {
  bond: Bond;
  company: BondVoucherCompanyInfo;
  meta: BondVoucherDerived;
  voucherBalance: VoucherBalanceSnapshot | null;
}

const directionColor = (status: 'debit' | 'credit' | 'settled'): string =>
  status === 'debit' ? '#be123c' : status === 'credit' ? '#047857' : '#334155';

export const BondVoucherSheet: React.FC<BondVoucherSheetProps> = ({
  bond,
  company,
  meta,
  voucherBalance,
}) => (
  <AlNadaryPrintShell
    documentTitle={meta.voucherTitle}
    documentDate={bond.date}
    documentNumber={bond.payment_number}
    documentNumberLabel="رقم السند"
    company={{
      nameAr: company.name_ar,
      logoUrl: company.logo_url,
      address: company.address,
      phone: company.phone,
    }}
    rightMeta={[
      {
        label: meta.personLabel.replace(/:$/, ''),
        value: bond.party_name || bond.account_name || '—',
      },
    ]}
    leftMeta={[
      { label: 'طريقة الدفع', value: meta.paymentMethodLabel },
      { label: 'العملة', value: meta.currencySymbol },
    ]}
    showDefaultTerms={false}
    signatures={['توقيع المستلم / المودع', 'أمين الصندوق', 'المحاسب / الاعتماد']}
  >
    <table className="alnadary-table" style={{ marginBottom: '12px' }}>
      <thead>
        <tr>
          <th style={{ width: '28%' }}>البيان</th>
          <th style={{ width: '72%' }}>التفاصيل</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
            {meta.personLabel.replace(/:$/, '')}
          </td>
          <td className="alnadary-td-right" style={{ fontWeight: 900, fontSize: '13px' }}>
            {bond.party_name || bond.account_name}
          </td>
        </tr>
        <tr>
          <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
            المبلغ بالأرقام
          </td>
          <td className="alnadary-td-right" style={{ fontWeight: 900, fontSize: '14px' }}>
            <span dir="ltr">{formatCurrency(bond.amount, bond.currency_code)}</span>
            {bond.currency_code !== 'SAR' && bond.base_amount !== undefined && (
              <span style={{ fontSize: '11px', marginInlineStart: '10px', fontWeight: 700 }}>
                (يعادل {formatCurrency(bond.base_amount, 'SAR')})
              </span>
            )}
          </td>
        </tr>
        <tr>
          <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
            مبلغ وقدره كتابةً
          </td>
          <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
            {meta.tafqeetText}
          </td>
        </tr>
        <tr>
          <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
            الصندوق / الحساب المالي
          </td>
          <td className="alnadary-td-right">{bond.account_name || '—'}</td>
        </tr>
        <tr>
          <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
            {meta.forWhatLabel.replace(/:$/, '')}
          </td>
          <td className="alnadary-td-right">{bond.description || 'سداد حساب مالي'}</td>
        </tr>
      </tbody>
    </table>

    {voucherBalance && (
      <table className="alnadary-table" style={{ marginBottom: '12px' }}>
        <thead>
          <tr>
            <th style={{ width: '34%' }}>الرصيد السابق (قبل السند)</th>
            <th style={{ width: '32%' }}>مبلغ السند الحالي</th>
            <th style={{ width: '34%' }}>الرصيد بعد السند</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td
              style={{
                textAlign: 'center',
                fontWeight: 900,
                fontSize: '13px',
                color: directionColor(voucherBalance.previousDirection.status),
              }}
            >
              <span dir="ltr">
                {formatCurrency(voucherBalance.previousDirection.absAmount, voucherBalance.currency)}
              </span>{' '}
              <span>({voucherBalance.previousDirection.label})</span>
            </td>
            <td style={{ textAlign: 'center', fontWeight: 900, fontSize: '13px' }}>
              <span dir="ltr">{formatCurrency(bond.amount, bond.currency_code)}</span>
            </td>
            <td
              style={{
                textAlign: 'center',
                fontWeight: 900,
                fontSize: '13px',
                color: directionColor(voucherBalance.afterDirection.status),
              }}
            >
              <span dir="ltr">
                {formatCurrency(voucherBalance.afterDirection.absAmount, voucherBalance.currency)}
              </span>{' '}
              <span>({voucherBalance.afterDirection.label})</span>
            </td>
          </tr>
        </tbody>
      </table>
    )}

    <div className="alnadary-totals-section">
      <div className="alnadary-total-bar">
        <div className="alnadary-total-bar-label">إجمالي السند</div>
        <div className="alnadary-total-bar-words">{meta.tafqeetText}</div>
        <div className="alnadary-total-bar-amount" dir="ltr">
          {formatCurrency(bond.amount, bond.currency_code)}
        </div>
      </div>
    </div>
  </AlNadaryPrintShell>
);
