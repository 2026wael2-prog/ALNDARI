import type { ProductIntelligenceSummary, PurchaseRecommendation } from '../../types';

export type IntelligenceSortField =
  | 'default'
  | 'name'
  | 'partType'
  | 'size'
  | 'supplier'
  | 'customer'
  | 'branchStock'
  | 'branchDemand'
  | 'qty365d'
  | 'stockValue'
  | 'forecast30d';

export type SortDirection = 'asc' | 'desc';

export interface IntelligenceFilterState {
  search: string;
  partType: string;
  size: string;
  supplierId: string;
  customerId: string;
  branchId: string;
  sortBy: IntelligenceSortField;
  sortDir: SortDirection;
}

export const DEFAULT_INTELLIGENCE_FILTERS: IntelligenceFilterState = {
  search: '',
  partType: 'all',
  size: 'all',
  supplierId: 'all',
  customerId: 'all',
  branchId: 'all',
  sortBy: 'default',
  sortDir: 'desc',
};

const arCollator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

function compareStrings(a: string, b: string, dir: SortDirection): number {
  if (a === b) return 0;
  if (!a) return dir === 'asc' ? 1 : -1;
  if (!b) return dir === 'asc' ? -1 : 1;
  const res = arCollator.compare(a, b);
  return dir === 'asc' ? res : -res;
}

function compareNumbers(a: number, b: number, dir: SortDirection): number {
  return dir === 'asc' ? a - b : b - a;
}

const filterOptionsCache = new WeakMap<
  ProductIntelligenceSummary[],
  {
    partTypes: string[];
    sizes: string[];
    suppliers: Array<{ id: string; name: string }>;
    customers: Array<{ id: string; name: string }>;
  }
>();

export function extractFilterOptions(products: ProductIntelligenceSummary[]) {
  if (filterOptionsCache.has(products)) {
    return filterOptionsCache.get(products)!;
  }

  const partTypeCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  const suppliers = new Map<string, string>();
  const customers = new Map<string, string>();

  for (const p of products) {
    if (p.identity.partType) {
      partTypeCounts.set(p.identity.partType, (partTypeCounts.get(p.identity.partType) ?? 0) + 1);
    }
    if (p.identity.size && p.identity.size !== '—') {
      sizeCounts.set(p.identity.size, (sizeCounts.get(p.identity.size) ?? 0) + 1);
    }
    for (const s of p.suppliers) {
      if (s.supplierId && s.supplierName) suppliers.set(s.supplierId, s.supplierName);
    }
    if (p.lastSupplier?.supplierId && p.lastSupplier?.supplierName) {
      suppliers.set(p.lastSupplier.supplierId, p.lastSupplier.supplierName);
    }
    for (const c of p.topCustomers) {
      if (c.customerId && c.customerName) customers.set(c.customerId, c.customerName);
    }
  }

  const result = {
    partTypes: Array.from(partTypeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([k]) => k)
      .sort((a, b) => arCollator.compare(a, b)),
    sizes: Array.from(sizeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80)
      .map(([k]) => k)
      .sort((a, b) => arCollator.compare(a, b)),
    suppliers: Array.from(suppliers.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => arCollator.compare(a.name, b.name))
      .slice(0, 150),
    customers: Array.from(customers.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => arCollator.compare(a.name, b.name))
      .slice(0, 150),
  };

  filterOptionsCache.set(products, result);
  return result;
}

const productMapCache = new WeakMap<
  ProductIntelligenceSummary[],
  Map<string, ProductIntelligenceSummary>
>();

export function getProductMap(
  products: ProductIntelligenceSummary[]
): Map<string, ProductIntelligenceSummary> {
  const cached = productMapCache.get(products);
  if (cached) return cached;
  const map = new Map<string, ProductIntelligenceSummary>();
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    map.set(p.identity.productId, p);
  }
  productMapCache.set(products, map);
  return map;
}

const searchHaystackCache = new WeakMap<ProductIntelligenceSummary, string>();

function getSearchHaystack(p: ProductIntelligenceSummary): string {
  const cached = searchHaystackCache.get(p);
  if (cached !== undefined) return cached;
  let text = `${p.identity.name || ''} ${p.identity.partType || ''} ${p.identity.size || ''} ${p.identity.sku || ''} ${p.identity.partNumber || ''} ${p.identity.brand || ''}`;
  if (p.suppliers.length > 0) {
    for (let i = 0; i < p.suppliers.length; i++) {
      text += ' ' + (p.suppliers[i].supplierName || '');
    }
  }
  if (p.topCustomers.length > 0) {
    for (let i = 0; i < p.topCustomers.length; i++) {
      text += ' ' + (p.topCustomers[i].customerName || '');
    }
  }
  const normalized = text.toLowerCase();
  searchHaystackCache.set(p, normalized);
  return normalized;
}

export function filterAndSortProducts(
  products: ProductIntelligenceSummary[],
  filters: IntelligenceFilterState
): ProductIntelligenceSummary[] {
  const q = filters.search.trim().toLowerCase();
  const hasFilters =
    q !== '' ||
    filters.partType !== 'all' ||
    filters.size !== 'all' ||
    filters.supplierId !== 'all' ||
    filters.customerId !== 'all' ||
    filters.branchId !== 'all';

  const filtered = hasFilters
    ? products.filter(p => {
        if (filters.partType !== 'all' && p.identity.partType !== filters.partType) return false;
        if (filters.size !== 'all' && p.identity.size !== filters.size) return false;

        if (filters.supplierId !== 'all') {
          const hasSupplier =
            p.suppliers.some(s => s.supplierId === filters.supplierId) ||
            p.lastSupplier?.supplierId === filters.supplierId;
          if (!hasSupplier) return false;
        }

        if (filters.customerId !== 'all') {
          const hasCustomer = p.topCustomers.some(
            c =>
              c.customerId === filters.customerId &&
              (filters.branchId === 'all' || !c.branchId || c.branchId === filters.branchId)
          );
          if (!hasCustomer) return false;
        }

        if (filters.branchId !== 'all') {
          const bm = p.branchMetrics.find(b => b.branchId === filters.branchId);
          if (!bm || (bm.physicalStock <= 0 && bm.qty365d <= 0)) return false;
        }

        if (q && !getSearchHaystack(p).includes(q)) return false;

        return true;
      })
    : products;

  if (filters.sortBy === 'default') return filtered;

  return [...filtered].sort((a, b) => {
    const dir = filters.sortDir;
    switch (filters.sortBy) {
      case 'name':
        return compareStrings(a.identity.name, b.identity.name, dir);
      case 'partType':
        return compareStrings(a.identity.partType, b.identity.partType, dir);
      case 'size': {
        const keyDiff = compareNumbers(a.identity.sizeSortKey, b.identity.sizeSortKey, dir);
        return keyDiff !== 0 ? keyDiff : compareStrings(a.identity.size, b.identity.size, dir);
      }
      case 'supplier':
        return compareStrings(
          a.suppliers[0]?.supplierName ?? a.lastSupplier?.supplierName ?? '—',
          b.suppliers[0]?.supplierName ?? b.lastSupplier?.supplierName ?? '—',
          dir
        );
      case 'customer':
        return compareStrings(
          a.topCustomers[0]?.customerName ?? '—',
          b.topCustomers[0]?.customerName ?? '—',
          dir
        );
      case 'branchStock': {
        const aStock =
          filters.branchId !== 'all'
            ? (a.branchMetrics.find(bm => bm.branchId === filters.branchId)?.availableStock ?? 0)
            : a.companyMetrics.availableStock;
        const bStock =
          filters.branchId !== 'all'
            ? (b.branchMetrics.find(bm => bm.branchId === filters.branchId)?.availableStock ?? 0)
            : b.companyMetrics.availableStock;
        return compareNumbers(aStock, bStock, dir);
      }
      case 'branchDemand': {
        const aDem =
          filters.branchId !== 'all'
            ? (a.branchMetrics.find(bm => bm.branchId === filters.branchId)?.qty365d ?? 0)
            : a.companyMetrics.qty365d;
        const bDem =
          filters.branchId !== 'all'
            ? (b.branchMetrics.find(bm => bm.branchId === filters.branchId)?.qty365d ?? 0)
            : b.companyMetrics.qty365d;
        return compareNumbers(aDem, bDem, dir);
      }
      case 'qty365d':
        return compareNumbers(a.companyMetrics.qty365d, b.companyMetrics.qty365d, dir);
      case 'stockValue':
        return compareNumbers(a.companyMetrics.stockValue, b.companyMetrics.stockValue, dir);
      case 'forecast30d':
        return compareNumbers(a.forecast30d.predictedQty, b.forecast30d.predictedQty, dir);
      default:
        return 0;
    }
  });
}

export function filterAndSortPurchaseRecommendations(
  recommendations: PurchaseRecommendation[],
  productMap: Map<string, ProductIntelligenceSummary>,
  filters: IntelligenceFilterState
): PurchaseRecommendation[] {
  const q = filters.search.trim().toLowerCase();

  const filtered = recommendations.filter(r => {
    const prod = productMap.get(r.productId);
    if (filters.partType !== 'all' && prod?.identity.partType !== filters.partType) return false;
    if (filters.size !== 'all' && prod?.identity.size !== filters.size) return false;

    if (filters.supplierId !== 'all') {
      const hasSup =
        r.recommendedSupplier?.supplierId === filters.supplierId ||
        r.alternativeSuppliers.some(s => s.supplierId === filters.supplierId);
      if (!hasSup) return false;
    }

    if (filters.customerId !== 'all') {
      const hasCust = prod?.topCustomers.some(c => c.customerId === filters.customerId) ?? false;
      if (!hasCust) return false;
    }

    if (filters.branchId !== 'all') {
      const bShortage = r.calculationBreakdown.branchShortageBreakdown?.find(
        b => b.branchId === filters.branchId
      );
      if (!bShortage || bShortage.shortage <= 0) return false;
    }

    if (q) {
      const text = [
        r.productName,
        prod?.identity.partType ?? '',
        prod?.identity.size ?? '',
        r.sku,
        r.partNumber,
        r.brand,
        r.recommendedSupplier?.supplierName ?? '',
        ...(prod?.topCustomers.map(c => c.customerName) ?? []),
      ]
        .join(' ')
        .toLowerCase();
      if (!text.includes(q)) return false;
    }

    return true;
  });

  if (filters.sortBy === 'default') return filtered;

  return [...filtered].sort((a, b) => {
    const pa = productMap.get(a.productId);
    const pb = productMap.get(b.productId);
    const dir = filters.sortDir;

    switch (filters.sortBy) {
      case 'name':
        return compareStrings(a.productName, b.productName, dir);
      case 'partType':
        return compareStrings(pa?.identity.partType ?? '—', pb?.identity.partType ?? '—', dir);
      case 'size': {
        const keyDiff = compareNumbers(
          pa?.identity.sizeSortKey ?? Number.MAX_SAFE_INTEGER,
          pb?.identity.sizeSortKey ?? Number.MAX_SAFE_INTEGER,
          dir
        );
        return keyDiff !== 0
          ? keyDiff
          : compareStrings(pa?.identity.size ?? '—', pb?.identity.size ?? '—', dir);
      }
      case 'supplier':
        return compareStrings(
          a.recommendedSupplier?.supplierName ?? '—',
          b.recommendedSupplier?.supplierName ?? '—',
          dir
        );
      case 'customer':
        return compareStrings(
          pa?.topCustomers[0]?.customerName ?? '—',
          pb?.topCustomers[0]?.customerName ?? '—',
          dir
        );
      case 'branchStock': {
        const sa =
          filters.branchId !== 'all'
            ? (pa?.branchMetrics.find(bm => bm.branchId === filters.branchId)?.availableStock ?? 0)
            : a.availableStock;
        const sb =
          filters.branchId !== 'all'
            ? (pb?.branchMetrics.find(bm => bm.branchId === filters.branchId)?.availableStock ?? 0)
            : b.availableStock;
        return compareNumbers(sa, sb, dir);
      }
      case 'branchDemand': {
        const da =
          filters.branchId !== 'all'
            ? (a.calculationBreakdown.branchShortageBreakdown?.find(
                x => x.branchId === filters.branchId
              )?.shortage ?? 0)
            : a.recommendedQty;
        const db =
          filters.branchId !== 'all'
            ? (b.calculationBreakdown.branchShortageBreakdown?.find(
                x => x.branchId === filters.branchId
              )?.shortage ?? 0)
            : b.recommendedQty;
        return compareNumbers(da, db, dir);
      }
      case 'qty365d':
        return compareNumbers(a.historicalSold365d, b.historicalSold365d, dir);
      case 'stockValue':
        return compareNumbers(a.estimatedCost, b.estimatedCost, dir);
      case 'forecast30d':
        return compareNumbers(a.forecastDemand30d, b.forecastDemand30d, dir);
      default:
        return 0;
    }
  });
}
