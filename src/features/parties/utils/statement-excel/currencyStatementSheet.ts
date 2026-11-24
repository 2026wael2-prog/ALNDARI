import { loadXLSX } from '../../../../core/utils/excelExporterBase';
import type { XlsxSheet } from '../../../../core/utils/excelExporterBase';
import { formatLocalDate } from '../../../../core/utils/dateUtils';
import {
  buildCompanyInfoLine,
  crispCellBorder,
  getCell,
  getCurrencyTheme,
  headerBorder,
  totalRowBorder,
  translatePaymentStatusAr,
  type CompanyInfo,
  type StatementEntry,
  type StatementExportOptions,
} from './statementExcelTheme';

/**
 * Builds a single, professionally styled statement sheet for a specific currency.
 */
export const buildCurrencyStatementSheet = async (
  company: CompanyInfo,
  partyName: string,
  entries: StatementEntry[],
  currency: string,
  options: StatementExportOptions
): Promise<XlsxSheet> => {
  const XLSX = await loadXLSX();
  const rows: unknown[][] = [];
  const theme = getCurrencyTheme(currency);
  const isSupplier = options.partyType === 'supplier';
  const todayFormatted = formatLocalDate();
  const dateRangeText =
    options.dateFrom && options.dateTo
      ? `الفترة من: ${options.dateFrom} إلى: ${options.dateTo}`
      : `حتى تاريخ: ${todayFormatted}`;

  rows.push([company.name_ar || 'منظومة الجعفري المحاسبية']);
  rows.push([`كشف حساب مالي تفصيلي - ${theme.labelAr} | STATEMENT OF ACCOUNT`]);
  rows.push([buildCompanyInfoLine(company)]);
  rows.push([]);

  rows.push([
    `${isSupplier ? 'المورد / الجهة' : 'العميل / الجهة'}: ${partyName}`,
    '',
    '',
    `عملة الكشف: ${theme.labelAr}`,
    '',
    '',
    `تاريخ التقرير: ${todayFormatted}`,
    '',
    '',
  ]);
  rows.push([
    options.partyPhone
      ? `رقم الهاتف: ${options.partyPhone}`
      : `التصنيف: ${options.partyCategory || (isSupplier ? 'مورد' : 'عميل')}`,
    '',
    '',
    dateRangeText,
    '',
    '',
    `عدد الحركات: ${entries.length}`,
    '',
    '',
  ]);
  rows.push([]);

  const tableHeaderIndex = rows.length;
  rows.push([
    'م',
    'التاريخ',
    'نوع الحركة / السند',
    'رقم المرجع',
    'البيان والتفاصيل',
    'حالة السداد',
    'مدين (+)',
    'دائن (-)',
    `الرصيد (${currency})`,
  ]);

  let totalDebit = 0;
  let totalCredit = 0;
  let runningBalance = 0;

  entries.forEach((entry, idx) => {
    const debit = Number(entry.debit) || 0;
    const credit = Number(entry.credit) || 0;
    totalDebit += debit;
    totalCredit += credit;
    runningBalance += isSupplier ? credit - debit : debit - credit;

    rows.push([
      idx + 1,
      entry.date || '',
      entry.operation_type || 'قيد محاسبي',
      entry.reference_no || '—',
      entry.desc || '—',
      translatePaymentStatusAr(entry.payment_status),
      debit,
      credit,
      runningBalance,
    ]);
  });

  const finalBalance = runningBalance;
  const summaryStatusText = isSupplier
    ? finalBalance >= 0
      ? 'مستحق للمورد (له)'
      : 'دفعة مقدمة للمورد (عليه)'
    : finalBalance >= 0
      ? 'متبقي على العميل (مدين)'
      : 'متبقي للعميل (دائن)';

  const summaryRowIndex = rows.length;
  rows.push([
    `إجمالي الحركات (${currency})`,
    '',
    '',
    '',
    '',
    `صافي الرصيد المستحق: ${summaryStatusText}`,
    totalDebit,
    totalCredit,
    finalBalance,
  ]);

  rows.push([]);
  if (company.bank_name || company.bank_account_iban) {
    rows.push([
      `📌 تعليمات السداد البنكي: البنك: ${company.bank_name || '—'} | الآيبان (IBAN): ${company.bank_account_iban || '—'}`,
    ]);
  }
  rows.push(['تم استخراج هذا الكشف آلياً من منظومة الجعفري لإدارة المبيعات والمحاسبة.']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 18 },
    { wch: 16 },
    { wch: 38 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
  ];

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 2 } },
    { s: { r: 4, c: 3 }, e: { r: 4, c: 5 } },
    { s: { r: 4, c: 6 }, e: { r: 4, c: 8 } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: 2 } },
    { s: { r: 5, c: 3 }, e: { r: 5, c: 5 } },
    { s: { r: 5, c: 6 }, e: { r: 5, c: 8 } },
    { s: { r: summaryRowIndex, c: 0 }, e: { r: summaryRowIndex, c: 4 } },
  ];

  if (company.bank_name || company.bank_account_iban) {
    ws['!merges'].push({
      s: { r: summaryRowIndex + 2, c: 0 },
      e: { r: summaryRowIndex + 2, c: 8 },
    });
    ws['!merges'].push({
      s: { r: summaryRowIndex + 3, c: 0 },
      e: { r: summaryRowIndex + 3, c: 8 },
    });
  } else {
    ws['!merges'].push({
      s: { r: summaryRowIndex + 2, c: 0 },
      e: { r: summaryRowIndex + 2, c: 8 },
    });
  }

  ws['!views'] = [{ showGridLines: true }];

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:I1');
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = getCell(ws, XLSX.utils.encode_cell({ r: R, c: C }));
      if (cell === undefined) continue;

      cell.s = {
        border: crispCellBorder,
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' } },
      };

      if (typeof cell.v === 'number') {
        if (C === 0) {
          cell.z = '0';
        } else {
          cell.z = '#,##0.00';
          cell.s.alignment = { horizontal: 'right', vertical: 'center' };
          cell.s.font = { name: 'Calibri', sz: 10.5, bold: false, color: { rgb: '0F172A' } };
        }
      }

      if (R === 0) {
        cell.s.font = { name: 'Calibri', sz: 16, bold: true, color: { rgb: 'FFFFFF' } };
        cell.s.fill = { fgColor: { rgb: theme.primaryBg } };
      } else if (R === 1) {
        cell.s.font = { name: 'Calibri', sz: 12, bold: true, color: { rgb: 'FFFFFF' } };
        cell.s.fill = { fgColor: { rgb: theme.subtitleBg } };
      } else if (R === 2) {
        cell.s.font = { name: 'Calibri', sz: 9.5, color: { rgb: '334155' } };
        cell.s.fill = { fgColor: { rgb: 'F1F5F9' } };
      } else if (R === 4 || R === 5) {
        cell.s.font = { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1E293B' } };
        cell.s.fill = { fgColor: { rgb: 'F8FAFC' } };
        cell.s.alignment = { horizontal: C === 0 ? 'right' : 'center', vertical: 'center' };
      } else if (R === tableHeaderIndex) {
        cell.s.border = headerBorder;
        cell.s.fill = { fgColor: { rgb: '0F172A' } };
        cell.s.font = { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } };
      } else if (R > tableHeaderIndex && R < summaryRowIndex) {
        if (C === 4) {
          cell.s.alignment = { horizontal: 'right', vertical: 'center' };
        }
        if (C === 6 && typeof cell.v === 'number' && cell.v > 0) {
          cell.s.font = { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: '059669' } };
        }
        if (C === 7 && typeof cell.v === 'number' && cell.v > 0) {
          cell.s.font = { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: 'E11D48' } };
        }
        if (C === 8) {
          cell.s.font = { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: theme.balanceText } };
          cell.s.fill = { fgColor: { rgb: theme.balanceBg } };
        } else if (R % 2 === 0) {
          cell.s.fill = { fgColor: { rgb: 'FAFAFA' } };
        }
      } else if (R === summaryRowIndex) {
        cell.s.border = totalRowBorder;
        cell.s.fill = { fgColor: { rgb: 'E2E8F0' } };
        cell.s.font = { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F172A' } };
        if (C === 8) {
          cell.s.fill = { fgColor: { rgb: finalBalance >= 0 ? 'DCFCE7' : 'FEE2E2' } };
          cell.s.font = {
            name: 'Calibri',
            sz: 12,
            bold: true,
            color: { rgb: finalBalance >= 0 ? '166534' : '991B1B' },
          };
        }
      } else if (R > summaryRowIndex) {
        cell.s.font = { name: 'Calibri', sz: 9, italic: true, color: { rgb: '64748B' } };
        cell.s.fill = { fgColor: { rgb: 'F8FAFC' } };
      }
    }
  }

  return ws;
};
