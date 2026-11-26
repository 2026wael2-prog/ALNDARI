import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/features/auth/store';
import type {
  StatementMovement,
  StatementTransactionDetails,
  StatementTransactionItem,
} from '../services/statementTypes';

const CHUNK_SIZE = 75;
const INVOICE_KEYWORDS = ['invoice', 'sale', 'purchase'];
const BOND_KEYWORDS = ['bond', 'payment', 'receipt', 'voucher'];

type BondAllocationItem = NonNullable<StatementTransactionDetails['allocations']>[number];

interface RawInvoiceHeader {
  id: string;
  invoice_number: string | null;
  issue_date: string | null;
  type: string | null;
  status: string | null;
  currency_code: string | null;
  subtotal: number | null;
  discount_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  paid_amount: number | null;
  notes: string | null;
}

interface RawInvoiceItemRow {
  id: string;
  invoice_id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  discount_amount: number | null;
  tax_amount: number | null;
  total: number | null;
  products:
    | { name_ar?: string | null; sku?: string | null; part_number?: string | null }
    | Array<{ name_ar?: string | null; sku?: string | null; part_number?: string | null }>
    | null;
}

interface RawPaymentHeader {
  id: string;
  payment_number: string | null;
  payment_date: string | null;
  type: string | null;
  currency_code: string | null;
  payment_method: string | null;
  status: string | null;
  notes: string | null;
  accounts:
    | { name_ar?: string | null; code?: string | null }
    | Array<{ name_ar?: string | null; code?: string | null }>
    | null;
}

interface RawAllocationRow {
  id: string;
  payment_id: string;
  amount: number | null;
  invoices:
    | { invoice_number?: string | null; issue_date?: string | null; total_amount?: number | null }
    | Array<{
        invoice_number?: string | null;
        issue_date?: string | null;
        total_amount?: number | null;
      }>
    | null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function unwrapOne<T>(val: T | T[] | null | undefined): T | null {
  if (val === null || val === undefined) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

function nonEmpty(val: string | null | undefined): string | undefined {
  return typeof val === 'string' && val.length > 0 ? val : undefined;
}

function numOrZero(val: number | null | undefined): number {
  return val ?? 0;
}

function assignStr<T extends object>(
  target: T,
  key: keyof T & string,
  val: string | null | undefined
): void {
  const clean = nonEmpty(val);
  if (clean !== undefined) {
    Object.assign(target, Object.fromEntries([[key, clean]]));
  }
}

function classifyRefKind(m: StatementMovement): 'invoice' | 'bond' | 'other' {
  const refType = (m.reference_type ?? m.type).toLowerCase();
  const op = (m.operation_type ?? '').toLowerCase();
  if (op.includes('فاتورة') || INVOICE_KEYWORDS.some(k => refType.includes(k))) {
    return 'invoice';
  }
  if (BOND_KEYWORDS.some(k => refType.includes(k))) {
    return 'bond';
  }
  return 'other';
}

function mapInvoiceItemRow(raw: RawInvoiceItemRow): StatementTransactionItem {
  const prod = unwrapOne(raw.products);
  const item: StatementTransactionItem = {
    id: raw.id,
    item_name: nonEmpty(prod?.name_ar) ?? nonEmpty(raw.description) ?? 'صنف',
    quantity: numOrZero(raw.quantity),
    unit_price: numOrZero(raw.unit_price),
    discount_amount: numOrZero(raw.discount_amount),
    tax_amount: numOrZero(raw.tax_amount),
    total_amount: numOrZero(raw.total),
  };
  assignStr(item, 'sku', prod?.sku);
  assignStr(item, 'part_number', prod?.part_number);
  return item;
}

function mapInvoiceHeader(
  inv: RawInvoiceHeader,
  items: StatementTransactionItem[]
): StatementTransactionDetails {
  const total = numOrZero(inv.total_amount);
  const paid = numOrZero(inv.paid_amount);
  const details: StatementTransactionDetails = {
    kind: 'invoice',
    invoice_id: inv.id,
    currency_code: nonEmpty(inv.currency_code) ?? 'SAR',
    subtotal: numOrZero(inv.subtotal),
    discount_amount: numOrZero(inv.discount_amount),
    tax_amount: numOrZero(inv.tax_amount),
    total_amount: total,
    paid_amount: paid,
    remaining_amount: Math.max(total - paid, 0),
    items,
  };
  assignStr(details, 'invoice_number', inv.invoice_number);
  assignStr(details, 'issue_date', inv.issue_date);
  assignStr(details, 'type', inv.type);
  assignStr(details, 'status', inv.status);
  assignStr(details, 'notes', inv.notes);
  return details;
}

function groupInvoiceItems(
  itemPages: Array<{ data: unknown; error: unknown }>
): Map<string, StatementTransactionItem[]> {
  const map = new Map<string, StatementTransactionItem[]>();
  for (const res of itemPages) {
    if (res.error !== null || !Array.isArray(res.data)) continue;
    for (const raw of res.data as RawInvoiceItemRow[]) {
      const list = map.get(raw.invoice_id) ?? [];
      list.push(mapInvoiceItemRow(raw));
      map.set(raw.invoice_id, list);
    }
  }
  return map;
}

async function fetchInvoiceDetailsBatch(
  companyId: string,
  invoiceIds: string[],
  outMap: Map<string, StatementTransactionDetails>
): Promise<void> {
  if (invoiceIds.length === 0) return;
  const chunks = chunkArray(invoiceIds, CHUNK_SIZE);
  const [headerPages, itemPages] = await Promise.all([
    Promise.all(
      chunks.map(chunk =>
        supabase
          .from('invoices')
          .select(
            'id, invoice_number, issue_date, type, status, currency_code, subtotal, discount_amount, tax_amount, total_amount, paid_amount, notes'
          )
          .eq('company_id', companyId)
          .in('id', chunk)
          .is('deleted_at', null)
      )
    ),
    Promise.all(
      chunks.map(chunk =>
        supabase
          .from('invoice_items')
          .select(
            'id, invoice_id, description, quantity, unit_price, discount_amount, tax_amount, total, products(name_ar, sku, part_number)'
          )
          .in('invoice_id', chunk)
          .order('id', { ascending: true })
      )
    ),
  ]);

  const itemsByInvoice = groupInvoiceItems(itemPages);
  for (const res of headerPages) {
    if (res.error !== null || !Array.isArray(res.data)) continue;
    for (const inv of res.data as unknown as RawInvoiceHeader[]) {
      outMap.set(inv.id, mapInvoiceHeader(inv, itemsByInvoice.get(inv.id) ?? []));
    }
  }
}

function mapBondHeader(
  pay: RawPaymentHeader,
  allocations: BondAllocationItem[]
): StatementTransactionDetails {
  const acc = unwrapOne(pay.accounts);
  const details: StatementTransactionDetails = {
    kind: 'bond',
    payment_id: pay.id,
    currency_code: nonEmpty(pay.currency_code) ?? 'SAR',
    allocations,
  };
  assignStr(details, 'payment_number', pay.payment_number);
  assignStr(details, 'payment_date', pay.payment_date);
  assignStr(details, 'type', pay.type);
  assignStr(details, 'payment_method', pay.payment_method);
  assignStr(details, 'status', pay.status);
  assignStr(details, 'notes', pay.notes);
  assignStr(details, 'account_name', acc?.name_ar);
  assignStr(details, 'account_code', acc?.code);
  return details;
}

function mapAllocationRow(raw: RawAllocationRow): BondAllocationItem {
  const inv = unwrapOne(raw.invoices);
  return {
    allocation_id: raw.id,
    allocated_amount: numOrZero(raw.amount),
    invoice_number: nonEmpty(inv?.invoice_number) ?? '—',
    invoice_date: nonEmpty(inv?.issue_date) ?? '',
    invoice_total: numOrZero(inv?.total_amount),
  };
}

function groupBondAllocations(
  allocPages: Array<{ data: unknown; error: unknown }>
): Map<string, BondAllocationItem[]> {
  const map = new Map<string, BondAllocationItem[]>();
  for (const res of allocPages) {
    if (res.error !== null || !Array.isArray(res.data)) continue;
    for (const raw of res.data as RawAllocationRow[]) {
      const list = map.get(raw.payment_id) ?? [];
      list.push(mapAllocationRow(raw));
      map.set(raw.payment_id, list);
    }
  }
  return map;
}

async function fetchBondDetailsBatch(
  companyId: string,
  bondIds: string[],
  outMap: Map<string, StatementTransactionDetails>
): Promise<void> {
  if (bondIds.length === 0) return;
  const chunks = chunkArray(bondIds, CHUNK_SIZE);
  const [bondPages, allocPages] = await Promise.all([
    Promise.all(
      chunks.map(chunk =>
        supabase
          .from('payments')
          .select(
            'id, payment_number, payment_date, type, currency_code, payment_method, status, notes, accounts(name_ar, code)'
          )
          .eq('company_id', companyId)
          .in('id', chunk)
          .is('deleted_at', null)
      )
    ),
    Promise.all(
      chunks.map(chunk =>
        supabase
          .from('payment_allocations')
          .select('id, payment_id, amount, invoices(invoice_number, issue_date, total_amount)')
          .eq('company_id', companyId)
          .in('payment_id', chunk)
      )
    ),
  ]);

  const allocsByBond = groupBondAllocations(allocPages);
  for (const res of bondPages) {
    if (res.error !== null || !Array.isArray(res.data)) continue;
    for (const pay of res.data as unknown as RawPaymentHeader[]) {
      outMap.set(pay.id, mapBondHeader(pay, allocsByBond.get(pay.id) ?? []));
    }
  }
}

function collectReferenceIds(movements: StatementMovement[]): {
  invoiceIds: string[];
  bondIds: string[];
  cacheSignature: string;
} {
  const invSet = new Set<string>();
  const bondSet = new Set<string>();
  for (const m of movements) {
    const refId = nonEmpty(m.reference_id);
    if (refId === undefined) continue;
    const kind = classifyRefKind(m);
    if (kind === 'invoice') invSet.add(refId);
    else if (kind === 'bond') bondSet.add(refId);
  }
  const invoiceIds = Array.from(invSet).sort();
  const bondIds = Array.from(bondSet).sort();
  return { invoiceIds, bondIds, cacheSignature: `${invoiceIds.join(',')}|${bondIds.join(',')}` };
}

/**
 * Batch-fetches inline transaction details (invoice items & bond allocations)
 * for all visible statement rows in 2 batched queries instead of N+1 RPC calls.
 */
export function useStatementBatchDetails(
  movements: StatementMovement[],
  enabled = true
): {
  detailsMap: Map<string, StatementTransactionDetails>;
  isLoading: boolean;
} {
  const companyId = useAuthStore(s => s.user?.company_id ?? '');
  const { invoiceIds, bondIds, cacheSignature } = useMemo(
    () => collectReferenceIds(movements),
    [movements]
  );

  const query = useQuery<Map<string, StatementTransactionDetails>>({
    queryKey: ['statement_batch_details', companyId, cacheSignature],
    enabled: enabled && companyId.length > 0 && (invoiceIds.length > 0 || bondIds.length > 0),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const map = new Map<string, StatementTransactionDetails>();
      await Promise.all([
        fetchInvoiceDetailsBatch(companyId, invoiceIds, map),
        fetchBondDetailsBatch(companyId, bondIds, map),
      ]);
      return map;
    },
  });

  return {
    detailsMap: query.data ?? new Map<string, StatementTransactionDetails>(),
    isLoading: query.isLoading,
  };
}
