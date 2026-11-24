import { formatCurrency } from '../../../core/utils';
import type {
  InspectorHistoryRow,
  InspectorTableColumn,
  InspectorTone,
} from '../types';

export interface InspectContext {
  companyId: string;
  branchId?: string | null | undefined;
  canViewCost?: boolean | undefined;
}

export const dash = (val: unknown): string => {
  if (val === null || val === undefined) return '—';
  const s = String(val).trim();
  return s.length > 0 ? s : '—';
};

export const formatDateShort = (val: unknown): string => {
  if (!val) return '—';
  const str = String(val);
  return str.length >= 10 ? str.slice(0, 10) : str;
};

export const translateStatus = (status: unknown): { label: string; tone: InspectorTone } => {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'active':
      return { label: 'نشط', tone: 'emerald' };
    case 'paid':
      return { label: 'مدفوعة', tone: 'emerald' };
    case 'posted':
      return { label: 'مرحّلة', tone: 'blue' };
    case 'partially_paid':
      return { label: 'مدفوعة جزئياً', tone: 'amber' };
    case 'draft':
      return { label: 'مسودة', tone: 'default' };
    case 'void':
    case 'cancelled':
      return { label: 'ملغاة', tone: 'rose' };
    case 'blocked':
    case 'inactive':
      return { label: 'موقوف', tone: 'rose' };
    default:
      return { label: s || 'نشط', tone: 'blue' };
  }
};

export const translateInvoiceType = (type: unknown): string => {
  switch (String(type || '')) {
    case 'sale':
      return 'فاتورة مبيعات';
    case 'sale_return':
      return 'مرتجع مبيعات';
    case 'purchase':
      return 'فاتورة مشتريات';
    case 'purchase_return':
      return 'مرتجع مشتريات';
    default:
      return String(type || 'فاتورة');
  }
};

export const translatePaymentMethod = (method: unknown): string => {
  switch (String(method || '')) {
    case 'cash':
      return 'نقدي (كاش)';
    case 'credit':
      return 'آجل (ذمم)';
    case 'bank':
      return 'تحويل بنكي';
    case 'card':
      return 'شبكة / بطاقة';
    default:
      return dash(method);
  }
};

export const translateBondType = (type: unknown): string => {
  switch (String(type || '')) {
    case 'receipt':
      return 'سند قبض';
    case 'disbursement':
    case 'payment':
      return 'سند صرف';
    case 'transfer':
      return 'سند تحويل';
    default:
      return 'سند مالي';
  }
};

export const translateMovementType = (type: unknown): string => {
  switch (String(type || '').toLowerCase()) {
    case 'sale':
    case 'out':
      return 'صرف / مبيعات';
    case 'purchase':
    case 'in':
      return 'توريد / مشتريات';
    case 'sale_return':
      return 'مرتجع مبيعات';
    case 'purchase_return':
      return 'مرتجع مشتريات';
    case 'transfer':
    case 'transfer_in':
    case 'transfer_out':
      return 'تحويل مخزني';
    case 'adjustment':
    case 'audit':
      return 'تسوية / جرد';
    default:
      return dash(type);
  }
};

export interface RawJournalEntryRow {
  entry_number?: string | number | null;
  entry_date?: string | null;
  description?: string | null;
  journal_entry_lines?: Array<{
    id: string;
    debit_amount?: number | string | null;
    credit_amount?: number | string | null;
    description?: string | null;
    account?: { id?: string; name_ar?: string | null; code?: string | null } | null;
  }> | null;
}

export const JOURNAL_SHEET_COLUMNS: InspectorTableColumn[] = [
  { key: 'entry', label: 'رقم القيد', align: 'center', mono: true },
  { key: 'date', label: 'التاريخ', align: 'center', mono: true },
  { key: 'code', label: 'رمز الحساب', align: 'center', mono: true },
  { key: 'account', label: 'الحساب المحاسبي', align: 'right' },
  { key: 'debit', label: 'مدين', align: 'left', mono: true },
  { key: 'credit', label: 'دائن', align: 'left', mono: true },
  { key: 'desc', label: 'البيان', align: 'right' },
];

export function mapJournalEntriesToInspectorRows(
  entries: RawJournalEntryRow[]
): InspectorHistoryRow[] {
  return entries.flatMap(je =>
    (Array.isArray(je.journal_entry_lines) ? je.journal_entry_lines : []).map(ln => ({
      id: ln.id,
      tone: Number(ln.debit_amount) > 0 ? ('blue' as const) : ('emerald' as const),
      target: ln.account?.id
        ? { type: 'account' as const, id: ln.account.id, label: ln.account.name_ar || undefined }
        : undefined,
      cells: {
        entry: `#${je.entry_number || '—'}`,
        date: formatDateShort(je.entry_date),
        code: dash(ln.account?.code),
        account: dash(ln.account?.name_ar),
        debit: Number(ln.debit_amount) > 0 ? formatCurrency(Number(ln.debit_amount), 'SAR') : '—',
        credit: Number(ln.credit_amount) > 0 ? formatCurrency(Number(ln.credit_amount), 'SAR') : '—',
        desc: dash(ln.description || je.description),
      },
    }))
  );
}
