import {
  appendSheetToWorkbook,
  buildStyledSheet,
  enableWorkbookRtl,
  loadXLSX,
  resolvePalette,
  saveWorkbookToFile,
  workbookToBlob,
  type ExcelMergeRange,
  type XlsxWorkbook,
} from '../../../core/utils/excelExporterBase';
import { formatLocalDate } from '../../../core/utils/dateUtils';
import type { IntelligenceEngineOutput } from '../types';

function addStyledTableSheet(
  XLSX: Awaited<ReturnType<typeof loadXLSX>>,
  wb: XlsxWorkbook,
  sheetName: string,
  companyName: string,
  title: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  accentHex: string
): void {
  const palette = resolvePalette({
    accent: accentHex,
    titleFill: accentHex,
    headerFill: accentHex,
    headerFont: 'FFFFFF',
    subtitleFill: 'EFF6FF',
    alternateFill: 'F8FAFC',
    border: 'CBD5E1',
  });

  const colCount = Math.max(headers.length, 1);
  const sheetData: unknown[][] = [
    [companyName],
    [title],
    [`تاريخ الدراسة: ${formatLocalDate()}`, '', `عدد السجلات: ${rows.length}`],
    [],
    headers,
    ...rows,
  ];

  const colWidths = headers.map(h => Math.max(h.length + 6, 14));
  const merges: ExcelMergeRange[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
  ];

  const ws = buildStyledSheet(XLSX, sheetData, {
    colWidths,
    autoFitWidths: true,
    merges,
    styling: {
      palette,
      companyRow: 0,
      subHeaderRows: [1, 1],
      metaRows: [2, 2],
      metaKeyColumns: [0, 2],
      tableHeaderRow: 4,
      alternate: {
        startRow: 4,
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

  appendSheetToWorkbook(XLSX, wb, ws, sheetName);
}

export async function buildExecutiveStudyWorkbook(
  output: IntelligenceEngineOutput,
  companyName = 'منظومة النظاري لقطع الغيار'
): Promise<{ wb: XlsxWorkbook; fileName: string }> {
  const XLSX = await loadXLSX();
  const wb: XlsxWorkbook = XLSX.utils.book_new();
  enableWorkbookRtl(wb);
  const productMap = new Map(output.products.map(p => [p.identity.productId, p]));

  const k = output.overviewKpis;
  addStyledTableSheet(
    XLSX,
    wb,
    'الملخص التنفيذي',
    companyName,
    'الدراسة التنفيذية الشاملة لذكاء المخزون والفروع',
    ['المؤشر', 'القيمة', 'التفاصيل'],
    [
      ['إجمالي الأصناف المحللة', k.totalAnalyzedProducts, 'على مستوى الشركة والفروع'],
      ['أصناف تتطلب شراءً فورياً', k.productsRequiringPurchase, 'توصيات الشراء الصافية بعد التحويلات'],
      ['أصناف مهددة بالنفاد', k.productsApproachingStockout, 'تغطية أقل من مدة التوريد'],
      ['نافدة في جميع الفروع', k.zeroStockAcrossAllBranches, 'أصناف عليها طلب فعلي ورصيدها صفر'],
      ['فرص التحويل الداخلي', k.pendingTransferCount, 'تغطية العجز من فائض الفروع الأخرى'],
      ['قيمة الوفورات بالتحويل', Number(k.estimatedTransferCapitalSaved.toFixed(2)), 'رأس مال تم توفيره قبل الشراء الخارجي'],
      ['التكلفة التقديرية للشراء', Number(k.estimatedRecommendedPurchaseValue.toFixed(2)), 'إجمالي تكلفة أوامر الشراء المقترحة'],
      ['أصناف راكدة', k.deadStockCount, 'لم تتحرك خلال فترة الركود'],
      ['قيمة المخزون الراكد والفائض', Number(k.totalExcessInventoryValue.toFixed(2)), 'رأس مال مجمد قابل للتصفية أو التحويل'],
    ],
    '1E40AF'
  );

  addStyledTableSheet(
    XLSX,
    wb,
    'توصيات الشراء',
    companyName,
    'خطة المشتريات الصافية وتفاصيل الموردين',
    [
      'الأولوية',
      'الاسم',
      'اسم القطعة',
      'المقاس',
      'SKU',
      'المتاح',
      'الطلب 30ي',
      'نقطة الطلب',
      'الكمية الموصى بها',
      'التكلفة التقديرية',
      'المورد المرشح',
      'أهم عميل',
    ],
    output.purchaseRecommendations.slice(0, 300).map(r => {
      const prod = productMap.get(r.productId);
      return [
        r.urgency,
        r.productName,
        prod?.identity.partType ?? '—',
        prod?.identity.size ?? '—',
        r.sku,
        r.availableStock,
        Number((r.forecastDemand30d || 0).toFixed(1)),
        r.reorderPoint,
        r.recommendedQty,
        Number((r.estimatedCost || 0).toFixed(2)),
        r.recommendedSupplier?.supplierName ?? '—',
        prod?.topCustomers[0]?.customerName ?? '—',
      ];
    }),
    '065F46'
  );

  addStyledTableSheet(
    XLSX,
    wb,
    'التحويلات الداخلية',
    companyName,
    'خطة إعادة توزيع المخزون بين الفروع',
    ['الصنف', 'SKU', 'من فرع', 'إلى فرع', 'الكمية الموصى بها', 'الوفر المالي', 'السبب'],
    output.transferRecommendations.slice(0, 300).map(t => [
      t.productName,
      t.sku,
      t.fromBranchName,
      t.toBranchName,
      t.recommendedQty,
      Number(t.capitalSaved.toFixed(2)),
      t.reason,
    ]),
    '3730A3'
  );

  addStyledTableSheet(
    XLSX,
    wb,
    'الراكد والفائض',
    companyName,
    'دراسة المخزون الراكد والبطيء والفائض',
    ['التصنيف', 'الصنف', 'SKU', 'المتاح', 'قيمة المخزون', 'أيام بدون بيع', 'الإجراء المقترح'],
    output.deadExcessRecommendations.slice(0, 300).map(d => [
      d.classification,
      d.productName,
      d.sku,
      d.currentStock,
      Number((d.stockValue || 0).toFixed(2)),
      d.daysSinceLastSale ?? '—',
      d.recommendedAction,
    ]),
    '9A3412'
  );

  addStyledTableSheet(
    XLSX,
    wb,
    'تحليل الفروع والتنبؤ',
    companyName,
    'تحليل الطلب والتنبؤ والأبعاد الستة للأصناف',
    [
      'الاسم',
      'اسم القطعة',
      'المقاس',
      'الماركة',
      'التصنيف الحركي',
      'المتاح الكلي',
      'مبيعات 365ي',
      'توقع 30ي',
      'المورد الرئيسي',
      'أهم عميل',
      'قيمة المخزون',
    ],
    output.products.slice(0, 300).map(p => [
      p.identity.name,
      p.identity.partType,
      p.identity.size,
      p.identity.brand,
      p.movementClass,
      p.companyMetrics.availableStock,
      p.companyMetrics.qty365d,
      Number(p.forecast30d.predictedQty.toFixed(1)),
      p.suppliers[0]?.supplierName ?? p.lastSupplier?.supplierName ?? '—',
      p.topCustomers[0]?.customerName ?? '—',
      Number(p.companyMetrics.stockValue.toFixed(2)),
    ]),
    '1E3A8A'
  );

  const fileName = `دراسة_ذكاء_المخزون_${formatLocalDate()}.xlsx`;
  return { wb, fileName };
}

export async function exportExecutiveStudyExcel(
  output: IntelligenceEngineOutput,
  companyName?: string
): Promise<string> {
  const { wb, fileName } = await buildExecutiveStudyWorkbook(output, companyName);
  await saveWorkbookToFile(wb, fileName);
  return fileName;
}

export async function exportExecutiveStudyExcelBase64(
  output: IntelligenceEngineOutput,
  companyName?: string
): Promise<{ base64: string; fileName: string }> {
  const { wb, fileName } = await buildExecutiveStudyWorkbook(output, companyName);
  const blob = await workbookToBlob(wb);
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return { base64: btoa(binary), fileName };
}
