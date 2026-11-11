/**
 * queueExcelExporter — تصدير طابور التحصيل ورقةَ Excel منمّقة (xlsx-js-style).
 *
 * يُبنى على `excelExporterBase` المشترك (lazy-load + حدود + رأس أزرق + RTL)
 * فلا يكرّر التنسيق ولا يُدخل المكتبة الثقيلة في الحزمة الابتدائية.
 *
 * قاعدة محاسبية: عمود «المبلغ» يُكتب بعملته، وكل مجموع في الورقة يُحسب على
 * «المبلغ بالعملة الأساس» الذي يحوّله الخادم — لا جمع عملات مختلفة.
 */
import {
  appendSheetToWorkbook,
  buildStyledSheet,
  loadXLSX,
  saveWorkbookToFile,
} from '../../../core/utils/excelExporterBase';
import type { ExcelMergeRange } from '../../../core/utils/excelExporterBase';
import { formatLocalDate } from '../../../core/utils/dateUtils';
import { coverageShare, queueTaskLabel, summarizeQueue } from './queueGrid';
import { escalationLabel } from './constants';
import type { DebtPriorityQueueRow } from '../types';

/** أعمدة الورقة بالترتيب (16 عموداً) — مصدر واحد للرأس والعرض والتنسيق. */
const HEADER: readonly string[] = [
  '#',
  'الدرجة',
  'العميل',
  'الهاتف',
  'نوع المهمة',
  'المبلغ',
  'العملة',
  'المبلغ بالعملة الأساس',
  'الحصة %',
  'أيام التأخير',
  'منذ آخر تواصل',
  'التصعيد',
  'المسؤول',
  'المرجع',
  'الأمر التالي',
  'أسباب الدرجة',
];

const COLUMN_COUNT = HEADER.length;
const LAST_COL = COLUMN_COUNT - 1;
const TITLE_ROW = 1;
const META_ROW = 2;
const HEADER_ROW = 3;
const FIRST_DATA_ROW = 4;

const WIDTHS: readonly number[] = [5, 7, 30, 14, 14, 13, 7, 17, 8, 10, 12, 9, 14, 16, 38, 26];

export interface QueueExcelMeta {
  companyName: string;
  bucketLabel: string;
  baseCurrency: string;
  /** وصف الفلاتر المطبقة (يُكتب في صف البيانات الوصفية للتوثيق). */
  filtersLabel: string;
}

/** صف بطول ثابت: يمنع اختلال الأعمدة عند دمج صفوف العناوين. */
const padRow = (cells: unknown[]): unknown[] => {
  const padded = [...cells];
  while (padded.length < COLUMN_COUNT) padded.push('');
  return padded;
};

const contactText = (days: number | null): string | number => {
  if (days === null) return 'لا سجل';
  return days;
};

/** صف بيانات واحد: أرقام حقيقية كي تعمل صيغ Excel والفرز عليها. */
const dataRow = (row: DebtPriorityQueueRow, index: number, baseTotal: number): unknown[] =>
  padRow([
    index + 1,
    row.priority_score,
    row.party_name,
    row.party_phone ?? '',
    queueTaskLabel(row.task_type),
    row.amount ?? '',
    row.currency_code ?? '',
    row.amount_base,
    coverageShare(row.amount_base, baseTotal),
    row.days_late,
    contactText(row.days_since_contact),
    row.escalation_stage === null ? '' : escalationLabel(row.escalation_stage),
    row.assigned_name ?? '',
    row.reference_info ?? '',
    row.next_action,
    (row.score_drivers ?? []).join(' • '),
  ]);

const titleRow = (meta: QueueExcelMeta): unknown[] =>
  padRow([meta.companyName === '' ? 'طابور التحصيل' : meta.companyName]);

const subTitleRow = (meta: QueueExcelMeta): unknown[] =>
  padRow([`طابور التحصيل بالأهمية — ${meta.bucketLabel}`]);

const metaRow = (meta: QueueExcelMeta, rows: DebtPriorityQueueRow[]): unknown[] => {
  const summary = summarizeQueue(rows);
  return padRow([
    'التاريخ',
    formatLocalDate(),
    'العملة الأساس',
    meta.baseCurrency,
    'عدد المهام',
    summary.count,
    'إجمالي المبالغ',
    summary.baseTotal,
    'منها متأخر',
    summary.overdueBaseTotal,
    'المرشحات',
    meta.filtersLabel,
  ]);
};

const totalsRow = (rows: DebtPriorityQueueRow[]): unknown[] => {
  const summary = summarizeQueue(rows);
  return padRow([
    'الإجمالي',
    summary.avgScore,
    `${String(summary.count)} مهمة`,
    '',
    '',
    '',
    '',
    summary.baseTotal,
    100,
    summary.avgDaysLate,
    '',
    '',
    '',
    '',
    'متوسط الدرجة وأيام التأخير في عمودَي «الدرجة» و«أيام التأخير»',
    '',
  ]);
};

const mergedRange = (row: number): ExcelMergeRange => ({
  s: { r: row, c: 0 },
  e: { r: row, c: LAST_COL },
});

/** يبني ورقة منمّقة واحدة ويحفظها كملف xlsx (RTL + مجاميع + تجميد رأس). */
export const exportQueueToExcel = async (
  rows: DebtPriorityQueueRow[],
  meta: QueueExcelMeta
): Promise<void> => {
  const XLSX = await loadXLSX();
  const lastDataRow = FIRST_DATA_ROW + rows.length - 1;
  const totalRow = lastDataRow + 1;
  const baseTotal = summarizeQueue(rows).baseTotal;

  const aoa: unknown[][] = [
    titleRow(meta),
    subTitleRow(meta),
    metaRow(meta, rows),
    padRow([...HEADER]),
    ...rows.map((row, index) => dataRow(row, index, baseTotal)),
    totalsRow(rows),
  ];

  const sheet = buildStyledSheet(XLSX, aoa, {
    colWidths: [...WIDTHS],
    // صفوف العناوين فقط تُدمج — صف الإجمالي لا يُدمج وإلا ضاعت أرقامه.
    merges: [mergedRange(0), mergedRange(TITLE_ROW), mergedRange(META_ROW)],
    styling: {
      companyRow: 0,
      subHeaderRows: [TITLE_ROW, TITLE_ROW],
      metaRows: [META_ROW, META_ROW],
      metaKeyColumns: [0, 2, 4, 6, 8, 10],
      tableHeaderRow: HEADER_ROW,
      alternate: { startRow: FIRST_DATA_ROW, endRow: lastDataRow, parity: 'odd' },
      integerColumns: [0, 1, 9, 10],
      numericColumns: [5, 7],
      summaryRows: [totalRow, totalRow],
      summaryKeyCol: 0,
      summaryValueCol: 7,
      columnCount: COLUMN_COUNT,
    },
  });

  const wb = XLSX.utils.book_new();
  appendSheetToWorkbook(XLSX, wb, sheet, 'طابور التحصيل');
  await saveWorkbookToFile(wb, `طابور_التحصيل_${meta.bucketLabel}_${formatLocalDate()}_${String(rows.length)}`);
};
