import { loadXLSX } from '../../../../core/utils/excelExporterBase';
import type { XlsxSheet } from '../../../../core/utils/excelExporterBase';
import { formatLocalDate } from '../../../../core/utils/dateUtils';
import {
  buildCompanyInfoLine,
  crispCellBorder,
  getCell,
  headerBorder,
  type CompanyInfo,
  type CurrencyBreakdownItem,
  type StatementExportOptions,
} from './statementExcelTheme';

/**
 * Builds the Consolidated Multi-Currency Summary Sheet.
 */
export const buildMultiCurrencySummarySheet = async (
  company: CompanyInfo,
  partyName: string,
  currencyBreakdown: CurrencyBreakdownItem[],
  options: StatementExportOptions
): Promise<XlsxSheet> => {
  const XLSX = await loadXLSX();
  const rows: unknown[][] = [];
  const isSupplier = options.partyType === 'supplier';
  const todayFormatted = formatLocalDate();
  const dateRangeText =
    options.dateFrom && options.dateTo
      ? `الفترة من: ${options.dateFrom} إلى: ${options.dateTo}`
      : `حتى تاريخ: ${todayFormatted}`;

  rows.push([company.name_ar || 'منظومة الجعفري المحاسبية']);
  rows.push(['ملخص كشف الحساب الموحد متعدد العملات | CONSOLIDATED STATEMENT SUMMARY']);
  rows.push([buildCompanyInfoLine(company)]);
  rows.push([]);

  rows.push([
    `${isSupplier ? 'المورد / الجهة' : 'العميل / الجهة'}: ${partyName}`,
    '',
    `العملات النشطة: ${currencyBreakdown.map(c => c.currency).join(' / ')}`,
    '',
    `تاريخ التقرير: ${todayFormatted}`,
    '',
  ]);
  rows.push([
    options.partyPhone
      ? `رقم الهاتف: ${options.partyPhone}`
      : `التصنيف: ${options.partyCategory || (isSupplier ? 'مورد' : 'عميل')}`,
    '',
    dateRangeText,
    '',
    `إجمالي عدد العملات: ${currencyBreakdown.length}`,
    '',
  ]);
  rows.push([]);

  const tableHeaderIndex = rows.length;
  rows.push([
    'م',
    'العملة النقدية',
    'إجمالي الحركات المدينة (+)',
    'إجمالي الحركات الدائنة (-)',
    'صافي الرصيد المستحق',
    'الموقف المحاسبي للرصيد',
  ]);

  currencyBreakdown.forEach((item, idx) => {
    const isPositive = item.finalBalance >= 0;
    const statusText = isSupplier
      ? isPositive
        ? 'مستحق للمورد (له)'
        : 'دفعة مقدمة للمورد (عليه)'
      : isPositive
        ? 'مطلوب سداده من العميل (مدين)'
        : 'رصيد دائن لصالح العميل (دائن)';

    const label =
      item.currency === 'SAR'
        ? '🇸🇦 الريال السعودي (SAR)'
        : item.currency === 'YER'
          ? '🇾🇪 الريال اليمني (YER)'
          : item.currency;

    rows.push([idx + 1, label, item.totalDebit, item.totalCredit, item.finalBalance, statusText]);
  });

  const lastTableIndex = rows.length - 1;
  rows.push([]);
  rows.push([
    '📌 تنبيه محاسبي: تم فصل أرصدة وحركات الريال السعودي (SAR) عن الريال اليمني (YER) بدقة لمنع تضارب العملات. تجدون الحركات التفصيلية لكل عملة في ورقة العمل المستقلة المرفقة أدناه.',
  ]);
  rows.push([]);

  if (company.bank_name || company.bank_account_iban) {
    rows.push([
      `📌 تعليمات السداد البنكي: البنك: ${company.bank_name || '—'} | الآيبان (IBAN): ${company.bank_account_iban || '—'}`,
    ]);
  }
  rows.push(['تم استخراج هذا الملخص آلياً من منظومة الجعفري لإدارة المبيعات والمحاسبة.']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 30 },
  ];

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 1 } },
    { s: { r: 4, c: 2 }, e: { r: 4, c: 3 } },
    { s: { r: 4, c: 4 }, e: { r: 4, c: 5 } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: 1 } },
    { s: { r: 5, c: 2 }, e: { r: 5, c: 3 } },
    { s: { r: 5, c: 4 }, e: { r: 5, c: 5 } },
    { s: { r: lastTableIndex + 2, c: 0 }, e: { r: lastTableIndex + 2, c: 5 } },
  ];

  if (company.bank_name || company.bank_account_iban) {
    ws['!merges'].push({
      s: { r: lastTableIndex + 4, c: 0 },
      e: { r: lastTableIndex + 4, c: 5 },
    });
    ws['!merges'].push({
      s: { r: lastTableIndex + 5, c: 0 },
      e: { r: lastTableIndex + 5, c: 5 },
    });
  } else {
    ws['!merges'].push({
      s: { r: lastTableIndex + 4, c: 0 },
      e: { r: lastTableIndex + 4, c: 5 },
    });
  }

  ws['!views'] = [{ showGridLines: true }];

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:F1');
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = getCell(ws, XLSX.utils.encode_cell({ r: R, c: C }));
      if (cell === undefined) continue;

      cell.s = {
        border: crispCellBorder,
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        font: { name: 'Calibri', sz: 10.5, color: { rgb: '1E293B' } },
      };

      if (typeof cell.v === 'number') {
        if (C === 0) {
          cell.z = '0';
        } else {
          cell.z = '#,##0.00';
          cell.s.alignment = { horizontal: 'right', vertical: 'center' };
          cell.s.font = { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F172A' } };
        }
      }

      if (R === 0) {
        cell.s.font = { name: 'Calibri', sz: 16, bold: true, color: { rgb: 'FFFFFF' } };
        cell.s.fill = { fgColor: { rgb: '0F172A' } };
      } else if (R === 1) {
        cell.s.font = { name: 'Calibri', sz: 12, bold: true, color: { rgb: 'FFFFFF' } };
        cell.s.fill = { fgColor: { rgb: '2563EB' } };
      } else if (R === 2) {
        cell.s.font = { name: 'Calibri', sz: 9.5, color: { rgb: '334155' } };
        cell.s.fill = { fgColor: { rgb: 'F1F5F9' } };
      } else if (R === 4 || R === 5) {
        cell.s.font = { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1E293B' } };
        cell.s.fill = { fgColor: { rgb: 'F8FAFC' } };
      } else if (R === tableHeaderIndex) {
        cell.s.border = headerBorder;
        cell.s.fill = { fgColor: { rgb: '1E293B' } };
        cell.s.font = { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } };
      } else if (R > tableHeaderIndex && R <= lastTableIndex) {
        const rowCurrency = currencyBreakdown[R - tableHeaderIndex - 1]?.currency;
        if (rowCurrency === 'SAR') {
          cell.s.fill = { fgColor: { rgb: 'F0F9FF' } };
        } else if (rowCurrency === 'YER') {
          cell.s.fill = { fgColor: { rgb: 'F0FDF4' } };
        }
        if (C === 1) {
          cell.s.alignment = { horizontal: 'right', vertical: 'center' };
          cell.s.font = { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F172A' } };
        }
        if (C === 4) {
          cell.s.fill = { fgColor: { rgb: 'FEF3C7' } };
          cell.s.font = { name: 'Calibri', sz: 12, bold: true, color: { rgb: '92400E' } };
        }
      } else if (R > lastTableIndex) {
        cell.s.font = { name: 'Calibri', sz: 9.5, italic: true, color: { rgb: '475569' } };
        cell.s.fill = { fgColor: { rgb: 'F8FAFC' } };
      }
    }
  }

  return ws;
};
