import React, { useMemo, useCallback, useState, useEffect } from 'react';
import SalesStats from './SalesStats';
import ExcelTable from '../../../../ui/common/ExcelTable';
import { useInvoices, useDeleteInvoice } from '../../hooks/index';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../auth/store';
import { salesApi } from '../../api';

import EmptyState from '../../../../ui/base/EmptyState';
import PageLoader from '../../../../ui/base/PageLoader';
import ErrorDisplay from '../../../../ui/base/ErrorDisplay';
import type { InvoiceListItem, InvoiceType } from '../../types';
import { useFeedbackStore } from '../../../feedback/store';
import { useAccompanyingInfoStore } from '../../../accompanying-info';
import InvoiceSearchToolbar from '../../../../ui/common/InvoiceSearchToolbar';
import type { DatePreset } from '@/core/types/invoiceSearch';
import { getDateRangeForPreset } from '@/core/utils/dateUtils';
import { useInvoiceListColumns } from './useInvoiceListColumns';
import EditInvoiceModal from '../edit/EditInvoiceModal';

interface InvoiceListViewProps {
  viewType: InvoiceType;
  searchTerm: string;
  onViewDetails: (id: string) => void;
}

const InvoiceListView: React.FC<InvoiceListViewProps> = ({
  viewType,
  searchTerm,
  onViewDetails,
}) => {
  const [internalSearch, setInternalSearch] = useState(searchTerm || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm || '');
  const [datePreset, setDatePreset] = useState<DatePreset>('this_year');
  const [dateFrom, setDateFrom] = useState<string | undefined>(
    () => getDateRangeForPreset('this_year').from
  );
  const [dateTo, setDateTo] = useState<string | undefined>(
    () => getDateRangeForPreset('this_year').to
  );
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'date' | 'total' | 'number'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(0);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  // Reset to page 0 whenever filters or page size change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, dateFrom, dateTo, statusFilter, paymentMethodFilter, viewType, limit]);

  useEffect(() => {
    if (searchTerm !== undefined && searchTerm !== internalSearch) {
      setInternalSearch(searchTerm);
    }
  }, [searchTerm]);

  useEffect(() => {
    const delay = internalSearch.trim().length > 0 ? 400 : 120;
    const timer = setTimeout(() => {
      setDebouncedSearch(internalSearch);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [internalSearch]);

  const searchParams = useMemo(
    () => ({
      searchTerm: debouncedSearch,
      dateFrom,
      dateTo,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      paymentMethod: paymentMethodFilter !== 'all' ? paymentMethodFilter : undefined,
      type: viewType,
      page,
      limit,
    }),
    [debouncedSearch, dateFrom, dateTo, statusFilter, paymentMethodFilter, viewType, page, limit]
  );

  const { data: invoices, isLoading, error, refetch } = useInvoices(searchParams);
  const { mutate: deleteInvoice, isPending: isDeleting } = useDeleteInvoice();
  const { showToast } = useFeedbackStore();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const handlePrefetchDetails = useCallback(
    (id: string) => {
      void queryClient.prefetchQuery({
        queryKey: ['invoice_details', id],
        queryFn: () => salesApi.getInvoiceDetails(id, user?.company_id),
        staleTime: 1000 * 60 * 5,
      });
    },
    [queryClient, user?.company_id]
  );

  const handleResetFilters = useCallback(() => {
    const currentRange = getDateRangeForPreset('this_year');
    setInternalSearch('');
    setDebouncedSearch('');
    setDatePreset('this_year');
    setDateFrom(currentRange.from);
    setDateTo(currentRange.to);
    setStatusFilter('all');
    setPaymentMethodFilter('all');
    setCurrencyFilter('all');
    setSortBy('date');
    setSortOrder('desc');
  }, []);

  const displayData = useMemo(() => {
    const list = (invoices as InvoiceListItem[]) || [];
    let result = [...list];

    if (currencyFilter !== 'all') {
      result = result.filter(
        inv => (inv.currencyCode || '').toUpperCase() === currencyFilter.toUpperCase()
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'total') {
        cmp = (a.total || 0) - (b.total || 0);
      } else if (sortBy === 'number') {
        cmp = (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '', undefined, {
          numeric: true,
        });
      } else {
        const dateA = new Date(a.date).getTime() || 0;
        const dateB = new Date(b.date).getTime() || 0;
        cmp = dateA - dateB;
        if (cmp === 0) {
          const createdA = new Date(a.createdAt ?? 0).getTime() || 0;
          const createdB = new Date(b.createdAt ?? 0).getTime() || 0;
          if (createdA !== createdB) {
            cmp = createdA - createdB;
          } else {
            cmp = (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '', undefined, {
              numeric: true,
            });
          }
        }
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [invoices, currencyFilter, sortBy, sortOrder]);

  const handleViewDetails = useCallback(
    (id: string) => {
      onViewDetails(id);
    },
    [onViewDetails]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, row: InvoiceListItem) => {
      e.stopPropagation();
      if (
        window.confirm(
          'هل أنت متأكد من حذف/إلغاء هذه الفاتورة؟ سيتم عكس أثرها المالي والمخزني على الأرصدة والقيود تلقائياً.'
        )
      ) {
        deleteInvoice(row.id);
      }
    },
    [deleteInvoice]
  );

  const handleShareExcel = useCallback(
    async (e: React.MouseEvent, row: InvoiceListItem) => {
      e.stopPropagation();
      try {
        const { generateInvoiceExcelBlob, exportInvoiceToExcel } =
          await import('../../../../core/utils/invoiceExcelExporter');
        const fullInvoice = await salesApi.getInvoiceDetails(row.id);
        const mappedItems = (fullInvoice.invoice_items ?? []).map(item => ({
          name: item.description ?? item.product?.name_ar ?? 'صنف',
          sku: item.product?.part_number ?? item.product?.sku ?? '',
          quantity: Number(item.quantity ?? 0),
          unitPrice: Number(item.unit_price ?? 0),
          total: Number(item.total ?? 0),
        }));
        const data = {
          companyName: '',
          companyAddress: '',
          taxNumber: '',
          invoiceNumber: row.invoiceNumber || '',
          issueDate: row.date,
          customerName: row.customerName || 'عميل نقدي',
          issuedBy: '',
          items: mappedItems,
          subtotal: Number(fullInvoice.subtotal ?? row.total),
          totalAmount: row.total,
        };
        const blob = await generateInvoiceExcelBlob(data);
        const file = new File([blob], `فاتورة_${row.invoiceNumber}.xlsx`, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `فاتورة ${row.invoiceNumber}` });
        } else {
          await exportInvoiceToExcel(data);
          showToast('تم تنزيل ملف Excel بنجاح', 'success');
        }
      } catch {
        showToast('فشل في مشاركة الفاتورة', 'error');
      }
    },
    [showToast]
  );

  const columns = useInvoiceListColumns({
    handleViewDetails,
    handleDelete,
    handleShareExcel,
    handlePrefetchDetails,
    handleEditInvoice: (id: string) => setEditingInvoiceId(id),
    isDeleting,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-2 md:space-y-3">
      {viewType === 'sale' && (
        <SalesStats
          dateFrom={dateFrom}
          dateTo={dateTo}
          datePreset={datePreset}
          onDatePresetChange={(preset, range) => {
            setDatePreset(preset);
            setDateFrom(range.from);
            setDateTo(range.to);
          }}
        />
      )}

      <InvoiceSearchToolbar
        searchTerm={internalSearch}
        onSearchChange={setInternalSearch}
        datePreset={datePreset}
        onDatePresetChange={(preset, range) => {
          setDatePreset(preset);
          setDateFrom(range.from);
          setDateTo(range.to);
        }}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        paymentMethodFilter={paymentMethodFilter}
        onPaymentMethodFilterChange={setPaymentMethodFilter}
        currencyFilter={currencyFilter}
        onCurrencyFilterChange={setCurrencyFilter}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(by, order) => {
          setSortBy(by as 'date' | 'total' | 'number');
          setSortOrder(order);
        }}
        totalMatches={displayData.length}
        totalMatchingCount={displayData[0]?.totalMatchingCount || displayData.length}
        limit={limit}
        onLimitChange={setLimit}
        isLoading={isLoading}
        onResetFilters={handleResetFilters}
        scopeLabel="sales"
      />

      {error ? (
        <ErrorDisplay error={error?.message || 'فشل في تحميل البيانات'} onRetry={refetch} />
      ) : isLoading ? (
        <PageLoader />
      ) : displayData.length > 0 ? (
        <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-xl border bg-[var(--app-surface)] shadow-sm dark:border-slate-800 md:min-h-[480px] md:rounded-2xl">
          <ExcelTable
            columns={columns}
            data={displayData.map(item => ({
              ...item,
              invoiceNumber: item.invoiceNumber || '',
              paymentMethod: item.paymentMethod || 'cash',
            }))}
            colorTheme={viewType === 'sale' ? 'blue' : 'orange'}
            onRowDoubleClick={row => {
              handleViewDetails(row.id);
            }}
            onRowClick={row => {
              handlePrefetchDetails(row.id);
              const store = useAccompanyingInfoStore.getState();
              if (store.isOpen) {
                store.setTarget({
                  type: 'invoice',
                  id: row.id,
                  title: `فاتورة ${row.invoiceNumber || row.id.slice(0, 8)}`,
                });
              }
            }}
          />
          {(() => {
            const totalServer = displayData[0]?.totalMatchingCount ?? displayData.length;
            const totalPages = Math.max(1, Math.ceil(totalServer / limit));
            if (totalPages <= 1 && page === 0) return null;
            const rangeStart = page * limit + 1;
            const rangeEnd = page * limit + displayData.length;
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] bg-[var(--app-surface-hover)]/40 px-4 py-2 text-xs font-bold text-[var(--app-text-secondary)]">
                <span>
                  عرض {rangeStart}–{rangeEnd} من أصل {totalServer} فاتورة (صفحة {page + 1} من {totalPages})
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1 text-xs font-bold text-[var(--app-text)] transition-colors hover:bg-blue-50 disabled:opacity-40 dark:hover:bg-blue-900/20"
                  >
                    السابق
                  </button>
                  <button
                    type="button"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1 text-xs font-bold text-[var(--app-text)] transition-colors hover:bg-blue-50 disabled:opacity-40 dark:hover:bg-blue-900/20"
                  >
                    التالي
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <EmptyState
          title="لا توجد فواتير"
          description="لم يتم العثور على أي فواتير أو قطع مطابقة لمعايير البحث المحددة."
        />
      )}
      {editingInvoiceId && (
        <EditInvoiceModal
          invoiceId={editingInvoiceId}
          isOpen={true}
          onClose={() => setEditingInvoiceId(null)}
          onSuccess={() => {
            setEditingInvoiceId(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
};

export default React.memo(InvoiceListView);
