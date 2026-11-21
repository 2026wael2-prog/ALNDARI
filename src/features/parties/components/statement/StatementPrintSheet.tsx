/* eslint-disable @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
import React, { useMemo } from 'react';
import type { PartyType } from '../../types';
import type { StatementMovement } from '../../services/statementTypes';
import { formatLocalDate } from '@/core/utils/dateUtils';
import { tafqeet } from '@/core/utils/tafqeet';
import { AlNadaryPrintShell } from '@/ui/print/AlNadaryPrintShell';

interface CompanyInfo {
  nameAr: string;
  nameEn: string;
  address: string;
  phone: string;
  taxNumber: string;
  specialization: string;
  headerText: string;
  logoUrl?: string | undefined;
}

interface StatementPrintSheetProps {
  company: CompanyInfo;
  partyType: PartyType;
  partyName?: string | undefined;
  partyPhone?: string | undefined;
  partyCode?: string | undefined;
  currency?: string | undefined;
  movements?: StatementMovement[] | undefined;
  printSubtitle?: string | undefined;
}

const formatNum = (val: number): string => {
  if (!Number.isFinite(val)) return '0';
  return Number.isInteger(val)
    ? val.toLocaleString('en-US')
    : val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const currencyUnitOf = (code?: string): string => {
  if (!code || code === 'ALL' || code === 'SAR') return 'ريال سعودي';
  if (code === 'YER') return 'ريال يمني';
  if (code === 'OMR') return 'ريال عماني';
  if (code === 'USD') return 'دولار أمريكي';
  return code;
};

/**
 * قالب طباعة كشف حساب العملاء والموردين الموحد لشركة النظاري.
 * يظهر على الشاشة كمعاينة مدمجة للهيدر، وعند الطباعة/تصدير PDF يُخرج كشف حساب A4 رسمي كامل
 * مطابق لهوية فاتورة النظاري المرجعية مع تكرار الترويسة والرصيد الافتتاحي وحالة الحساب.
 */
export const StatementPrintSheet: React.FC<StatementPrintSheetProps> = ({
  company,
  partyType,
  partyName,
  partyPhone,
  partyCode,
  currency = 'SAR',
  movements = [],
  printSubtitle,
}) => {
  const currentDate = formatLocalDate();
  const isCustomer = partyType === 'customer';
  const docTitle =
    printSubtitle || (isCustomer ? 'كشف حساب عميل' : 'كشف حساب مورد');
  const currencyUnit = currencyUnitOf(currency);

  const summary = useMemo(() => {
    const openingRow = movements.find(m => m.is_bf === 1 || m.type === 'opening_balance');
    const openingBalance = openingRow
      ? (openingRow.debit || 0) - (openingRow.credit || 0)
      : 0;

    let totalDebit = 0;
    let totalCredit = 0;
    let running = 0;
    const rows = movements.map(m => {
      const debit = Number(m.debit) || 0;
      const credit = Number(m.credit) || 0;
      const isOpeningRow = m.is_bf === 1 || m.type === 'opening_balance';
      if (!isOpeningRow) {
        totalDebit += debit;
        totalCredit += credit;
      }
      running = m.balance !== undefined ? Number(m.balance) : running + debit - credit;
      return {
        ...m,
        debit,
        credit,
        computedBalance: running,
      };
    });

    const finalBalance = rows.length > 0 ? rows[rows.length - 1].computedBalance : openingBalance;
    const dates = rows.map(r => r.date).filter(Boolean).sort();
    const periodText =
      dates.length > 1
        ? `من ${dates[0]} إلى ${dates[dates.length - 1]}`
        : dates.length === 1
          ? `بتاريخ ${dates[0]}`
          : `حتى ${currentDate}`;

    let statusLabel = 'متزن (خالص)';
    if (Math.abs(finalBalance) >= 0.01) {
      if (isCustomer) {
        statusLabel =
          finalBalance > 0 ? 'مدين (مستحق على العميل)' : 'دائن (رصيد لصالح العميل)';
      } else {
        statusLabel =
          finalBalance < 0 ? 'دائن (مستحق للمورد)' : 'مدين (رصيد لصالح الشركة)';
      }
    }

    return {
      rows,
      openingBalance,
      totalDebit,
      totalCredit,
      finalBalance,
      periodText,
      statusLabel,
    };
  }, [movements, currentDate, isCustomer]);

  const partyDisplay = partyPhone ? `${partyName || '—'}   ${partyPhone}` : (partyName || '—');

  const commonHeaderProps = {
    documentTitle: docTitle,
    documentDate: currentDate,
    documentNumber: partyCode || undefined,
    documentNumberLabel: 'رقم الحساب',
    company: {
      nameAr: company.nameAr,
      logoUrl: company.logoUrl,
      address: company.address,
      phone: company.phone,
    },
    rightMeta: [
      { label: isCustomer ? 'اسم العميل' : 'اسم المورد', value: partyDisplay },
      {
        label: 'الرصيد الافتتاحي',
        value: `${formatNum(summary.openingBalance)} ${currencyUnit}`,
      },
    ],
    leftMeta: [
      { label: 'الفترة الزمنية', value: summary.periodText },
      { label: 'العملة', value: currency === 'ALL' ? 'جميع العملات' : currencyUnit },
    ],
  };

  return (
    <>
      {/* عرض الشاشة: هيدر موحد بكامل عرض الشاشة مدمج أعلى كشف الحساب بدون تذييل منفصل */}
      <div className="no-print mb-3 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <AlNadaryPrintShell {...commonHeaderProps} hideFooter>
          <></>
        </AlNadaryPrintShell>
      </div>

      {/* عرض الطباعة / PDF: كشف الحساب الرسمي الكامل في مستند A4 واحد متصل */}
      <div className="hidden w-full bg-white print:block">
        <AlNadaryPrintShell
          {...commonHeaderProps}
          showDefaultTerms={false}
          signatures={['مطابقة العميل / المورد', 'المحاسب', 'الختم والاعتماد']}
        >
          <table className="alnadary-table">
            <thead>
              <tr>
                <th style={{ width: '13%' }}>التاريخ</th>
                <th style={{ width: '14%' }}>رقم الفاتورة / السند</th>
                <th style={{ width: '37%' }}>البيان</th>
                <th style={{ width: '12%' }}>مدين</th>
                <th style={{ width: '12%' }}>دائن</th>
                <th style={{ width: '12%' }}>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="alnadary-td-center" style={{ padding: '14px' }}>
                    لا توجد حركات مالية مسجلة خلال هذه الفترة
                  </td>
                </tr>
              ) : (
                summary.rows.map((row, idx) => (
                  <tr key={row.id || idx}>
                    <td className="alnadary-td-center" dir="ltr">
                      {row.date ? row.date.replace(/-/g, '/') : '—'}
                    </td>
                    <td className="alnadary-td-center" dir="ltr">
                      {row.ref || '—'}
                    </td>
                    <td className="alnadary-td-right">{row.desc || '—'}</td>
                    <td className="alnadary-td-num">{row.debit > 0 ? formatNum(row.debit) : '0'}</td>
                    <td className="alnadary-td-num">{row.credit > 0 ? formatNum(row.credit) : '0'}</td>
                    <td className="alnadary-td-num">{formatNum(row.computedBalance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="alnadary-totals-section">
            <div className="alnadary-inline-summary">
              <span>
                إجمالي المدين : <span dir="ltr">{formatNum(summary.totalDebit)}</span>
              </span>
              <span>
                إجمالي الدائن : <span dir="ltr">{formatNum(summary.totalCredit)}</span>
              </span>
              <span>حالة الحساب : {summary.statusLabel}</span>
            </div>

            <div className="alnadary-total-bar">
              <div className="alnadary-total-bar-label">الرصيد النهائي</div>
              <div className="alnadary-total-bar-words">
                {Math.abs(summary.finalBalance) >= 0.01
                  ? tafqeet(Math.abs(summary.finalBalance), currencyUnit)
                  : 'صفر لا غير'}
              </div>
              <div className="alnadary-total-bar-amount">
                {formatNum(summary.finalBalance)}
              </div>
            </div>
          </div>
        </AlNadaryPrintShell>
      </div>
    </>
  );
};

export default StatementPrintSheet;
