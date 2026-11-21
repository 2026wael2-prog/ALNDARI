import { useMemo, useState } from 'react';
import { useUnpaidPartyInvoices } from '../hooks';

export type SortField = 'issue_date' | 'total_amount' | 'remaining_amount' | 'invoice_number';
export type SortOrder = 'asc' | 'desc';
export type FilterStatus = 'all' | 'unpaid' | 'partial';

/**
 * Fetches unpaid party invoices and handles status filtering, smart item/number search,
 * column sorting, and base-currency SAR totals computation.
 */
export const usePartyInvoicesFilter = (partyId: string, partyType: 'customer' | 'supplier') => {
  const { data: invoices, isLoading } = useUnpaidPartyInvoices(partyId, partyType);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
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

  const processedInvoices = useMemo(() => {
    if (!invoices) return [];

    let list = invoices.map((inv: any) => {
      const total = Number(inv.total_amount || 0);
      const paid = Number(inv.paid_amount || 0);
      const remaining = Math.max(0, total - paid);
      const isPartial = paid > 0;
      return {
        ...inv,
        _total: total,
        _paid: paid,
        _remaining: remaining,
        _isPartial: isPartial,
      };
    });

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
        if (inv._total.toString().includes(lowerQuery)) return true;
        if (inv._remaining.toString().includes(lowerQuery)) return true;

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
  }, [invoices, searchQuery, statusFilter, sortField, sortOrder]);

  const totals = useMemo(() => {
    // invoices.total_amount and paid_amount are ALREADY stored in base currency (SAR)
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

  return {
    invoices,
    isLoading,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    handleSort,
    processedInvoices,
    totals,
  };
};
