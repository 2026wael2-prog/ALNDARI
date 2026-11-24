/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../../../lib/supabaseClient';
import { formatCurrency } from '../../../core/utils';
import type {
  InspectedEntityData,
  InspectorFieldRow,
  InspectorHistoryRow,
  InspectorKpi,
} from '../types';
import { dash, formatDateShort } from './shared';

export async function inspectAccount(id: string): Promise<InspectedEntityData> {
  const [accRes, linesRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('id', id).single(),
    supabase
      .from('journal_entry_lines')
      .select(
        `
        id,
        debit_amount,
        credit_amount,
        description,
        journal_entry:journal_entries(id, entry_number, entry_date, description, reference_id, reference_type)
      `
      )
      .eq('account_id', id)
      .order('id', { ascending: false })
      .limit(80),
  ]);

  if (accRes.error || !accRes.data) {
    throw new Error('تعذر تحميل بيانات الحساب المحاسبي.');
  }

  const acc = accRes.data as any;
  const lines: any[] = Array.isArray(linesRes.data) ? linesRes.data : [];
  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit_amount) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit_amount) || 0), 0);
  const curr = acc.currency_code || 'SAR';

  const kpis: InspectorKpi[] = [
    {
      label: 'رصيد الحساب',
      value: formatCurrency(Number(acc.balance) || totalDebit - totalCredit, curr),
      tone: 'blue',
    },
    {
      label: 'إجمالي المدين (آخر الحركات)',
      value: formatCurrency(totalDebit, curr),
      tone: 'emerald',
    },
    {
      label: 'إجمالي الدائن (آخر الحركات)',
      value: formatCurrency(totalCredit, curr),
      tone: 'rose',
    },
    {
      label: 'عدد القيود',
      value: `${lines.length} قيد`,
      tone: 'default',
    },
  ];

  const fields: InspectorFieldRow[] = [
    { section: 'بطاقة الحساب', label: 'رمز الحساب', value: dash(acc.code), copyValue: acc.code, mono: true, tone: 'indigo' },
    { section: 'بطاقة الحساب', label: 'اسم الحساب (عربي)', value: dash(acc.name_ar), copyValue: acc.name_ar },
    { section: 'بطاقة الحساب', label: 'اسم الحساب (إنجليزي)', value: dash(acc.name_en) },
    { section: 'بطاقة الحساب', label: 'تصنيف الحساب', value: dash(acc.type) },
    { section: 'بطاقة الحساب', label: 'العملة', value: curr, mono: true },
    { section: 'بطاقة الحساب', label: 'الحالة', value: acc.is_active === false ? 'موقوف' : 'نشط' },
    ...(acc.description ? [{ section: 'بطاقة الحساب', label: 'الوصف', value: String(acc.description) }] : []),
  ];

  const movementRows: InspectorHistoryRow[] = lines.map((ln: any) => {
    const je = ln.journal_entry;
    return {
      id: ln.id,
      tone: Number(ln.debit_amount) > 0 ? 'blue' : 'emerald',
      cells: {
        date: formatDateShort(je?.entry_date),
        entry: `#${je?.entry_number || '—'}`,
        desc: dash(ln.description || je?.description),
        debit: Number(ln.debit_amount) > 0 ? formatCurrency(Number(ln.debit_amount), curr) : '—',
        credit: Number(ln.credit_amount) > 0 ? formatCurrency(Number(ln.credit_amount), curr) : '—',
      },
    };
  });

  return {
    type: 'account',
    title: dash(acc.name_ar || acc.name_en),
    subtitle: `حساب محاسبي • الرمز: ${dash(acc.code)}`,
    code: acc.code || undefined,
    badge: {
      label: acc.is_active === false ? 'موقوف' : 'نشط',
      tone: acc.is_active === false ? 'rose' : 'emerald',
    },
    kpis,
    fields,
    sheets: [
      {
        id: 'ledger',
        label: 'حركات دفتر الأستاذ',
        emptyMessage: 'لا توجد قيود مسجلة على هذا الحساب.',
        columns: [
          { key: 'date', label: 'التاريخ', align: 'center', mono: true },
          { key: 'entry', label: 'رقم القيد', align: 'center', mono: true },
          { key: 'desc', label: 'البيان', align: 'right' },
          { key: 'debit', label: 'مدين', align: 'left', mono: true },
          { key: 'credit', label: 'دائن', align: 'left', mono: true },
        ],
        rows: movementRows,
      },
    ],
  };
}
