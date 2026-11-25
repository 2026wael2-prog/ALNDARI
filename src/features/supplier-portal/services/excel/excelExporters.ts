import { formatLocalDate } from '../../../../core/utils/dateUtils';
import type { QuotationItemDraft, VendorProductItem } from '../../types';
import {
  EXCEL_STYLES,
  loadXLSX,
  sanitizeExcelValue,
  type XlsxStyledCell,
} from './excelShared';

export interface ExportQuotationExcelOptions {
  companyName: string;
  supplierName: string;
  quotationNumber?: string;
  rfqNumber?: string;
  currency: string;
  items: QuotationItemDraft[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  deliveryDays?: number;
}

const QUOTATION_COLUMNS = [
  '#',
  'معرف الصنف',
  'اسم المنتج / القطعة',
  'رقم القطعة / OEM',
  'كود المورد SKU',
  'الكمية',
  'الوحدة',
  'سعر الوحدة',
  'نسبة الخصم %',
  'الإجمالي',
  'حالة التوفر',
  'الضمان (أيام)',
  'ملاحظات المورد',
];

const QUOTATION_COL_WIDTHS = [
  { wch: 5 },
  { wch: 15 },
  { wch: 30 },
  { wch: 18 },
  { wch: 15 },
  { wch: 8 },
  { wch: 8 },
  { wch: 14 },
  { wch: 12 },
  { wch: 16 },
  { wch: 14 },
  { wch: 12 },
  { wch: 25 },
];

/**
 * Generates and downloads a professional, styled Excel Workbook (SEC-04 Sanitized)
 */
export const exportQuotationToExcel = async (
  options: ExportQuotationExcelOptions
): Promise<void> => {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const { quotationTitle, metaLabel, metaValue, quotationHeader, quotationCell, quotationMoney, total } =
    EXCEL_STYLES;

  const wsData: XlsxStyledCell[][] = [
    [{ v: sanitizeExcelValue(`عرض أسعار وتوريد - ${options.companyName}`), s: quotationTitle }],
    [],
    [
      { v: 'المورد:', s: metaLabel },
      { v: sanitizeExcelValue(options.supplierName), s: metaValue },
      { v: 'رقم العرض:', s: metaLabel },
      { v: sanitizeExcelValue(options.quotationNumber || 'مسودة'), s: metaValue },
    ],
    [
      { v: 'العملة:', s: metaLabel },
      { v: sanitizeExcelValue(options.currency), s: metaValue },
      { v: 'رقم طلب التسعير RFQ:', s: metaLabel },
      { v: sanitizeExcelValue(options.rfqNumber || '---'), s: metaValue },
    ],
    [
      { v: 'مدة التوريد (أيام):', s: metaLabel },
      { v: `${Math.max(0, options.deliveryDays || 0)} يوم`, s: metaValue },
      { v: 'تاريخ المستند:', s: metaLabel },
      { v: formatLocalDate(), s: metaValue },
    ],
    [],
    QUOTATION_COLUMNS.map(c => ({ v: c, s: quotationHeader })),
  ];

  options.items.forEach((item, index) => {
    const availabilityLabel =
      item.availability === 'in_stock'
        ? 'متوفر'
        : item.availability === 'on_order'
          ? 'تحت الطلب'
          : 'غير متوفر';

    wsData.push([
      { v: index + 1, s: quotationCell },
      { v: sanitizeExcelValue(item.product_id), s: quotationCell },
      {
        v: sanitizeExcelValue(item.product_name),
        s: { ...quotationCell, alignment: { horizontal: 'right' } },
      },
      {
        v: sanitizeExcelValue(item.oem_number || '---'),
        s: { ...quotationCell, font: { name: 'Consolas', sz: 10 } },
      },
      { v: sanitizeExcelValue(item.vendor_sku || '---'), s: quotationCell },
      { v: Math.max(0, Number(item.quantity) || 1), s: quotationCell },
      { v: sanitizeExcelValue(item.unit_of_measure), s: quotationCell },
      { v: Math.max(0, Number(item.unit_price) || 0), s: quotationMoney },
      { v: Math.min(100, Math.max(0, Number(item.discount_percentage) || 0)), s: quotationCell },
      { v: Math.max(0, Number(item.total_price) || 0), s: quotationMoney },
      { v: availabilityLabel, s: quotationCell },
      { v: Math.max(0, Number(item.warranty_days) || 0), s: quotationCell },
      {
        v: sanitizeExcelValue(item.vendor_notes || ''),
        s: { ...quotationCell, alignment: { horizontal: 'right' } },
      },
    ]);
  });

  wsData.push([]);
  wsData.push([
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    { v: 'المجموع الفرعي:', s: metaLabel },
    {},
    { v: Math.max(0, options.subtotal), s: quotationMoney },
  ]);
  wsData.push([
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    { v: 'الإجمالي النهائي:', s: total },
    {},
    { v: Math.max(0, options.totalAmount), s: total },
  ]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: QUOTATION_COLUMNS.length - 1 } }];
  ws['!cols'] = QUOTATION_COL_WIDTHS;

  XLSX.utils.book_append_sheet(wb, ws, 'عرض السعر');
  wb.Workbook = { Views: [{ RTL: true }] };

  const filename = `${options.quotationNumber || 'Quotation'}_${formatLocalDate()}.xlsx`;
  XLSX.writeFile(wb, filename);
};

export interface ExportCatalogExcelOptions {
  companyName: string;
  currency: string;
  products: VendorProductItem[];
}

const CATALOG_COLUMNS = [
  '#',
  'معرف الصنف Product ID',
  'اسم المنتج / الصنف',
  'رقم القطعة OEM',
  'كود المورد SKU',
  'الفئة',
  'العلامة التجارية',
  'الكمية المتوفرة',
  'سعر التكلفة',
  'مدة التوريد (أيام)',
  'الوحدة',
];

const CATALOG_COL_WIDTHS = [
  { wch: 6 },
  { wch: 18 },
  { wch: 32 },
  { wch: 20 },
  { wch: 16 },
  { wch: 16 },
  { wch: 16 },
  { wch: 14 },
  { wch: 14 },
  { wch: 14 },
  { wch: 10 },
];

/**
 * Generates and downloads the Product Catalog Excel Workbook
 */
export const exportProductCatalogToExcel = async (
  options: ExportCatalogExcelOptions
): Promise<void> => {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const { catalogTitle, catalogHeader, catalogCell, catalogMoney } = EXCEL_STYLES;

  const wsData: XlsxStyledCell[][] = [
    [{ v: sanitizeExcelValue(`كتالوج الأصناف المعتمدة - ${options.companyName}`), s: catalogTitle }],
    [],
    CATALOG_COLUMNS.map(c => ({ v: c, s: catalogHeader })),
  ];

  options.products.forEach((p, idx) => {
    wsData.push([
      { v: idx + 1, s: catalogCell },
      { v: sanitizeExcelValue(p.product_id), s: catalogCell },
      {
        v: sanitizeExcelValue(p.product_name),
        s: { ...catalogCell, alignment: { horizontal: 'right' } },
      },
      {
        v: sanitizeExcelValue(p.oem_number || '---'),
        s: { ...catalogCell, font: { name: 'Consolas', sz: 10 } },
      },
      { v: sanitizeExcelValue(p.vendor_sku || '---'), s: catalogCell },
      { v: sanitizeExcelValue(p.category || 'عام'), s: catalogCell },
      { v: sanitizeExcelValue(p.brand || '---'), s: catalogCell },
      { v: p.stock_quantity, s: catalogCell },
      { v: p.cost_price, s: catalogMoney },
      { v: p.lead_time_days || 3, s: catalogCell },
      { v: sanitizeExcelValue(p.unit), s: catalogCell },
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: CATALOG_COLUMNS.length - 1 } }];
  ws['!cols'] = CATALOG_COL_WIDTHS;

  XLSX.utils.book_append_sheet(wb, ws, 'كتالوج المنتجات');
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(wb, `Product_Catalog_${formatLocalDate()}.xlsx`);
};
