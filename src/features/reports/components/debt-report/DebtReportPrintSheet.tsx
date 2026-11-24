import React from 'react';
import { formatCurrency, formatLocalDate } from '../../../../core/utils';
import { AlNadaryPrintShell } from '@/ui/print/AlNadaryPrintShell';
import {
  getCurrencyColumnLabel,
  getRowCurrencyAmount,
  type CurrencyTotal,
  type EnrichedDebtRow,
} from './debtReportHelpers';

interface DebtReportPrintSheetProps {
  activeFilterLabel: string;
  baseCurrency: string;
  activeCurrencies: string[];
  filteredRows: EnrichedDebtRow[];
  filteredCurrencyTotals: CurrencyTotal[];
  totalReceivables: number;
  totalPayables: number;
  netPosition: number;
  company: {
    nameAr: string;
    logoUrl: string;
    address: string;
    phone: string;
  };
}

export const DebtReportPrintSheet: React.FC<DebtReportPrintSheetProps> = ({
  activeFilterLabel,
  baseCurrency,
  activeCurrencies,
  filteredRows,
  filteredCurrencyTotals,
  totalReceivables,
  totalPayables,
  netPosition,
  company,
}) => (
  <AlNadaryPrintShell
    documentTitle={`تقرير الديون والمركز المالي — ${activeFilterLabel}`}
    documentDate={formatLocalDate(new Date())}
    documentNumber={`${filteredRows.length} جهة`}
    documentNumberLabel="عدد الجهات"
    company={{
      nameAr: company.nameAr,
      logoUrl: company.logoUrl,
      address: company.address,
      phone: company.phone,
    }}
    rightMeta={[
      {
        label: 'مستحقات العملاء (عليه)',
        value: formatCurrency(totalReceivables, baseCurrency),
      },
      {
        label: 'التزامات الموردين (له)',
        value: formatCurrency(totalPayables, baseCurrency),
      },
    ]}
    leftMeta={[
      {
        label: 'صافي المركز المالي',
        value: `${formatCurrency(Math.abs(netPosition), baseCurrency)} (${netPosition >= 0 ? 'فائض' : 'التزام'})`,
      },
      { label: 'العملات', value: activeCurrencies.join(' • ') },
    ]}
    showDefaultTerms={false}
    signatures={['إعداد المحاسب', 'مراجعة المدير المالي', 'الاعتماد']}
  >
    <table className="alnadary-table">
      <thead>
        <tr>
          <th style={{ width: '5%' }}>#</th>
          <th style={{ width: '26%' }}>الجهة المالية</th>
          <th style={{ width: '12%' }}>الهاتف</th>
          <th style={{ width: '8%' }}>الفئة</th>
          <th style={{ width: '11%' }}>الموقف</th>
          {activeCurrencies.map(curr => (
            <th key={curr}>{getCurrencyColumnLabel(curr)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filteredRows.map(row => (
          <tr key={row.id}>
            <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.rowIndex}</td>
            <td className="alnadary-td-right" style={{ fontWeight: 800 }}>
              {row.name}
            </td>
            <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>
              {row.phone || '—'}
            </td>
            <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.typeLabel}</td>
            <td
              style={{
                textAlign: 'center',
                fontWeight: 800,
                color: row.direction === 'debit' ? '#be123c' : '#047857',
              }}
            >
              {row.directionLabel}
            </td>
            {activeCurrencies.map(curr => {
              const val = getRowCurrencyAmount(row, curr);
              if (Math.abs(val) < 0.005) {
                return (
                  <td key={curr} style={{ textAlign: 'center', color: '#94a3b8' }}>
                    —
                  </td>
                );
              }
              const isDebit = val > 0;
              return (
                <td
                  key={curr}
                  style={{
                    textAlign: 'left',
                    fontFamily: 'monospace',
                    fontWeight: 900,
                    color: isDebit ? '#be123c' : '#047857',
                  }}
                  dir="ltr"
                >
                  {formatCurrency(Math.abs(val), curr)} ({isDebit ? 'عليه' : 'له'})
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 900 }}>
          <td colSpan={5} className="alnadary-td-right" style={{ fontWeight: 900 }}>
            الإجمالي الصافي حسب العملة ({filteredRows.length} جهة)
          </td>
          {filteredCurrencyTotals.map(ct => (
            <td
              key={ct.currency}
              style={{
                textAlign: 'left',
                fontFamily: 'monospace',
                fontWeight: 900,
                color: ct.net >= 0 ? '#be123c' : '#047857',
              }}
              dir="ltr"
            >
              {formatCurrency(Math.abs(ct.net), ct.currency)} ({ct.net >= 0 ? 'عليه' : 'له'})
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  </AlNadaryPrintShell>
);
