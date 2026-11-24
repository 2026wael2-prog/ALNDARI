/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../../../lib/supabaseClient';
import { formatCurrency } from '../../../core/utils';
import type { InspectedEntityData, InspectorFieldRow, InspectorKpi } from '../types';
import {
  dash,
  formatDateShort,
  JOURNAL_SHEET_COLUMNS,
  mapJournalEntriesToInspectorRows,
  translateBondType,
  translatePaymentMethod,
  translateStatus,
  type RawJournalEntryRow,
} from './shared';

export async function inspectBond(id: string): Promise<InspectedEntityData> {
  const [bondRes, journalsRes] = await Promise.all([
    supabase
      .from('payments')
      .select(
        `
        *,
        party:parties!fk_payments_company_party(id, name, phone, type),
        account:accounts!fk_payments_company_account(id, name_ar, code)
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

  if (bondRes.error || !bondRes.data) {
    throw new Error('تعذر تحميل بيانات السند المطلوب.');
  }

  const b = bondRes.data as any;
  const curr = b.currency_code || 'SAR';
  const amount = Number(b.amount) || 0;

  const kpis: InspectorKpi[] = [
    {
      label: 'مبلغ السند',
      value: formatCurrency(amount, curr),
      tone: b.type === 'receipt' ? 'emerald' : 'rose',
    },
    {
      label: 'نوع السند',
      value: translateBondType(b.type),
      tone: 'blue',
    },
    {
      label: 'طريقة الدفع',
      value: translatePaymentMethod(b.payment_method),
      tone: 'default',
    },
    {
      label: 'التاريخ',
      value: formatDateShort(b.payment_date),
      tone: 'default',
    },
  ];

  const fields: InspectorFieldRow[] = [
    { section: 'بيانات السند', label: 'رقم السند', value: dash(b.payment_number), copyValue: b.payment_number, mono: true, tone: 'blue' },
    { section: 'بيانات السند', label: 'نوع السند', value: translateBondType(b.type) },
    { section: 'بيانات السند', label: 'تاريخ السند', value: formatDateShort(b.payment_date), mono: true },
    { section: 'بيانات السند', label: 'الحالة', value: translateStatus(b.status || 'posted').label },
    {
      section: 'الأطراف والحسابات',
      label: 'الطرف / الجهة',
      value: dash(b.party?.name),
      target: b.party?.id
        ? { type: 'party', id: b.party.id, label: b.party.name, subType: b.party.type }
        : undefined,
    },
    {
      section: 'الأطراف والحسابات',
      label: 'الصندوق / الحساب',
      value: b.account ? `${b.account.code ? `[${b.account.code}] ` : ''}${b.account.name_ar}` : '—',
      target: b.account?.id ? { type: 'account', id: b.account.id, label: b.account.name_ar } : undefined,
    },
    { section: 'القيمة المالية', label: 'المبلغ', value: formatCurrency(amount, curr), mono: true, tone: b.type === 'receipt' ? 'emerald' : 'rose' },
    { section: 'القيمة المالية', label: 'العملة وسعر الصرف', value: `${curr} (${b.exchange_rate ?? 1})`, mono: true },
    { section: 'القيمة المالية', label: 'طريقة الدفع', value: translatePaymentMethod(b.payment_method) },
    ...(b.notes ? [{ section: 'البيان', label: 'البيان / الملاحظات', value: String(b.notes) }] : []),
  ];

  const journalEntries: RawJournalEntryRow[] = Array.isArray(journalsRes.data)
    ? (journalsRes.data as unknown as RawJournalEntryRow[])
    : [];
  const journalRows = mapJournalEntriesToInspectorRows(journalEntries);

  return {
    type: 'bond',
    title: `${translateBondType(b.type)} #${dash(b.payment_number)}`,
    subtitle: `${dash(b.party?.name || b.account?.name_ar)} • ${formatDateShort(b.payment_date)}`,
    code: b.payment_number || undefined,
    badge: translateStatus(b.status || 'posted'),
    kpis,
    fields,
    sheets: [
      {
        id: 'journal',
        label: 'القيد المحاسبي المرتبط',
        emptyMessage: 'لا توجد قيود يومية مرتبطة بهذا السند.',
        columns: JOURNAL_SHEET_COLUMNS,
        rows: journalRows,
      },
    ],
  };
}
