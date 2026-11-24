import type { PartyDebt } from '../../types';
import { formatCurrency, formatLocalDate } from '../../../../core/utils';

export type DebtFilterTab = 'all' | 'customers' | 'suppliers';
export type DebtSortMode = 'amount_desc' | 'amount_asc' | 'name_asc';

export interface EnrichedDebtRow {
  id: string;
  rowIndex: number;
  name: string;
  phone: string;
  type: 'customer' | 'supplier';
  typeLabel: string;
  remaining_amount: number;
  absAmount: number;
  direction: 'debit' | 'credit';
  directionLabel: string;
  currency: string;
  balances_by_currency: Array<{ currency: string; balance: number }>;
  /** Signed native balance per currency code (+ = عليه, - = له) */
  currencyAmounts: Record<string, number>;
}

export interface CurrencyTotal {
  currency: string;
  debit: number;
  credit: number;
  net: number;
}

const CURRENCY_PRIORITY = ['SAR', 'YER', 'OMR', 'USD', 'AED'];

const CURRENCY_LABELS = new Map<string, string>([
  ['SAR', 'سعودي (SAR)'],
  ['YER', 'يمني (YER)'],
  ['OMR', 'عماني (OMR)'],
  ['USD', 'دولار (USD)'],
  ['AED', 'إماراتي (AED)'],
]);

export const normalizeArabicSearch = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '')
    .trim();

export const getCurrencyColumnLabel = (code: string): string => {
  const upper = code.toUpperCase();
  return CURRENCY_LABELS.get(upper) ?? upper;
};

export const getRowCurrencyAmount = (row: EnrichedDebtRow, currencyCode: string): number => {
  const map = new Map(Object.entries(row.currencyAmounts));
  return Number(map.get(currencyCode) ?? 0);
};

export function enrichDebtRows(rawList: PartyDebt[], baseCurrency: string): EnrichedDebtRow[] {
  return rawList
    .filter(d => Math.abs(Number(d.remaining_amount) || 0) > 0.01)
    .map((d, idx) => {
      const remaining = Number(d.remaining_amount) || 0;
      const absAmount = Math.abs(remaining);
      const direction: 'debit' | 'credit' = remaining >= 0 ? 'debit' : 'credit';
      const byCurr = (d.balances_by_currency ?? []).filter(b => Math.abs(b.balance) > 0.01);

      const amountMap = new Map<string, number>();
      if (byCurr.length > 0) {
        for (const entry of byCurr) {
          const code = entry.currency.toUpperCase();
          const prev = amountMap.get(code) ?? 0;
          amountMap.set(code, Math.round((prev + entry.balance) * 100) / 100);
        }
      } else {
        amountMap.set(baseCurrency, Math.round(remaining * 100) / 100);
      }

      return {
        id: d.id,
        rowIndex: idx + 1,
        name: d.name,
        phone: d.phone ?? '',
        type: d.type,
        typeLabel: d.type === 'customer' ? 'عميل' : 'مورد',
        remaining_amount: remaining,
        absAmount,
        direction,
        directionLabel: direction === 'debit' ? 'عليه (مدين)' : 'له (دائن)',
        currency: baseCurrency,
        balances_by_currency: byCurr,
        currencyAmounts: Object.fromEntries(amountMap),
      };
    });
}

export function discoverActiveCurrencies(
  rows: EnrichedDebtRow[],
  baseCurrency: string
): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    for (const [code, val] of Object.entries(row.currencyAmounts)) {
      if (Math.abs(val) > 0.005) set.add(code.toUpperCase());
    }
  }
  if (set.size === 0) set.add(baseCurrency);
  return Array.from(set).sort((a, b) => {
    const ia = CURRENCY_PRIORITY.indexOf(a);
    const ib = CURRENCY_PRIORITY.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

export function computeCurrencyTotals(
  rows: EnrichedDebtRow[],
  activeCurrencies: string[]
): CurrencyTotal[] {
  return activeCurrencies.map(code => {
    let debit = 0;
    let credit = 0;
    for (const row of rows) {
      const val = getRowCurrencyAmount(row, code);
      if (val > 0) debit += val;
      else if (val < 0) credit += Math.abs(val);
    }
    return {
      currency: code,
      debit: Math.round(debit * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      net: Math.round((debit - credit) * 100) / 100,
    };
  });
}

/**
 * Pure helper to build clean Excel export rows & headers with SEPARATE columns per currency.
 * Exported for unit testing to guarantee Excel exports are never empty and currencies stay separated.
 */
export const buildDebtReportExcelPayload = (params: {
  rows: EnrichedDebtRow[];
  activeCurrencies: string[];
  baseCurrency: string;
  companyName: string;
  filterLabel: string;
}) => {
  const { rows, activeCurrencies, baseCurrency, companyName, filterLabel } = params;
  const currencies = activeCurrencies.length > 0 ? activeCurrencies : [baseCurrency];
  const hasMultipleCurrencies = currencies.length > 1;

  const headers = [
    '#',
    'الجهة المالية',
    'رقم الهاتف',
    'الفئة',
    'حالة الرصيد',
    ...currencies.map(curr => getCurrencyColumnLabel(curr)),
    ...(hasMultipleCurrencies ? [`المعادل الأساسي (${baseCurrency})`] : []),
  ];

  const dataRows: Array<Array<string | number>> = rows.map((row, idx) => [
    idx + 1,
    row.name,
    row.phone || '—',
    row.typeLabel,
    row.directionLabel,
    ...currencies.map(curr => {
      const val = getRowCurrencyAmount(row, curr);
      return Math.abs(val) > 0.005 ? Number(val.toFixed(2)) : 0;
    }),
    ...(hasMultipleCurrencies ? [Number(row.remaining_amount.toFixed(2))] : []),
  ]);

  if (dataRows.length > 0) {
    const currencySums = currencies.map(curr => {
      const total = rows.reduce((sum, r) => sum + getRowCurrencyAmount(r, curr), 0);
      return Number(total.toFixed(2));
    });
    const netBase = rows.reduce((sum, r) => sum + r.remaining_amount, 0);

    dataRows.push([
      '',
      `الإجمالي الصافي (${rows.length} جهة)`,
      '',
      filterLabel,
      netBase >= 0 ? 'صافي مستحق لنا (عليه)' : 'صافي التزام علينا (له)',
      ...currencySums,
      ...(hasMultipleCurrencies ? [Number(netBase.toFixed(2))] : []),
    ]);
  }

  return {
    title: `تقرير الديون والمركز المالي — ${filterLabel}`,
    subtitle: `العملات المفصولة: ${currencies.join(' • ')}`,
    companyName,
    headers,
    rows: dataRows,
    fileName: `تقرير_الديون_${formatLocalDate(new Date())}`,
    colorTheme: 'blue' as const,
  };
};

export function buildDebtWhatsAppText(params: {
  waHeader: string;
  companyName: string;
  activeFilterLabel: string;
  baseCurrency: string;
  totalReceivables: number;
  totalPayables: number;
  netPosition: number;
  receivablesCount: number;
  payablesCount: number;
  filteredCurrencyTotals: CurrencyTotal[];
}): string {
  const {
    waHeader,
    companyName,
    activeFilterLabel,
    baseCurrency,
    totalReceivables,
    totalPayables,
    netPosition,
    receivablesCount,
    payablesCount,
    filteredCurrencyTotals,
  } = params;

  const currencySummaryLines = filteredCurrencyTotals
    .filter(c => c.debit > 0 || c.credit > 0)
    .map(
      c =>
        `• ${getCurrencyColumnLabel(c.currency)}: صافي ${formatCurrency(Math.abs(c.net), c.currency)} (${c.net >= 0 ? 'عليه' : 'له'})`
    );

  return [
    waHeader ? waHeader.trim() : `🏢 *${companyName}*`,
    `📊 *تقرير الديون والمركز المالي (${activeFilterLabel})*`,
    `📅 *التاريخ:* ${formatLocalDate(new Date())}`,
    `━━━━━━━━━━━━━━`,
    `✅ *مستحقات العملاء (عليه):* ${formatCurrency(totalReceivables, baseCurrency)} (${receivablesCount} عميل)`,
    `🔴 *التزامات الموردين (له):* ${formatCurrency(totalPayables, baseCurrency)} (${payablesCount} مورد)`,
    `⚖️ *صافي المركز (${baseCurrency}):* ${formatCurrency(Math.abs(netPosition), baseCurrency)} (${netPosition >= 0 ? 'فائض لصالح المنشأة' : 'التزامات على المنشأة'})`,
    currencySummaryLines.length > 0 ? `\n💱 *تفصيل الأرصدة حسب العملة:*` : '',
    ...currencySummaryLines,
  ]
    .filter(Boolean)
    .join('\n');
}
