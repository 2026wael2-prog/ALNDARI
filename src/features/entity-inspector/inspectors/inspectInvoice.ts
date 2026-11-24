/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../../../lib/supabaseClient';
import { formatCurrency, formatNumberDisplay } from '../../../core/utils';
import type {
  InspectedEntityData,
  InspectorFieldRow,
  InspectorHistoryRow,
  InspectorKpi,
} from '../types';
import {
  dash,
  formatDateShort,
  JOURNAL_SHEET_COLUMNS,
  mapJournalEntriesToInspectorRows,
  translateInvoiceType,
  translatePaymentMethod,
  translateStatus,
  type RawJournalEntryRow,
} from './shared';

export async function inspectInvoice(id: string): Promise<InspectedEntityData> {
  const [invRes, journalsRes] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        `
        *,
        party:party_id(id, name, phone, type),
        invoice_items(
          id,
          product_id,
          description,
          quantity,
          unit_price,
          discount_amount,
          tax_amount,
          total,
          product:products!fk_invoice_items_company_product(id, name_ar, sku, part_number, brand)
        )
      `
      )
      .eq('id', id)
      .single(),
    supabase
      .from('journal_entries')
      .select(
        `
        id,
        entry_number,
        entry_date,
        description,
        journal_entry_lines(
          id,
          debit_amount,
          credit_amount,
          description,
          account_id,
          account:accounts(id, name_ar, code)
        )
      `
      )
      .eq('reference_id', id)
      .is('deleted_at', null)
      .limit(10),
  ]);

  if (invRes.error || !invRes.data) {
    throw new Error('تعذر تحميل بيانات الفاتورة المطلوبة.');
  }

  const inv = invRes.data as any;
  const curr = inv.currency_code || 'SAR';
  const items: any[] = Array.isArray(inv.invoice_items) ? inv.invoice_items : [];
  const docTotal =
    inv.total_document_amount != null && Number(inv.total_document_amount) > 0
      ? Number(inv.total_document_amount)
      : Number(inv.total_amount) || 0;
  const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  const kpis: InspectorKpi[] = [
    {
      label: 'إجمالي الفاتورة',
      value: formatCurrency(docTotal, curr),
      subValue:
        curr !== 'SAR'
          ? `الأساسي: ${formatCurrency(Number(inv.total_amount) || 0, 'SAR')}`
          : undefined,
      tone: 'emerald',
    },
    {
      label: 'عدد الأصناف / القطع',
      value: `${items.length} صنف`,
      subValue: `إجمالي الكمية: ${formatNumberDisplay(totalQty)}`,
      tone: 'blue',
    },
    {
      label: 'طريقة الدفع',
      value: translatePaymentMethod(inv.payment_method),
      subValue: inv.due_date ? `الاستحقاق: ${formatDateShort(inv.due_date)}` : undefined,
      tone: inv.payment_method === 'credit' ? 'amber' : 'emerald',
    },
    {
      label: 'تاريخ الإصدار',
      value: formatDateShort(inv.issue_date),
      subValue: `العملة: ${curr}`,
      tone: 'default',
    },
  ];

  const fields: InspectorFieldRow[] = [
    { section: 'بيانات المستند', label: 'رقم الفاتورة', value: `#${dash(inv.invoice_number)}`, copyValue: inv.invoice_number, mono: true, tone: 'blue' },
    { section: 'بيانات المستند', label: 'نوع الفاتورة', value: translateInvoiceType(inv.type) },
    { section: 'بيانات المستند', label: 'الحالة', value: translateStatus(inv.status).label },
    {
      section: 'بيانات المستند',
      label: inv.type?.startsWith('purchase') ? 'المورد' : 'العميل',
      value: dash(inv.party?.name || (inv.type?.startsWith('purchase') ? 'مورد عام' : 'عميل نقدي')),
      target: inv.party?.id
        ? { type: 'party', id: inv.party.id, label: inv.party.name, subType: inv.party.type }
        : undefined,
    },
    { section: 'بيانات المستند', label: 'تاريخ الإصدار', value: formatDateShort(inv.issue_date), mono: true },
    { section: 'بيانات المستند', label: 'تاريخ الاستحقاق', value: formatDateShort(inv.due_date), mono: true },
    { section: 'البيانات المالية', label: 'طريقة الدفع', value: translatePaymentMethod(inv.payment_method) },
    { section: 'البيانات المالية', label: 'العملة وسعر الصرف', value: `${curr} (سعر الصرف: ${inv.exchange_rate ?? 1})`, mono: true },
    { section: 'البيانات المالية', label: 'الخصم', value: formatCurrency(Number(inv.discount_amount) || 0, curr), mono: true },
    { section: 'البيانات المالية', label: 'الضريبة', value: formatCurrency(Number(inv.tax_amount) || 0, curr), mono: true },
    { section: 'البيانات المالية', label: 'الإجمالي النهائي', value: formatCurrency(docTotal, curr), mono: true, tone: 'emerald' },
    ...(inv.notes ? [{ section: 'ملاحظات', label: 'ملاحظات الفاتورة', value: String(inv.notes) }] : []),
  ];

  const canReturnInvoice = inv.type === 'sale' || inv.type === 'purchase';
  const itemRows: InspectorHistoryRow[] = items.map((it: any) => ({
    id: it.id,
    target: it.product_id
      ? { type: 'product', id: it.product_id, label: it.product?.name_ar || it.description || 'صنف' }
      : undefined,
    ...(canReturnInvoice
      ? {
          returnAction: {
            returnType: inv.type === 'purchase' ? ('purchase' as const) : ('sale' as const),
            invoiceId: inv.id,
            ...(it.product_id ? { productId: it.product_id } : {}),
            ...(inv.party?.id ? { partyId: inv.party.id } : {}),
            ...(inv.party?.name ? { partyName: inv.party.name } : {}),
          },
        }
      : {}),
    cells: {
      name: dash(it.product?.name_ar || it.description),
      sku: dash(it.product?.part_number || it.product?.sku),
      brand: dash(it.product?.brand),
      qty: formatNumberDisplay(Number(it.quantity) || 0),
      unitPrice: formatCurrency(Number(it.unit_price) || 0, curr),
      discount: Number(it.discount_amount) > 0 ? formatCurrency(Number(it.discount_amount), curr) : '—',
      total: formatCurrency(Number(it.total) || 0, curr),
    },
  }));

  const journalEntries: RawJournalEntryRow[] = Array.isArray(journalsRes.data)
    ? (journalsRes.data as unknown as RawJournalEntryRow[])
    : [];
  const journalRows = mapJournalEntriesToInspectorRows(journalEntries);

  return {
    type: 'invoice',
    title: `${translateInvoiceType(inv.type)} #${dash(inv.invoice_number)}`,
    subtitle: `${dash(inv.party?.name || 'عميل نقدي')} • ${formatDateShort(inv.issue_date)}`,
    code: inv.invoice_number || undefined,
    badge: translateStatus(inv.status),
    ...(canReturnInvoice
      ? {
          returnContext: {
            returnType: inv.type === 'purchase' ? ('purchase' as const) : ('sale' as const),
            invoiceId: inv.id,
            ...(inv.party?.id ? { partyId: inv.party.id } : {}),
            ...(inv.party?.name ? { partyName: inv.party.name } : {}),
          },
        }
      : {}),
    kpis,
    fields,
    sheets: [
      {
        id: 'items',
        label: 'أصناف الفاتورة',
        emptyMessage: 'لا توجد أصناف مسجلة في هذه الفاتورة.',
        columns: [
          { key: 'name', label: 'الصنف', align: 'right' },
          { key: 'sku', label: 'رقم القطعة / SKU', align: 'center', mono: true },
          { key: 'brand', label: 'الماركة', align: 'center' },
          { key: 'qty', label: 'الكمية', align: 'center', mono: true },
          { key: 'unitPrice', label: 'السعر', align: 'left', mono: true },
          { key: 'discount', label: 'الخصم', align: 'left', mono: true },
          { key: 'total', label: 'الإجمالي', align: 'left', mono: true },
        ],
        rows: itemRows,
      },
      {
        id: 'journal',
        label: 'القيود المحاسبية المرتبطة',
        emptyMessage: 'لا توجد قيود يومية مرتبطة بهذه الفاتورة.',
        columns: JOURNAL_SHEET_COLUMNS,
        rows: journalRows,
      },
    ],
  };
}
