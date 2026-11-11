// ============================================
// نموذج طباعة الفاتورة — منطق خالص بلا JSX
// ============================================
// يفصل تحويل صف الفاتورة القادم من الـAPI عن قالب الطباعة، فيبقى القالب مسؤولاً
// عن العرض فقط. هذا الملف هو الموضع الوحيد المسموح فيه بتفسير القيم النصية
// القادمة من قاعدة البيانات (numeric تعود كنص عبر PostgREST أحياناً).

import { formatLocalDate } from '@/core/utils/dateUtils';
import {
  type DisplayableItemInput,
  getDisplayItemCode,
  getDisplayItemName,
} from '@/core/utils/productUtils';
import { tafqeet } from '@/core/utils/tafqeet';
import type { DocumentHeaderMeta } from '../PrintDocumentHeader';
import { firstNonEmpty, type InvoiceCompanyInfo } from './companyHeader';

/** نسبة ضريبة القيمة المضافة المعتمدة (15%) — المصدر الوحيد للرقم. */
const VAT_RATE = 15;
const VAT_DENOMINATOR = 100 + VAT_RATE;

/** صف بند فاتورة كما يعود من الـAPI (الحقول اختيارية لأن المصادر متعددة). */
export interface InvoiceRawItem extends DisplayableItemInput {
  id?: string | null | undefined;
  quantity?: number | string | null | undefined;
  price?: number | string | null | undefined;
  unit_price?: number | string | null | undefined;
  discount?: number | string | null | undefined;
  tax_amount?: number | string | null | undefined;
  total?: number | string | null | undefined;
}

/** الفاتورة كما تصل إلى قالب الطباعة. */
export interface PrintableInvoiceSource {
  company?: InvoiceCompanyInfo | null | undefined;
  invoice_number?: string | null | undefined;
  issue_date?: string | null | undefined;
  due_date?: string | null | undefined;
  party_name?: string | null | undefined;
  party_tax_number?: string | null | undefined;
  party_phone?: string | null | undefined;
  party_address?: string | null | undefined;
  items?: InvoiceRawItem[] | null | undefined;
  subtotal?: number | string | null | undefined;
  discount_amount?: number | string | null | undefined;
  tax_amount?: number | string | null | undefined;
  total_amount?: number | string | null | undefined;
  paid_amount?: number | string | null | undefined;
  currency_code?: string | null | undefined;
  payment_method?: string | null | undefined;
  branch_name?: string | null | undefined;
  issuedBy?: string | null | undefined;
  type?: string | null | undefined;
}

/** بند جاهز للطباعة بأرقام مُتحقَّق منها. */
export interface InvoiceDisplayItem {
  id: string;
  name: string;
  sku: string;
  partNumber: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  taxAmount: number;
}

export interface InvoicePrintTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  remaining: number;
}

export interface InvoicePrintView {
  items: InvoiceDisplayItem[];
  totals: InvoicePrintTotals;
  documentMeta: DocumentHeaderMeta;
  currencyCode: string;
  currencyUnit: string;
  amountInWords: string;
  zatcaTimestamp: string;
  isReturn: boolean;
  paymentLabel: string;
  partyName: string;
  partyTaxNumber: string;
  partyPhone: string;
  partyAddress: string;
  branchName: string;
  dueDate: string;
  issuedBy: string;
}

/** الشروط الافتراضية للطباعة — قابلة للتحرير داخل الصفحة. */
export const DEFAULT_INVOICE_TERMS: readonly string[] = [
  'البضاعة المباعة ترد أو تستبدل خلال 3 أيام بشرط سلامة العبوة الأصلية.',
  'القطع الكهربائية والإلكترونية خاضعة لسياسة الفحص ولا ترد بعد التركيب.',
  'يجب إحضار أصل هذه الفاتورة عند أي استرجاع أو استبدال أو مطالبة ضمان.',
];

const asNumber = (value: number | string | null | undefined, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundTwo = (value: number): number => Math.round(value * 100) / 100;

/** هل يحمل البند اسماً قابلاً للعرض؟ (يمنع صفوفاً فارغة من الـAPI) */
const hasDisplayName = (item: InvoiceRawItem): boolean =>
  firstNonEmpty(item.name) !== '' ||
  firstNonEmpty(item.description) !== '' ||
  firstNonEmpty(item.product?.name_ar) !== '';

/**
 * يحوّل بنود الفاتورة إلى بنود طباعة: اسم محمي من UUID، رمز ورقم قطعة منفصلان،
 * وأرقام مُتحقَّق منها مع احتساب الضريبة لكل سطر من إجماليه (كما في الأصل).
 */
export const buildInvoiceDisplayItems = (
  items: InvoiceRawItem[] | null | undefined
): InvoiceDisplayItem[] =>
  (items ?? []).filter(hasDisplayName).map((item, index) => {
    const unitPrice = asNumber(item.price ?? item.unit_price);
    const quantity = asNumber(item.quantity, 1);
    const lineTotal = asNumber(item.total, unitPrice * quantity);
    return {
      id: firstNonEmpty(item.id) || String(index + 1),
      name: getDisplayItemName(item, 'صنف غير محدد'),
      sku: getDisplayItemCode(item, ''),
      partNumber: firstNonEmpty(item.part_number, item.product?.part_number, item.partNumber),
      quantity,
      unitPrice,
      lineTotal,
      taxAmount: roundTwo((lineTotal * VAT_RATE) / VAT_DENOMINATOR),
    };
  });


/**
 * إجماليات الفاتورة. تُحترم القيم المحفوظة في القاعدة إن وُجدت، وإلا تُشتق من
 * الإجمالي — بلا `Math.abs` وبلا قلب إشارة الخصم.
 */
export const computeInvoiceTotals = (source: PrintableInvoiceSource): InvoicePrintTotals => {
  const total = asNumber(source.total_amount);
  // مطابق للسلوك السابق: `undefined` فقط يعني «اشتق»، أما `null` فيعني صفراً صريحاً.
  const tax =
    source.tax_amount !== undefined
      ? asNumber(source.tax_amount)
      : roundTwo((total * VAT_RATE) / VAT_DENOMINATOR);
  const subtotal = source.subtotal !== undefined ? asNumber(source.subtotal) : total - tax;
  const discount = asNumber(source.discount_amount);
  const paid = asNumber(source.paid_amount);
  return { subtotal, discount, tax, total, paid, remaining: Math.max(0, total - paid) };
};

/** العنوان والوعد والشارة المعروضة أعلى الفاتورة. */
export const buildInvoiceDocumentMeta = (source: PrintableInvoiceSource): DocumentHeaderMeta => {
  const isReturn = source.type === 'sale_return';
  const badge = isReturn ? 'مرتجع مبيعات' : source.payment_method === 'credit' ? 'آجلة' : 'نقدية';
  return {
    titleAr: isReturn ? 'إشعار دائن (فاتورة مرتجع مبيعات)' : 'فاتورة ضريبية مبسطة',
    titleEn: isReturn ? 'Credit Note (Sales Return)' : 'Simplified Tax Invoice',
    documentNumber: firstNonEmpty(source.invoice_number) || 'INV-000',
    documentDate: firstNonEmpty(source.issue_date) || formatLocalDate(),
    badge,
  };
};

/** اسم وحدة العملة كما تُقرأ في المبلغ كتابةً. */
export const invoiceCurrencyUnit = (currencyCode: string): string => {
  if (currencyCode === 'SAR') return 'ريال سعودي';
  if (currencyCode === 'YER') return 'ريال يمني';
  return currencyCode;
};

/** يجمع كل ما تحتاجه الصفحة من الفاتورة في كائن واحد. */
export const buildInvoicePrintView = (source: PrintableInvoiceSource): InvoicePrintView => {
  const currencyCode = firstNonEmpty(source.currency_code) || 'SAR';
  const totals = computeInvoiceTotals(source);
  const currencyUnit = invoiceCurrencyUnit(currencyCode);
  return {
    items: buildInvoiceDisplayItems(source.items),
    totals,
    documentMeta: buildInvoiceDocumentMeta(source),
    currencyCode,
    currencyUnit,
    amountInWords: tafqeet(totals.total, currencyUnit),
    zatcaTimestamp: firstNonEmpty(source.issue_date) || new Date().toISOString(),
    isReturn: source.type === 'sale_return',
    paymentLabel: source.payment_method === 'credit' ? 'آجل' : 'نقداً',
    partyName: firstNonEmpty(source.party_name) || 'عميل نقدي',
    partyTaxNumber: firstNonEmpty(source.party_tax_number),
    partyPhone: firstNonEmpty(source.party_phone),
    partyAddress: firstNonEmpty(source.party_address),
    branchName: firstNonEmpty(source.branch_name),
    dueDate: firstNonEmpty(source.due_date),
    issuedBy: firstNonEmpty(source.issuedBy),
  };
};
