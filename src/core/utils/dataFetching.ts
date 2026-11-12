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
    return `${y}-${m}-${day}`;
  };

  return {
    startDate: format(prevStartD),
    endDate: format(prevEndD),
  };
};

/**
 * High-performance decoupled batch lookup for parties (customers/suppliers).
 * Replaces slow PostgREST nested joins with an instant primary-key scan.
 */
export const batchLookupParties = async (
  partyIds: (string | null | undefined)[],
  client: SupabaseClient
): Promise<Map<string, BatchPartyInfo>> => {
  const map = new Map<string, BatchPartyInfo>();
  const uniqueIds = Array.from(new Set(partyIds.filter((id): id is string => Boolean(id))));

  if (uniqueIds.length === 0) return map;

  const { data, error } = await client
    .from('parties')
    .select('id, name, phone')
    .in('id', uniqueIds);

  if (error || !data) return map;

  for (const row of data) {
    if (row.id) {
      map.set(row.id, {
        id: row.id,
        name: row.name || 'عميل',
        phone: row.phone,
      });
    }
  }

  return map;
};

/**
 * High-performance decoupled batch lookup for products.
 * Replaces slow PostgREST nested joins with an instant primary-key scan.
 */
export const batchLookupProducts = async (
  productIds: (string | null | undefined)[],
  client: SupabaseClient
): Promise<Map<string, BatchProductInfo>> => {
  const map = new Map<string, BatchProductInfo>();
  const uniqueIds = Array.from(new Set(productIds.filter((id): id is string => Boolean(id))));

  if (uniqueIds.length === 0) return map;

  const { data, error } = await client
    .from('products')
    .select('id, name_ar, sku, part_number, brand')
    .in('id', uniqueIds);

  if (error || !data) return map;

  for (const row of data) {
    if (row.id) {
      map.set(row.id, {
        id: row.id,
        name_ar: row.name_ar || 'صنف',
        sku: row.sku,
        part_number: row.part_number,
        brand: row.brand,
      });
    }
  }

  return map;
};

