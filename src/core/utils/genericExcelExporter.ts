import {
  loadXLSX,
  buildStyledSheet,
  appendSheetToWorkbook,
  saveWorkbookToFile,
  resolvePalette,
  type ExcelPalette,
  type ExcelMergeRange,
  type XlsxWorkbook,
} from './excelExporterBase';
import { formatLocalDate } from './dateUtils';

export interface GenericExcelTableExportOptions {
  title: string;
  subtitle?: string | undefined;
  companyName?: string | undefined;
  headers: string[];
  rows: Array<Array<string | number | boolean | null | undefined>>;
  fileName?: string | undefined;
  colorTheme?: 'blue' | 'green' | 'orange' | 'indigo' | string | undefined;
}

const THEME_PALETTES: Record<string, Partial<ExcelPalette>> = {
  blue: {
    accent: '1E40AF',
    titleFill: '1E40AF',
    subtitleFill: 'DBEAFE',
    headerFill: '1E40AF',
    headerFont: 'FFFFFF',
    alternateFill: 'EFF6FF',
    border: 'BFDBFE',
  },
  green: {
    accent: '065F46',
    titleFill: '065F46',
    subtitleFill: 'D1FAE5',
    headerFill: '065F46',
    headerFont: 'FFFFFF',
    alternateFill: 'ECFDF5',
    border: 'A7F3D0',
  },
  orange: {
    accent: '9A3412',
    titleFill: '9A3412',
    subtitleFill: 'FFEDD5',
    headerFill: '9A3412',
    headerFont: 'FFFFFF',
    alternateFill: 'FFF7ED',
    border: 'FED7AA',
  },
  indigo: {
    accent: '3730A3',
    titleFill: '3730A3',
    subtitleFill: 'E0E7FF',
    headerFill: '3730A3',
    headerFont: 'FFFFFF',
    alternateFill: 'EEF2FF',
    border: 'C7D2FE',
  },
};

/**
 * دالة عامة احترافية لتصدير أي جدول بيانات في المنظومة إلى ملف Excel (.xlsx) فائق الأناقة
 * مع تفعيل RTL تلقائياً، وشبكة كاملة، وترويسة رسمية، وعرض تلقائي متجاوب للأعمدة.
 */
export const exportGenericTableToExcel = async (
  options: GenericExcelTableExportOptions
): Promise<void> => {
  const XLSX = await loadXLSX();
  const wb: XlsxWorkbook = XLSX.utils.book_new();

  const {
    title,
    subtitle,
    companyName = 'منظومة النظاري لقطع الغيار',
    headers,
    rows: dataRows,
    fileName,
    colorTheme = 'indigo',
  } = options;

  const colCount = Math.max(headers.length, 1);
  const selectedTheme = THEME_PALETTES[colorTheme] ?? THEME_PALETTES.indigo;
  const palette = resolvePalette(selectedTheme);

  const sheetData: unknown[][] = [];

  // 1. ترويسة المنشأة واسم التقرير
  sheetData.push([companyName]);
  sheetData.push([title]);
  
  const metaLine = [
    `تاريخ التقرير: ${formatLocalDate()}`,
    '',
    subtitle ? `ملاحظة: ${subtitle}` : '',
    '',
    `عدد السجلات: ${dataRows.length}`,
  ];
  sheetData.push(metaLine);
  sheetData.push([]); // صف فارغ فاصل

  // 2. ترويسة الأعمدة
  const tableHeaderRowIndex = sheetData.length;
  sheetData.push(headers);

  // 3. صفوف البيانات مع تنظيف القيم
  dataRows.forEach(r => {
    const cleanedRow = r.map(cell => {
      if (cell === null || cell === undefined) return '';
      return cell;
    });
    sheetData.push(cleanedRow);
  });

  const lastColIdx = colCount - 1;
  const merges: ExcelMergeRange[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColIdx } }, // اسم الشركة
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastColIdx } }, // عنوان التقرير
  ];

  // ترويسة عريضة محسوبة حسب المحتوى
  const baseColWidths = headers.map(h => Math.max(h.length + 6, 14));

  const ws = buildStyledSheet(XLSX, sheetData, {
    colWidths: baseColWidths,
    autoFitWidths: true,
    merges,
    styling: {
      palette,
      companyRow: 0,
      subHeaderRows: [1, 1],
      metaRows: [2, 2],
      metaKeyColumns: [0, 2, 4],
      tableHeaderRow: tableHeaderRowIndex,
      alternate: {
        startRow: tableHeaderRowIndex,
        parity: 'even',
      },
      columnCount: colCount,
      bandRows: [
        {
          row: 0,
          fill: palette.titleFill,
          fontColor: 'FFFFFF',
          fontSize: 15,
          bold: true,
          height: 30,
        },
        {
          row: 1,
          fill: palette.subtitleFill,
          fontColor: palette.accent,
          fontSize: 13,
          bold: true,
          height: 24,
        },
      ],
    },
  });

  const cleanSheetName = title.slice(0, 28).replace(/[\\/:*?[\]]/g, '') || 'البيانات';
  appendSheetToWorkbook(XLSX, wb, ws, cleanSheetName);

  const outFileName = fileName?.trim()
    ? fileName
    : `${title.replace(/\s+/g, '_')}_${formatLocalDate()}.xlsx`;

  await saveWorkbookToFile(wb, outFileName);
};
