import type { SupabaseClient } from '@supabase/supabase-js';

export interface BatchPartyInfo {
  id: string;
  name: string;
  phone?: string | null;
}

export interface BatchProductInfo {
  id: string;
  name_ar: string;
  sku?: string | null;
  part_number?: string | null;
  brand?: string | null;
}

/**
 * Calculates a symmetrical previous date window [prevStart, prevEnd] for delta/trend comparison.
 */
export const computePreviousDateRange = (
  startDate: string,
  endDate: string
): { startDate: string; endDate: string } => {
  const startD = new Date(startDate);
  const endD = new Date(endDate);
  const diffMs = endD.getTime() - startD.getTime();
  const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);

  const prevEndD = new Date(startD.getTime() - 24 * 60 * 60 * 1000);
  const prevStartD = new Date(prevEndD.getTime() - (diffDays - 1) * 24 * 60 * 60 * 1000);

  const format = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${String(y)}-${m}-${day}`;
  };

  return {
    startDate: format(prevStartD),
    endDate: format(prevEndD),
  };
};

interface RawPartyLookupRow {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
}

interface RawProductLookupRow {
  id?: string | null;
  name_ar?: string | null;
  sku?: string | null;
  part_number?: string | null;
  brand?: string | null;
}

const toBatchPartyInfo = (row: RawPartyLookupRow): BatchPartyInfo | null => {
  if (typeof row.id !== 'string' || row.id.length === 0) return null;
  return {
    id: row.id,
    name: typeof row.name === 'string' && row.name.length > 0 ? row.name : 'عميل',
    phone: row.phone ?? null,
  };
};

const toBatchProductInfo = (row: RawProductLookupRow): BatchProductInfo | null => {
  if (typeof row.id !== 'string' || row.id.length === 0) return null;
  return {
    id: row.id,
    name_ar: typeof row.name_ar === 'string' && row.name_ar.length > 0 ? row.name_ar : 'صنف',
    sku: row.sku ?? null,
    part_number: row.part_number ?? null,
    brand: row.brand ?? null,
  };
};

/**
 * High-performance decoupled batch lookup for parties (customers/suppliers).
 * Replaces slow PostgREST nested joins with an instant primary-key scan.
 */
export const batchLookupParties = async (
  partyIds: Array<string | null | undefined>,
  client: SupabaseClient
): Promise<Map<string, BatchPartyInfo>> => {
  const map = new Map<string, BatchPartyInfo>();
  const uniqueIds = Array.from(new Set(partyIds.filter((id): id is string => Boolean(id))));

  if (uniqueIds.length === 0) return map;

  const { data, error } = (await client
    .from('parties')
    .select('id, name, phone')
    .in('id', uniqueIds)) as unknown as {
    data: RawPartyLookupRow[] | null;
    error: unknown;
  };

  if (Boolean(error) || !Array.isArray(data)) return map;

  for (const row of data) {
    const info = toBatchPartyInfo(row);
    if (info) map.set(info.id, info);
  }

  return map;
};

/**
 * High-performance decoupled batch lookup for products.
 * Replaces slow PostgREST nested joins with an instant primary-key scan.
 */
export const batchLookupProducts = async (
  productIds: Array<string | null | undefined>,
  client: SupabaseClient
): Promise<Map<string, BatchProductInfo>> => {
  const map = new Map<string, BatchProductInfo>();
  const uniqueIds = Array.from(new Set(productIds.filter((id): id is string => Boolean(id))));

  if (uniqueIds.length === 0) return map;

  const { data, error } = (await client
    .from('products')
    .select('id, name_ar, sku, part_number, brand')
    .in('id', uniqueIds)) as unknown as {
    data: RawProductLookupRow[] | null;
    error: unknown;
  };

  if (Boolean(error) || !Array.isArray(data)) return map;

  for (const row of data) {
    const info = toBatchProductInfo(row);
    if (info) map.set(info.id, info);
  }

  return map;
};

export interface FetchRpcPagesOptions<T = Record<string, unknown>> {
  orderColumns?: string[];
  pageSize?: number;
  mapRow?: (row: Record<string, unknown>) => T;
}

const normalizeRpcPagesOptions = <T>(
  orderOrOptions: string[] | FetchRpcPagesOptions<T>
): {
  orderColumns: string[];
  pageSize: number;
  mapRow: ((row: Record<string, unknown>) => T) | undefined;
} => {
  if (Array.isArray(orderOrOptions)) {
    return { orderColumns: orderOrOptions, pageSize: 1000, mapRow: undefined };
  }
  return {
    orderColumns: orderOrOptions.orderColumns ?? ['party_id'],
    pageSize: orderOrOptions.pageSize ?? 1000,
    mapRow: orderOrOptions.mapRow,
  };
};

interface RpcPageQueryHandle {
  order?: (col: string, opts: { ascending: boolean }) => unknown;
  range?: (from: number, to: number) => Promise<{ data: unknown; error: unknown }>;
}

const runSingleRpcPage = async (params: {
  client: SupabaseClient;
  fnName: string;
  args: Record<string, unknown>;
  orderColumns: string[];
  from: number;
  pageSize: number;
}): Promise<{ data: unknown; error: unknown }> => {
  let query = params.client.rpc(params.fnName, params.args) as unknown as RpcPageQueryHandle;
  for (const col of params.orderColumns) {
    if (typeof query.order === 'function') {
      query = query.order(col, { ascending: true }) as RpcPageQueryHandle;
    }
  }
  if (typeof query.range === 'function') {
    return await query.range(params.from, params.from + params.pageSize - 1);
  }
  return await (query as unknown as Promise<{ data: unknown; error: unknown }>);
};

const hasRpcError = (error: unknown): boolean => error !== null && error !== undefined;

/**
 * Paginates a PostgREST table-returning RPC in 1,000-row chunks with deterministic
 * ordering so large datasets (e.g. >1,000 party balances/currencies) are never truncated.
 */
export const fetchAllRpcPages = async <T = Record<string, unknown>>(
  client: SupabaseClient,
  fnName: string,
  args: Record<string, unknown>,
  orderOrOptions: string[] | FetchRpcPagesOptions<T> = ['party_id']
): Promise<{ data: T[]; error: unknown }> => {
  const { orderColumns, pageSize, mapRow } = normalizeRpcPagesOptions(orderOrOptions);
  const allRows: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await runSingleRpcPage({
      client,
      fnName,
      args,
      orderColumns,
      from,
      pageSize,
    });

    if (hasRpcError(error)) {
      return { data: allRows, error: allRows.length > 0 ? null : error };
    }
    const rawBatch = Array.isArray(data) ? data : [];
    const batch = mapRow
      ? (rawBatch as Array<Record<string, unknown>>).map(mapRow)
      : (rawBatch as T[]);
    allRows.push(...batch);
    if (batch.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  return { data: allRows, error: null };
};

