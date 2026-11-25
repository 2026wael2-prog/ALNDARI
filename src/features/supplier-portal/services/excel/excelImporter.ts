import { normalizeOem } from '../../../../core/utils/oemNormalization';
import type { ExcelImportRow, ItemAvailability, VendorProductItem } from '../../types';
import { loadXLSX, readExcelCell } from './excelShared';

const normalizeArabicHeader = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/ة/g, 'ه');

const detectHeaderRowIndex = (rawRows: unknown[][]): number => {
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i];
    if (!row || !Array.isArray(row)) continue;
    const rowText = row
      .map(cell =>
        readExcelCell(cell)
          .toLowerCase()
          .replace(/[\u064B-\u065F]/g, '')
      )
      .join(' ');
    const hasPrice =
      rowText.includes('سعر') ||
      rowText.includes('price') ||
      rowText.includes('cost') ||
      rowText.includes('تكلفة') ||
      rowText.includes('تكلفه');
    const hasQty =
      rowText.includes('كمية') ||
      rowText.includes('كميه') ||
      rowText.includes('العدد') ||
      rowText.includes('qty') ||
      rowText.includes('quantity');
    if (hasPrice && hasQty) return i;
  }
  return 0;
};

const matchVendorProduct = (
  existingProducts: VendorProductItem[],
  rowId: string,
  rowOem: string,
  rowSku: string
): VendorProductItem | undefined => {
  if (rowId) {
    const byId = existingProducts.find(p => p.product_id === rowId || p.id === rowId);
    if (byId) return byId;
  }
  if (rowOem) {
    const normalizedRowOem = normalizeOem(rowOem);
    const byOem = existingProducts.find(
      p => p.oem_number && normalizeOem(p.oem_number) === normalizedRowOem
    );
    if (byOem) return byOem;
  }
  if (rowSku) {
    const lowerSku = rowSku.toLowerCase();
    return existingProducts.find(
      p =>
        (p.vendor_sku && p.vendor_sku.toLowerCase() === lowerSku) ||
        (p.sku && p.sku.toLowerCase() === lowerSku)
    );
  }
  return undefined;
};

/**
 * Parses and validates an uploaded Excel file for quotation import (SEC-04 Hardened)
 */
export const parseQuotationExcel = async (
  file: File,
  existingProducts: VendorProductItem[]
): Promise<ExcelImportRow[]> => {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('حجم الملف كبير جداً. الحد الأقصى المسموح به هو 5 ميجابايت.');
  }

  const XLSX = await loadXLSX();
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellFormula: false, cellHTML: false });
  const firstSheetName = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheetName];

  if (!ws) {
    throw new Error('الملف فارغ أو لا يحتوي على أوراق صالحة.');
  }

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (rawRows.length < 2) {
    throw new Error('الملف لا يحتوي على بيانات كافية.');
  }

  const headerIndex = detectHeaderRowIndex(rawRows);
  const headers = rawRows[headerIndex].map(readExcelCell);
  const dataRows = rawRows.slice(headerIndex + 1);

  const findCol = (keywords: string[]) =>
    headers.findIndex(h => {
      const normalizedH = normalizeArabicHeader(h);
      return keywords.some(k => normalizedH.includes(normalizeArabicHeader(k)));
    });

  const cellAt = (row: unknown[], col: number): string => (col >= 0 ? readExcelCell(row[col]) : '');

  const idCol = findCol(['معرف', 'product_id', 'id']);
  const nameCol = findCol(['اسم', 'name', 'product', 'item', 'وصف', 'description']);
  const oemCol = findCol(['oem', 'رقم القطعة', 'part_number', 'part number', 'part']);
  const skuCol = findCol(['sku', 'كود', 'vendor_sku']);
  const qtyCol = findCol(['كمية', 'qty', 'quantity', 'عدد']);
  const priceCol = findCol(['سعر', 'price', 'unit_price', 'cost', 'تكلفة']);
  const discCol = findCol(['خصم', 'discount', 'discount%']);
  const taxCol = findCol(['ضريبة', 'tax', 'vat']);
  const availCol = findCol(['توفر', 'availability', 'حالة']);
  const leadCol = findCol(['توريد', 'lead', 'delivery', 'ايام']);
  const warrantyCol = findCol(['ضمان', 'warranty']);
  const notesCol = findCol(['ملاحظات', 'notes', 'remarks']);

  const parsedRows: ExcelImportRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    if (!r || r.length === 0) continue;

    const rowId = cellAt(r, idCol);
    const rowName = cellAt(r, nameCol);
    const rowOem = cellAt(r, oemCol);
    const rowSku = cellAt(r, skuCol);
    if (!rowId && !rowName && !rowOem && !rowSku) continue;

    const rawQty = qtyCol >= 0 ? Number(r[qtyCol]) : 1;
    const rawPrice = priceCol >= 0 ? Number(r[priceCol]) : 0;
    const rawDisc = discCol >= 0 ? Number(r[discCol]) : 0;
    const rawTax = taxCol >= 0 ? Number(r[taxCol]) : 0;

    const parsedQty = isNaN(rawQty) || rawQty <= 0 ? 1 : rawQty;
    const parsedPrice = isNaN(rawPrice) || rawPrice < 0 ? 0 : rawPrice;
    const parsedDisc = isNaN(rawDisc) || rawDisc < 0 ? 0 : Math.min(rawDisc, 100);
    const parsedTax = isNaN(rawTax) || rawTax < 0 ? 0 : rawTax;

    const matchedProduct = matchVendorProduct(existingProducts, rowId, rowOem, rowSku);

    const availabilityRaw = cellAt(r, availCol).toLowerCase();
    const validAvailability: ItemAvailability =
      availabilityRaw === 'on_order' ||
      availabilityRaw === 'unavailable' ||
      availabilityRaw === 'partial'
        ? availabilityRaw
        : 'in_stock';

    const rowObj: ExcelImportRow = {
      rowNumber: i + 1,
      rawProductIdentifier: rowId || rowSku || rowName || '',
      quantity: parsedQty,
      unitPrice: parsedPrice,
      discountPercentage: parsedDisc,
      taxPercentage: parsedTax,
      availability: validAvailability,
      leadTimeDays: leadCol >= 0 ? Number(r[leadCol]) || 0 : 0,
      warrantyDays: warrantyCol >= 0 ? Number(r[warrantyCol]) || 0 : 0,
      matchStatus: parsedPrice <= 0 ? 'invalid_price' : matchedProduct ? 'matched' : 'unmatched',
    };
    if (rowOem) rowObj.rawPartNumber = rowOem;
    if (rowSku) rowObj.rawVendorSku = rowSku;
    if (rowName) rowObj.rawProductName = rowName;
    const notesText = cellAt(r, notesCol);
    if (notesText !== '') rowObj.notes = notesText;
    if (matchedProduct) {
      rowObj.matchedProduct = {
        id: matchedProduct.product_id,
        name: matchedProduct.product_name,
        part_number: matchedProduct.oem_number || null,
        sku: matchedProduct.sku,
      };
    }
    if (parsedPrice <= 0) {
      rowObj.validationError = 'سعر الوحدة صفر أو غير محدد';
    }

    parsedRows.push(rowObj);
  }

  return parsedRows;
};
