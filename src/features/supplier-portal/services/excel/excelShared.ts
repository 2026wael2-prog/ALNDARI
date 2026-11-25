import { formatLocalDate } from '../../../../core/utils/dateUtils';

// 🔒 lazy-loader محلي (مستقل): excelEngine يقرأ ويكتب بأنماط خاصة (sheet_to_json/read)
// ولا يشارك بنية التنسيق مع excelExporterBase — تُرك هنا حتى لا يخلط أنظمتها.

export type XlsxSheet = Record<string, unknown>;

export interface XlsxWorkbook {
  SheetNames: string[];
  Sheets: Record<string, XlsxSheet | undefined>;
  Workbook?: { Views?: Array<{ RTL?: boolean }> };
}

/** خلية منسّقة بصيغة SheetJS: `{ v: value, s: style }` أو `{}` لتخطي الخلية. */
export type XlsxStyledCell = Record<string, unknown>;

export interface XlsxApi {
  utils: {
    book_new(): XlsxWorkbook;
    aoa_to_sheet(rows: XlsxStyledCell[][]): XlsxSheet;
    book_append_sheet(workbook: XlsxWorkbook, sheet: XlsxSheet, sheetName: string): void;
    sheet_to_json(sheet: XlsxSheet, options: { header: 1 }): unknown[][];
  };
  read(data: ArrayBuffer, options?: Record<string, unknown>): XlsxWorkbook;
  writeFile(workbook: XlsxWorkbook, filename: string): void;
}

let xlsxPromise: Promise<XlsxApi> | null = null;
export const loadXLSX = (): Promise<XlsxApi> => {
  xlsxPromise ??= import('xlsx-js-style').then(module => {
    const namespace = module as { default?: XlsxApi };
    return namespace.default ?? (module as unknown as XlsxApi);
  });
  return xlsxPromise;
};

/**
 * قراءة خلية كشف Excel كنص مُشذّب.
 */
export const readExcelCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return formatLocalDate(value);
  return '';
};

/**
 * Sanitizes a cell string value against CSV/Excel formula injection (SEC-04).
 */
export const sanitizeExcelValue = (val: unknown): unknown => {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (trimmed === '') return '';

  // If it's a valid integer or floating point number (e.g. "-123.45" or "+5"), don't treat as formula
  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  // If it starts with dangerous formula triggers
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }

  return trimmed;
};

export const EXCEL_STYLES = {
  quotationTitle: {
    font: { name: 'Segoe UI', sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '4F46E5' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  catalogTitle: {
    font: { name: 'Segoe UI', sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '312E81' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  metaLabel: {
    font: { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: '374151' } },
    fill: { fgColor: { rgb: 'F3F4F6' } },
    alignment: { horizontal: 'right', vertical: 'center' },
  },
  metaValue: {
    font: { name: 'Segoe UI', sz: 10, color: { rgb: '111827' } },
    alignment: { horizontal: 'right', vertical: 'center' },
  },
  quotationHeader: {
    font: { name: 'Segoe UI', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E1B4B' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'CBD5E1' } },
      bottom: { style: 'medium', color: { rgb: '4F46E5' } },
    },
  },
  catalogHeader: {
    font: { name: 'Segoe UI', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E1B4B' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  quotationCell: {
    font: { name: 'Segoe UI', sz: 10, color: { rgb: '1F2937' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } },
  },
  catalogCell: {
    font: { name: 'Segoe UI', sz: 10, color: { rgb: '1F2937' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  quotationMoney: {
    font: { name: 'Consolas', sz: 10, bold: true, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '#,##0.00',
    border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } },
  },
  catalogMoney: {
    font: { name: 'Consolas', sz: 10, bold: true, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '#,##0.00',
  },
  total: {
    font: { name: 'Segoe UI', sz: 12, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '059669' } },
    alignment: { horizontal: 'right', vertical: 'center' },
  },
};
