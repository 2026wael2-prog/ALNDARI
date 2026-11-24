import { useMemo, useState } from 'react';
import { useUnpaidPartyInvoices } from '../hooks';
import { resolveInvoiceDocumentAmounts } from '../invoiceAllocationGuard';

export type SortField = 'issue_date' | 'total_amount' | 'remaining_amount' | 'invoice_number';
export type SortOrder = 'asc' | 'desc';
export type FilterStatus = 'all' | 'unpaid' | 'partial';

export interface InvoiceCurrencyTotals {
  currency: string;
  count: number;
  total: number;
  paid: number;
  remaining: number;
}

/**
 * Fetches unpaid party invoices and handles status filtering, currency filtering,
 * smart item/number search, column sorting, and strict per-currency totals computation.
 */
export const usePartyInvoicesFilter = (partyId: string, partyType: 'customer' | 'supplier') => {
  const { data: invoices, isLoading } = useUnpaidPartyInvoices(partyId, partyType);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('issue_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const normalizedInvoices = useMemo(() => {
    if (!invoices) return [];

    return invoices.map((inv: any) => {
      const resolved = resolveInvoiceDocumentAmounts(inv);
      return {
        ...inv,
        _currency: resolved.currency,
        _total: resolved.baseTotal,
        _paid: resolved.basePaid,
        _remaining: resolved.baseRemaining,
        _docTotal: resolved.docTotal,
        _docPaid: resolved.docPaid,
        _docRemaining: resolved.docRemaining,
        _displayRate: resolved.displayRate,
        _isForeign: resolved.isForeign,
        _isPartial: resolved.isPartial,
      };
    });
  }, [invoices]);

  const availableCurrencies = useMemo(() => {
    const set = new Set<string>();
    normalizedInvoices.forEach((inv: any) => {
      if (inv._currency) set.add(inv._currency);
    });
    return Array.from(set).sort();
  }, [normalizedInvoices]);

  const processedInvoices = useMemo(() => {
    let list = [...normalizedInvoices];

    if (currencyFilter !== 'ALL') {
      list = list.filter((inv: any) => inv._currency === currencyFilter);
    }

    if (statusFilter === 'partial') {
      list = list.filter((inv: any) => inv._isPartial);
    } else if (statusFilter === 'unpaid') {
      list = list.filter((inv: any) => !inv._isPartial);
    }

    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase().trim();
      list = list.filter((inv: any) => {
        if (inv.invoice_number?.toLowerCase().includes(lowerQuery)) return true;
        if (inv.notes?.toLowerCase().includes(lowerQuery)) return true;
        if (inv.issue_date?.includes(lowerQuery)) return true;
        if (inv._currency?.toLowerCase().includes(lowerQuery)) return true;
        if (inv._total.toString().includes(lowerQuery)) return true;
        if (inv._remaining.toString().includes(lowerQuery)) return true;
        if (inv._docTotal?.toString().includes(lowerQuery)) return true;
        if (inv._docRemaining?.toString().includes(lowerQuery)) return true;

        if (inv.invoice_items && inv.invoice_items.length > 0) {
          return inv.invoice_items.some((item: any) => {
            const product = item.product || {};
            return (
              product.name_ar?.toLowerCase().includes(lowerQuery) ||
              product.sku?.toLowerCase().includes(lowerQuery) ||
              product.part_number?.toLowerCase().includes(lowerQuery) ||
              product.brand?.toLowerCase().includes(lowerQuery)
            );
          });
        }
        return false;
      });
    }

    list.sort((a: any, b: any) => {
      let comparison = 0;
      if (sortField === 'issue_date') {
        comparison = new Date(a.issue_date || 0).getTime() - new Date(b.issue_date || 0).getTime();
      } else if (sortField === 'total_amount') {
        comparison = a._total - b._total;
      } else if (sortField === 'remaining_amount') {
        comparison = a._remaining - b._remaining;
      } else if (sortField === 'invoice_number') {
        comparison = (a.invoice_number || '').localeCompare(b.invoice_number || '');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return list;
  }, [normalizedInvoices, currencyFilter, searchQuery, statusFilter, sortField, sortOrder]);

  const totals = useMemo(() => {
    return processedInvoices.reduce(
      (acc, curr) => {
        acc.total += curr._total;
        acc.paid += curr._paid;
        acc.remaining += curr._remaining;
        return acc;
      },
      { total: 0, paid: 0, remaining: 0 }
    );
  }, [processedInvoices]);

  // Strict per-currency totals so SAR and YER unpaid invoices are never silently mixed
  const totalsByCurrency = useMemo<InvoiceCurrencyTotals[]>(() => {
    const map = new Map<string, InvoiceCurrencyTotals>();
    for (const inv of processedInvoices) {
      const code = inv._currency || 'SAR';
      const entry = map.get(code) ?? { currency: code, count: 0, total: 0, paid: 0, remaining: 0 };
      entry.count += 1;
      entry.total = Math.round((entry.total + inv._docTotal) * 100) / 100;
      entry.paid = Math.round((entry.paid + inv._docPaid) * 100) / 100;
      entry.remaining = Math.round((entry.remaining + inv._docRemaining) * 100) / 100;
      map.set(code, entry);
    }
    return Array.from(map.values());
  }, [processedInvoices]);

  return {
    invoices,
    isLoading,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    currencyFilter,
    setCurrencyFilter,
    availableCurrencies,
    handleSort,
    processedInvoices,
    totals,
    totalsByCurrency,
  };
};
