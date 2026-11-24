// ============================================
// Statement Excel Exporter - Professional Modern Multi-Currency Edition
// ============================================

import {
  enableWorkbookRtl,
  loadXLSX,
  sanitizeFileName,
} from '../../../core/utils/excelExporterBase';
import { formatLocalDate } from '../../../core/utils/dateUtils';
import type {
  CompanyInfo,
  StatementEntry,
  StatementExportOptions,
} from './statement-excel/statementExcelTheme';
import { buildCurrencyStatementSheet } from './statement-excel/currencyStatementSheet';
import { buildMultiCurrencySummarySheet } from './statement-excel/multiCurrencySummarySheet';

export type { CompanyInfo, StatementEntry, StatementExportOptions };

const singleSheetTitle = (curr: string): string =>
  curr === 'SAR'
    ? 'كشف حساب - ريال سعودي'
    : curr === 'YER'
      ? 'كشف حساب - ريال يمني'
      : `كشف حساب (${curr})`;

export const generateStatementExcelWorkbook = async (
  company: CompanyInfo,
  partyName: string,
  entries: StatementEntry[],
  options: StatementExportOptions = {}
) => {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  const currenciesPresent = Array.from(
    new Set(
      entries
        .map(e => e.currency?.trim().toUpperCase())
        .filter((c): c is string => Boolean(c))
    )
  ).sort((a, b) => {
    if (a === 'SAR') return -1;
    if (b === 'SAR') return 1;
    if (a === 'YER') return -1;
    if (b === 'YER') return 1;
    return a.localeCompare(b);
  });

  const isSupplier = options.partyType === 'supplier';
  const isFilteringSingleCurrency =
    Boolean(options.currencyCode) && options.currencyCode !== 'ALL';

  if (isFilteringSingleCurrency && options.currencyCode) {
    const singleCurr = options.currencyCode.trim().toUpperCase();
    const singleEntries = entries.filter(
      e => !e.currency || e.currency.trim().toUpperCase() === singleCurr
    );
    const ws = await buildCurrencyStatementSheet(
      company,
      partyName,
      singleEntries,
      singleCurr,
      options
    );
    XLSX.utils.book_append_sheet(wb, ws, singleSheetTitle(singleCurr));
    enableWorkbookRtl(wb);
    return wb;
  }

  if (currenciesPresent.length > 1) {
    const currencyBreakdown = currenciesPresent.map(curr => {
      const currEntries = entries.filter(
        e => (e.currency?.trim().toUpperCase() || 'SAR') === curr
      );
      const totalDebit = currEntries.reduce((s, r) => s + (Number(r.debit) || 0), 0);
      const totalCredit = currEntries.reduce((s, r) => s + (Number(r.credit) || 0), 0);
      const finalBalance = isSupplier ? totalCredit - totalDebit : totalDebit - totalCredit;
      return {
        currency: curr,
        totalDebit,
        totalCredit,
        finalBalance,
        count: currEntries.length,
      };
    });

    const summarySheet = await buildMultiCurrencySummarySheet(
      company,
      partyName,
      currencyBreakdown,
      options
    );
    XLSX.utils.book_append_sheet(wb, summarySheet, 'ملخص شامل للعملات');

    for (const curr of currenciesPresent) {
      const currEntries = entries.filter(
        e => (e.currency?.trim().toUpperCase() || 'SAR') === curr
      );
      const ws = await buildCurrencyStatementSheet(
        company,
        partyName,
        currEntries,
        curr,
        options
      );
      const sheetName =
        curr === 'SAR'
          ? 'ريال سعودي (SAR)'
          : curr === 'YER'
            ? 'ريال يمني (YER)'
            : `حركات (${curr})`;
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    enableWorkbookRtl(wb);
    return wb;
  }

  const defaultCurrency = currenciesPresent[0] || options.currencyCode || 'SAR';
  const ws = await buildCurrencyStatementSheet(
    company,
    partyName,
    entries,
    defaultCurrency,
    options
  );
  XLSX.utils.book_append_sheet(wb, ws, singleSheetTitle(defaultCurrency));
  enableWorkbookRtl(wb);
  return wb;
};

export const exportStatementToExcel = async (
  company: CompanyInfo,
  partyName: string,
  data: StatementEntry[],
  options: StatementExportOptions = {}
) => {
  try {
    const XLSX = await loadXLSX();
    const wb = await generateStatementExcelWorkbook(company, partyName, data, options);
    const safeName = sanitizeFileName(partyName);
    const dateStr = formatLocalDate();
    XLSX.writeFile(wb, `كشف_حساب_${safeName}_${dateStr}.xlsx`);
  } catch {
    throw new Error('فشل تصدير كشف الحساب إلى Excel');
  }
};

export const generateStatementExcelBlob = async (
  company: CompanyInfo,
  partyName: string,
  data: StatementEntry[],
  options: StatementExportOptions = {}
): Promise<Blob> => {
  try {
    const XLSX = await loadXLSX();
    const wb = await generateStatementExcelWorkbook(company, partyName, data, options);
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  } catch {
    throw new Error('فشل إنشاء ملف كشف الحساب');
  }
};
