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
  unit?: string | null | undefined;
  uom_name?: string | null | undefined;
  notes?: string | null | undefined;
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
  subtotal_document_amount?: number | string | null | undefined;
  discount_amount?: number | string | null | undefined;
  tax_amount?: number | string | null | undefined;
  total_amount?: number | string | null | undefined;
  total_document_amount?: number | string | null | undefined;
  paid_amount?: number | string | null | undefined;
  currency_code?: string | null | undefined;
  exchange_rate?: number | string | null | undefined;
  payment_method?: string | null | undefined;
  status?: string | null | undefined;
  branch_name?: string | null | undefined;
  issuedBy?: string | null | undefined;
  type?: string | null | undefined;
  notes?: string | null | undefined;
}

/** بند جاهز للطباعة بأرقام مُتحقَّق منها. */
export interface InvoiceDisplayItem {
  id: string;
  name: string;
  sku: string;
  partNumber: string;
  unit: string;
  notes: string;
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
  remainingInWords: string;
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
  notes: string;
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
      unit: firstNonEmpty(item.unit, item.uom_name, (item.product as { unit?: string | null } | undefined)?.unit),
      notes: firstNonEmpty(item.notes),
      quantity,
      unitPrice,
      lineTotal,
      taxAmount: roundTwo((lineTotal * VAT_RATE) / VAT_DENOMINATOR),
    };
  });


const isReturnInvoiceType = (type: string | null | undefined): boolean =>
  type === 'sale_return' || type === 'return_sale';

const formatPaymentMethodLabel = (method: string | null | undefined): string => {
  switch ((method ?? '').toLowerCase()) {
    case 'credit':
      return 'آجل';
    case 'bank':
    case 'transfer':
      return 'تحويل بنكي';
    case 'card':
    case 'network':
      return 'شبكة / بطاقة';
    default:
      return 'نقداً';
  }
};

/**
 * إجماليات الفاتورة بعملة المستند الفعلية.
 * - في قاعدة البيانات تُخزّن أعمدة (total_amount, subtotal, discount_amount, tax_amount, paid_amount)
 *   بالعملة الأساسية (SAR)، بينما تُخزّن البنود و(total_document_amount, subtotal_document_amount)
 *   بعملة المستند (YER/OMR/...).
 * - عند اختلاف العملة عن SAR يُشتق معامل التحويل من الأساسية إلى عملة المستند لتوحيد كل الإجماليات
 *   (بما فيها الخصم والضريبة والمدفوع والمتبقي) بعملة المستند نفسها بلا خلط وحدات.
 */
export const computeInvoiceTotals = (source: PrintableInvoiceSource): InvoicePrintTotals => {
  const currency = firstNonEmpty(source.currency_code).toUpperCase() || 'SAR';
  const isForeign = currency !== 'SAR';
  const baseTotal = asNumber(source.total_amount);
  const docTotal = asNumber(source.total_document_amount);
  const docSubtotal = asNumber(source.subtotal_document_amount);
  const rawRate = asNumber(source.exchange_rate);

  // Determine conversion multiplier from base currency (SAR) -> document currency
  let baseToDoc = 1;
  if (isForeign) {
    if (docTotal > 0 && baseTotal > 0 && Math.abs(docTotal - baseTotal) > 0.01) {
      // Prefer exact `1 / exchange_rate` when consistent with `docTotal / baseTotal`
      // so rounded `total_amount` (e.g. 243.9024 SAR) doesn't introduce 0.01 drift on partial payments.
      const rateInverse = rawRate > 0 && Math.abs(rawRate - 1) > 1e-6 ? 1 / rawRate : 0;
      if (rateInverse > 0 && Math.abs(baseTotal * rateInverse - docTotal) / docTotal < 0.02) {
        baseToDoc = rateInverse;
      } else {
        baseToDoc = docTotal / baseTotal;
      }
    } else if (docTotal <= 0 && baseTotal > 0 && rawRate > 0 && Math.abs(rawRate - 1) > 1e-6) {
      // Legacy foreign invoice missing total_document_amount: verify against item lines when available
      const itemsSum = (source.items ?? []).reduce((sum, item) => {
        const qty = asNumber(item.quantity, 1);
        const unit = asNumber(item.price ?? item.unit_price);
        return sum + asNumber(item.total, qty * unit);
      }, 0);
      const invertedTotal = baseTotal / rawRate;
      if (itemsSum <= 0 || Math.abs(invertedTotal - itemsSum) / Math.max(itemsSum, 1) < 0.25) {
        baseToDoc = 1 / rawRate;
      }
    }
  }

  const total =
    isForeign && docTotal > 0
      ? roundTwo(docTotal)
      : baseToDoc !== 1
        ? roundTwo(baseTotal * baseToDoc)
        : baseTotal;

  // مطابق للسلوك السابق: `undefined` فقط يعني «اشتق»، أما `null` فيعني صفراً صريحاً.
  const tax =
    source.tax_amount !== undefined
      ? roundTwo(asNumber(source.tax_amount) * baseToDoc)
      : roundTwo((total * VAT_RATE) / VAT_DENOMINATOR);

  const subtotal =
    isForeign && docSubtotal > 0
      ? roundTwo(docSubtotal)
      : source.subtotal !== undefined
        ? roundTwo(asNumber(source.subtotal) * baseToDoc)
        : roundTwo(total - tax);

  const discount = roundTwo(asNumber(source.discount_amount) * baseToDoc);

  const rawPaid = asNumber(source.paid_amount);
  let paid =
    baseToDoc !== 1 && rawPaid > 0 && Math.abs(rawPaid - baseTotal) <= 0.01
      ? total
      : roundTwo(rawPaid * baseToDoc);
  // Snap tiny floating-point rounding drift when invoice is paid in full
  if (baseToDoc !== 1 && paid > 0 && Math.abs(total - paid) <= Math.max(0.5, total * 0.0005)) {
    paid = total;
  }

  return {
    subtotal,
    discount,
    tax,
    total,
    paid,
    remaining: roundTwo(Math.max(0, total - paid)),
  };
};

/** العنوان والوعد والشارة المعروضة أعلى الفاتورة. */
export const buildInvoiceDocumentMeta = (source: PrintableInvoiceSource): DocumentHeaderMeta => {
  const isReturn = isReturnInvoiceType(source.type);
  const badge = isReturn
    ? 'مرتجع مبيعات'
    : source.payment_method === 'credit'
      ? 'آجلة'
      : 'نقدية';
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
  if (currencyCode === 'OMR') return 'ريال عماني';
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
    remainingInWords: totals.remaining > 0 ? tafqeet(totals.remaining, currencyUnit) : 'صفر لا غير',
    zatcaTimestamp: firstNonEmpty(source.issue_date) || new Date().toISOString(),
    isReturn: isReturnInvoiceType(source.type),
    paymentLabel: formatPaymentMethodLabel(source.payment_method),
    partyName: firstNonEmpty(source.party_name) || 'عميل نقدي',
    partyTaxNumber: firstNonEmpty(source.party_tax_number),
    partyPhone: firstNonEmpty(source.party_phone),
    partyAddress: firstNonEmpty(source.party_address),
    branchName: firstNonEmpty(source.branch_name),
    dueDate: firstNonEmpty(source.due_date),
    issuedBy: firstNonEmpty(source.issuedBy),
    notes: firstNonEmpty(source.notes),
  };
};
