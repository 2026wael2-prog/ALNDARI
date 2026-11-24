/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../../../lib/supabaseClient';
import { formatCurrency, formatNumberDisplay } from '../../../core/utils';
import { fetchPartyStatement } from '../../parties/services/partyStatementService';
import type {
  InspectedEntityData,
  InspectorFieldRow,
  InspectorHistoryRow,
  InspectorKpi,
  InspectorTarget,
} from '../types';
import {
  dash,
  formatDateShort,
  translateBondType,
  translateInvoiceType,
  translatePaymentMethod,
  translateStatus,
  type InspectContext,
} from './shared';

export async function inspectParty(
  id: string,
  ctx: InspectContext,
  subType?: string
): Promise<InspectedEntityData> {
  const [partyRes, invoicesRes, paymentsRes] = await Promise.all([
    supabase
      .from('parties')
      .select('*, party_categories(id, name)')
      .eq('id', id)
      .single(),
    supabase
      .from('invoices')
      .select(
        'id, invoice_number, type, issue_date, total_amount, total_document_amount, currency_code, payment_method, status'
      )
      .eq('party_id', id)
      .neq('status', 'void')
      .is('deleted_at', null)
      .order('issue_date', { ascending: false })
      .limit(50),
    supabase
      .from('payments')
      .select('id, payment_number, payment_date, amount, currency_code, payment_method, type, notes, status')
      .eq('party_id', id)
      .neq('status', 'void')
      .is('deleted_at', null)
      .order('payment_date', { ascending: false })
      .limit(50),
  ]);

  if (partyRes.error || !partyRes.data) {
    throw new Error('تعذر تحميل بيانات الطرف المطلوب.');
  }

  const party = partyRes.data as any;
  const partyType: 'customer' | 'supplier' =
    party.type === 'supplier' || subType === 'supplier' ? 'supplier' : 'customer';

  const statementMovements = await fetchPartyStatement(
    id,
    partyType,
    { companyId: ctx.companyId, branchId: ctx.branchId ?? null },
    ctx.companyId
  ).catch(() => []);

  const invoices: any[] = Array.isArray(invoicesRes.data) ? invoicesRes.data : [];
  const payments: any[] = Array.isArray(paymentsRes.data) ? paymentsRes.data : [];

  const balanceByCurrency = new Map<string, number>();
  let totalDebit = 0;
  let totalCredit = 0;
  for (const m of statementMovements) {
    const curr = m.currency || 'SAR';
    balanceByCurrency.set(curr, Number(m.balance) || 0);
    totalDebit += Number(m.debit_base ?? m.debit ?? 0);
    totalCredit += Number(m.credit_base ?? m.credit ?? 0);
  }
  const primaryBalance =
    balanceByCurrency.get('SAR') ??
    (balanceByCurrency.size > 0
      ? Array.from(balanceByCurrency.values())[0]
      : Number(party.balance) || 0);
  const primaryCurrency = balanceByCurrency.has('SAR')
    ? 'SAR'
    : balanceByCurrency.size > 0
      ? Array.from(balanceByCurrency.keys())[0]
      : 'SAR';

  const multiCurrencySummary =
    balanceByCurrency.size > 1
      ? Array.from(balanceByCurrency.entries())
          .map(([curr, bal]) => formatCurrency(bal, curr))
          .join(' | ')
      : undefined;

  const kpis: InspectorKpi[] = [
    {
      label: 'الرصيد الحالي',
      value: formatCurrency(primaryBalance, primaryCurrency),
      subValue: multiCurrencySummary,
      tone: primaryBalance > 0 ? 'rose' : primaryBalance < 0 ? 'emerald' : 'default',
    },
    {
      label: 'إجمالي الحركات (مدين / دائن)',
      value: `${statementMovements.length} حركة`,
      subValue: `مدين: ${formatNumberDisplay(totalDebit)} | دائن: ${formatNumberDisplay(totalCredit)}`,
      tone: 'blue',
    },
    {
      label: 'الفواتير المسجلة',
      value: `${invoices.length} فاتورة`,
      subValue: invoices[0]?.issue_date ? `آخر فاتورة: ${formatDateShort(invoices[0].issue_date)}` : undefined,
      tone: 'indigo',
    },
    {
      label: 'السندات المالية',
      value: `${payments.length} سند`,
      subValue: payments[0]?.payment_date ? `آخر سند: ${formatDateShort(payments[0].payment_date)}` : undefined,
      tone: 'emerald',
    },
  ];

  const fields: InspectorFieldRow[] = [
    { section: 'بيانات الهوية', label: 'الاسم الكامل', value: dash(party.name), copyValue: party.name },
    { section: 'بيانات الهوية', label: 'نوع الحساب', value: partyType === 'supplier' ? 'مورد' : 'عميل' },
    { section: 'بيانات الهوية', label: 'التصنيف', value: dash(party.party_categories?.name || party.category) },
    { section: 'بيانات الهوية', label: 'الحالة', value: translateStatus(party.status || 'active').label },
    { section: 'بيانات التواصل', label: 'رقم الهاتف / الجوال', value: dash(party.phone), copyValue: party.phone || undefined, mono: true },
    { section: 'بيانات التواصل', label: 'البريد الإلكتروني', value: dash(party.email), copyValue: party.email || undefined, mono: true },
    { section: 'بيانات التواصل', label: 'العنوان', value: dash(party.address) },
    { section: 'البيانات المالية والضريبية', label: 'الرقم الضريبي', value: dash(party.tax_number), copyValue: party.tax_number || undefined, mono: true },
    {
      section: 'البيانات المالية والضريبية',
      label: 'الحد الائتماني',
      value: party.credit_limit ? formatCurrency(Number(party.credit_limit), 'SAR') : 'غير محدد',
      mono: true,
    },
    {
      section: 'البيانات المالية والضريبية',
      label: 'الرصيد الحالي',
      value: formatCurrency(primaryBalance, primaryCurrency),
      mono: true,
      tone: primaryBalance > 0 ? 'rose' : primaryBalance < 0 ? 'emerald' : 'default',
    },
    { section: 'معلومات السجل', label: 'تاريخ التسجيل', value: formatDateShort(party.created_at), mono: true },
    ...(party.notes ? [{ section: 'معلومات السجل', label: 'ملاحظات', value: String(party.notes) }] : []),
  ];

  const statementRows: InspectorHistoryRow[] = [...statementMovements]
    .reverse()
    .slice(0, 120)
    .map(m => {
      const refType = String(m.reference_type || m.type || '').toLowerCase();
      let drillTarget: InspectorTarget | undefined;
      if (m.reference_id) {
        if (
          refType.includes('invoice') ||
          refType === 'sale' ||
          refType === 'purchase' ||
          refType.includes('return')
        ) {
          drillTarget = { type: 'invoice', id: m.reference_id, label: m.ref || 'فاتورة' };
        } else if (
          refType.includes('payment') ||
          refType.includes('bond') ||
          refType === 'receipt' ||
          refType === 'disbursement'
        ) {
          drillTarget = { type: 'bond', id: m.reference_id, label: m.ref || 'سند' };
        }
      }
      const curr = m.currency || 'SAR';
      return {
        id: m.id,
        tone: Number(m.debit) > 0 ? 'rose' : Number(m.credit) > 0 ? 'emerald' : 'default',
        target: drillTarget,
        cells: {
          date: formatDateShort(m.date),
          ref: dash(m.ref),
          type: dash(m.operation_type || m.type),
          desc: dash(m.desc),
          debit: Number(m.debit) > 0 ? formatCurrency(Number(m.debit), curr) : '—',
          credit: Number(m.credit) > 0 ? formatCurrency(Number(m.credit), curr) : '—',
          balance: formatCurrency(Number(m.balance) || 0, curr),
        },
      };
    });

  const invoiceRows: InspectorHistoryRow[] = invoices.map((inv: any) => {
    const curr = inv.currency_code || 'SAR';
    const docAmt =
      inv.total_document_amount != null && Number(inv.total_document_amount) > 0
        ? Number(inv.total_document_amount)
        : Number(inv.total_amount) || 0;
    const canReturnInv = inv.type === 'sale' || inv.type === 'purchase';
    return {
      id: inv.id,
      tone: inv.type?.includes('return') ? 'amber' : 'blue',
      target: { type: 'invoice', id: inv.id, label: `#${inv.invoice_number}`, subType: inv.type },
      ...(canReturnInv
        ? {
            returnAction: {
              returnType: inv.type === 'purchase' ? ('purchase' as const) : ('sale' as const),
              invoiceId: inv.id,
              partyId: party.id,
              partyName: party.name,
            },
          }
        : {}),
      cells: {
        date: formatDateShort(inv.issue_date),
        number: `#${inv.invoice_number || '—'}`,
        type: translateInvoiceType(inv.type),
        method: translatePaymentMethod(inv.payment_method),
        status: translateStatus(inv.status).label,
        total: formatCurrency(docAmt, curr),
      },
    };
  });

  const bondRows: InspectorHistoryRow[] = payments.map((b: any) => {
    const curr = b.currency_code || 'SAR';
    return {
      id: b.id,
      tone: b.type === 'receipt' ? 'emerald' : 'rose',
      target: { type: 'bond', id: b.id, label: b.payment_number || 'سند' },
      cells: {
        date: formatDateShort(b.payment_date),
        number: dash(b.payment_number),
        type: translateBondType(b.type),
        method: translatePaymentMethod(b.payment_method),
        amount: formatCurrency(Number(b.amount) || 0, curr),
        notes: dash(b.notes),
      },
    };
  });

  const st = translateStatus(party.status || 'active');
  return {
    type: 'party',
    title: dash(party.name),
    subtitle: `${partyType === 'supplier' ? 'بطاقة مورد وكشف حساب' : 'بطاقة عميل وكشف حساب'}${party.phone ? ` • ${party.phone}` : ''}`,
    code: party.tax_number || undefined,
    badge: st,
    returnContext: {
      returnType: partyType === 'supplier' ? 'purchase' : 'sale',
      partyId: party.id,
      partyName: party.name,
    },
    kpis,
    fields,
    sheets: [
      {
        id: 'statement',
        label: 'كشف الحساب والحركات',
        emptyMessage: 'لا توجد حركات مالية مسجلة لهذا الطرف.',
        columns: [
          { key: 'date', label: 'التاريخ', align: 'center', mono: true },
          { key: 'ref', label: 'المرجع', align: 'center', mono: true },
          { key: 'type', label: 'العملية', align: 'center' },
          { key: 'desc', label: 'البيان', align: 'right' },
          { key: 'debit', label: 'مدين', align: 'left', mono: true },
          { key: 'credit', label: 'دائن', align: 'left', mono: true },
          { key: 'balance', label: 'الرصيد', align: 'left', mono: true },
        ],
        rows: statementRows,
      },
      {
        id: 'invoices',
        label: 'الفواتير',
        emptyMessage: 'لا توجد فواتير مسجلة لهذا الطرف.',
        columns: [
          { key: 'date', label: 'التاريخ', align: 'center', mono: true },
          { key: 'number', label: 'رقم الفاتورة', align: 'center', mono: true },
          { key: 'type', label: 'النوع', align: 'center' },
          { key: 'method', label: 'الدفع', align: 'center' },
          { key: 'status', label: 'الحالة', align: 'center' },
          { key: 'total', label: 'الإجمالي', align: 'left', mono: true },
        ],
        rows: invoiceRows,
      },
      {
        id: 'bonds',
        label: 'السندات المالية',
        emptyMessage: 'لا توجد سندات قبض أو صرف لهذا الطرف.',
        columns: [
          { key: 'date', label: 'التاريخ', align: 'center', mono: true },
          { key: 'number', label: 'رقم السند', align: 'center', mono: true },
          { key: 'type', label: 'النوع', align: 'center' },
          { key: 'method', label: 'الطريقة', align: 'center' },
          { key: 'amount', label: 'المبلغ', align: 'left', mono: true },
          { key: 'notes', label: 'البيان', align: 'right' },
        ],
        rows: bondRows,
      },
    ],
  };
}
