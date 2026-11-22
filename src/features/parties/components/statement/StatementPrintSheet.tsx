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
  /** When true (e.g. inside PdfCaptureHost), renders only the full A4 layout visibly without `hidden print:block`. */
  forPdf?: boolean | undefined;
}

const formatNum = (val: number): string => {
  if (!Number.isFinite(val)) return '0';
  return Number.isInteger(val)
    ? val.toLocaleString('en-US')
    : val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const currencyUnitOf = (code?: string): string => {
  const norm = (code || '').trim().toUpperCase();
  if (!norm || norm === 'ALL' || norm === 'SAR') return 'ريال سعودي';
  if (norm === 'YER') return 'ريال يمني';
  if (norm === 'OMR') return 'ريال عماني';
  if (norm === 'USD') return 'دولار أمريكي';
  return norm;
};

const currencyBadgeStyle = (code: string): { bg: string; border: string; color: string; label: string } => {
  if (code === 'YER') {
    return { bg: '#ecfdf5', border: '#059669', color: '#065f46', label: 'حساب الريال اليمني (YER)' };
  }
  if (code === 'USD') {
    return { bg: '#f5f3ff', border: '#7c3aed', color: '#4c1d95', label: 'حساب الدولار الأمريكي (USD)' };
  }
  if (code === 'SAR') {
    return { bg: '#eff6ff', border: '#1d4ed8', color: '#1e3a8a', label: 'حساب الريال السعودي (SAR)' };
  }
  return { bg: '#f8fafc', border: '#475569', color: '#0f172a', label: `حساب عملة (${code})` };
};

interface CurrencySectionSummary {
  currency: string;
  currencyUnit: string;
  rows: Array<StatementMovement & { debit: number; credit: number; computedBalance: number }>;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  statusLabel: string;
}

const buildCurrencySection = (
  currCode: string,
  items: StatementMovement[],
  isCustomer: boolean
): CurrencySectionSummary => {
  const openingRow = items.find(m => m.is_bf === 1 || m.type === 'opening_balance');
  const openingBalance = openingRow
    ? isCustomer
      ? (Number(openingRow.debit) || 0) - (Number(openingRow.credit) || 0)
      : (Number(openingRow.credit) || 0) - (Number(openingRow.debit) || 0)
    : 0;

  let totalDebit = 0;
  let totalCredit = 0;
  let running = 0;

  const rows = items.map(m => {
    const debit = Number(m.debit) || 0;
    const credit = Number(m.credit) || 0;
    const isOpeningRow = m.is_bf === 1 || m.type === 'opening_balance';
    if (!isOpeningRow) {
      totalDebit += debit;
      totalCredit += credit;
    }
    const delta = isCustomer ? debit - credit : credit - debit;
    running = running + delta;
    return {
      ...m,
      debit,
      credit,
      computedBalance: running,
    };
  });

  const finalBalance = rows.length > 0 ? rows[rows.length - 1].computedBalance : openingBalance;

  let statusLabel = 'متزن (خالص)';
  if (Math.abs(finalBalance) >= 0.01) {
    if (isCustomer) {
      statusLabel =
        finalBalance > 0 ? 'مدين (مستحق على العميل)' : 'دائن (رصيد لصالح العميل)';
    } else {
      statusLabel =
        finalBalance > 0 ? 'دائن (مستحق للمورد)' : 'مدين (رصيد لصالح الشركة)';
    }
  }

  return {
    currency: currCode,
    currencyUnit: currencyUnitOf(currCode),
    rows,
    openingBalance,
    totalDebit,
    totalCredit,
    finalBalance,
    statusLabel,
  };
};

/**
 * قالب طباعة كشف حساب العملاء والموردين الموحد لشركة النظاري.
 * يفصل كل عملة (ريال سعودي / ريال يمني / غيرها) في جدول وإجمالي مستقل تماماً لمنع خلط أو جمع العملات.
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
  forPdf = false,
}) => {
  const currentDate = formatLocalDate();
  const isCustomer = partyType === 'customer';
  const docTitle =
    printSubtitle || (isCustomer ? 'كشف حساب عميل' : 'كشف حساب مورد');

  const { sections, periodText, isMultiCurrency } = useMemo(() => {
    const grouped = new Map<string, StatementMovement[]>();
    const fallbackCurr = currency && currency !== 'ALL' ? currency.trim().toUpperCase() : 'SAR';

    for (const m of movements) {
      const code = (m.currency || fallbackCurr).trim().toUpperCase();
      const list = grouped.get(code) ?? [];
      list.push(m);
      grouped.set(code, list);
    }

    // Order SAR first, YER second, then any remaining currencies alphabetically
    const orderedCodes = Array.from(grouped.keys()).sort((a, b) => {
      if (a === 'SAR') return -1;
      if (b === 'SAR') return 1;
      if (a === 'YER') return -1;
      if (b === 'YER') return 1;
      return a.localeCompare(b);
    });

    const builtSections: CurrencySectionSummary[] =
      orderedCodes.length > 0
        ? orderedCodes.map(code => buildCurrencySection(code, grouped.get(code)!, isCustomer))
        : [buildCurrencySection(fallbackCurr, [], isCustomer)];

    const dates = movements.map(r => r.date).filter(Boolean).sort();
    const pText =
      dates.length > 1
        ? `من ${dates[0]} إلى ${dates[dates.length - 1]}`
        : dates.length === 1
          ? `بتاريخ ${dates[0]}`
          : `حتى ${currentDate}`;

    return {
      sections: builtSections,
      periodText: pText,
      isMultiCurrency: builtSections.length > 1,
    };
  }, [movements, currency, currentDate, isCustomer]);

  const primarySection = sections[0];
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
        value: isMultiCurrency
          ? sections.map(s => `${formatNum(s.openingBalance)} ${s.currency}`).join('  |  ')
          : `${formatNum(primarySection.openingBalance)} ${primarySection.currencyUnit}`,
      },
    ],
    leftMeta: [
      { label: 'الفترة الزمنية', value: periodText },
      {
        label: 'العملة',
        value: isMultiCurrency
          ? `متعدد العملات (${sections.map(s => s.currency).join(' + ')}) — مفصولة`
          : primarySection.currencyUnit,
      },
    ],
  };

  const printBody = (
    <AlNadaryPrintShell
      {...commonHeaderProps}
      showDefaultTerms={false}
      signatures={['مطابقة العميل / المورد', 'المحاسب', 'الختم والاعتماد']}
    >
      {isMultiCurrency && (
        <div
          style={{
            marginBottom: '12px',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            backgroundColor: '#f8fafc',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
            ملخص الأرصدة المستقلة حسب العملة (لا تُجمع العملات المختلفة معاً):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {sections.map(sec => {
              const badge = currencyBadgeStyle(sec.currency);
              return (
                <div
                  key={sec.currency}
                  style={{
                    flex: '1 1 220px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${badge.border}`,
                    backgroundColor: badge.bg,
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 800, color: badge.color }}>
                    {badge.label} ({sec.rows.length} حركة)
                  </div>
                  <div style={{ fontSize: '11px', color: '#334155', marginTop: '4px' }}>
                    مدين: <strong dir="ltr">{formatNum(sec.totalDebit)}</strong> &nbsp;|&nbsp; دائن:{' '}
                    <strong dir="ltr">{formatNum(sec.totalCredit)}</strong>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: badge.color, marginTop: '4px' }}>
                    الرصيد النهائي: <span dir="ltr">{formatNum(sec.finalBalance)}</span> {sec.currencyUnit}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sections.map((sec, secIdx) => {
        const badge = currencyBadgeStyle(sec.currency);
        return (
          <div
            key={sec.currency}
            style={{ marginTop: secIdx > 0 ? '18px' : '0px' }}
            data-pdf-break={secIdx > 0 ? 'true' : undefined}
          >
            {isMultiCurrency && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 10px',
                  marginBottom: '6px',
                  borderRadius: '6px',
                  backgroundColor: badge.bg,
                  borderRight: `4px solid ${badge.border}`,
                  color: badge.color,
                  fontWeight: 800,
                  fontSize: '12px',
                }}
              >
                <span>{badge.label}</span>
                <span>عدد الحركات: {sec.rows.length}</span>
              </div>
            )}

            <table className="alnadary-table">
              <thead>
                <tr>
                  <th style={{ width: '13%' }}>التاريخ</th>
                  <th style={{ width: '14%' }}>رقم الفاتورة / السند</th>
                  <th style={{ width: '37%' }}>البيان</th>
                  <th style={{ width: '12%' }}>مدين ({sec.currency})</th>
                  <th style={{ width: '12%' }}>دائن ({sec.currency})</th>
                  <th style={{ width: '12%' }}>الرصيد ({sec.currency})</th>
                </tr>
              </thead>
              <tbody>
                {sec.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="alnadary-td-center" style={{ padding: '14px' }}>
                      لا توجد حركات مالية مسجلة خلال هذه الفترة
                    </td>
                  </tr>
                ) : (
                  sec.rows.map((row, idx) => (
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
                  إجمالي المدين ({sec.currency}) : <span dir="ltr">{formatNum(sec.totalDebit)}</span>
                </span>
                <span>
                  إجمالي الدائن ({sec.currency}) : <span dir="ltr">{formatNum(sec.totalCredit)}</span>
                </span>
                <span>حالة الحساب : {sec.statusLabel}</span>
              </div>

              <div className="alnadary-total-bar">
                <div className="alnadary-total-bar-label">الرصيد النهائي ({sec.currency})</div>
                <div className="alnadary-total-bar-words">
                  {Math.abs(sec.finalBalance) >= 0.01
                    ? tafqeet(Math.abs(sec.finalBalance), sec.currencyUnit)
                    : 'صفر لا غير'}
                </div>
                <div className="alnadary-total-bar-amount">
                  {formatNum(sec.finalBalance)} {sec.currency}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </AlNadaryPrintShell>
  );

  if (forPdf) {
    return <div className="block w-full bg-white">{printBody}</div>;
  }

  return (
    <>
      {/* عرض الشاشة: هيدر موحد بكامل عرض الشاشة مدمج أعلى كشف الحساب بدون تذييل منفصل */}
      <div className="no-print mb-3 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <AlNadaryPrintShell {...commonHeaderProps} hideFooter>
          <></>
        </AlNadaryPrintShell>
      </div>

      {/* عرض الطباعة: كشف الحساب الرسمي الكامل في مستند A4 واحد متصل */}
      <div className="hidden w-full bg-white print:block">{printBody}</div>
    </>
  );
};

export default StatementPrintSheet;
