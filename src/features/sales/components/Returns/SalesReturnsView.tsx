import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw } from 'lucide-react';
import { formatCurrency, sumInBaseCurrency } from '../../../../core/utils';
import { formatLocalDate } from '../../../../core/utils/dateUtils';
import { logger } from '../../../../core/utils/logger';
import { exportToPDF } from '../../../../core/utils/pdfExporter';
import Button from '../../../../ui/base/Button';
import ExcelTable from '../../../../ui/common/ExcelTable';
import { useAuthStore } from '../../../auth/store';
import { AdvancedReturnModal } from '../../../returns/components/AdvancedReturnModal';
import { ReturnsFilterControls } from '../../../returns/components/view/ReturnsFilterControls';
import { ReturnsStatsHeader } from '../../../returns/components/view/ReturnsStatsHeader';
import { useReturnsListView } from '../../../returns/hooks/useReturnsListView';
import { salesApi } from '../../api';
import { useDeleteInvoice } from '../../hooks/index';
import { useSalesReturns, useSalesReturnsStats } from '../../hooks/useSalesReturns';
import {
  normalizeSalesReturn,
  type SalesReturnRow,
  useSalesReturnsColumns,
} from './useSalesReturnsColumns';

interface SalesReturnsViewProps {
  searchTerm: string;
  onViewDetails: (id: string) => void;
}

const SalesReturnsView: React.FC<SalesReturnsViewProps> = ({
  searchTerm: propSearchTerm,
  onViewDetails,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: stats } = useSalesReturnsStats();
  const { mutate: deleteInvoice, isPending: isDeleting } = useDeleteInvoice();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const handlePrefetchDetails = React.useCallback(
    (id: string) => {
      void queryClient.prefetchQuery({
        queryKey: ['invoice_details', id],
        queryFn: () => salesApi.getInvoiceDetails(id, user?.company_id),
        staleTime: 1000 * 60 * 5,
      });
    },
    [queryClient, user?.company_id]
  );

  const [queryFilters, setQueryFilters] = useState({
    status: '',
    startDate: '',
    endDate: '',
  });

  const {
    data: returns,
    isLoading,
    refetch,
  } = useSalesReturns({
    searchTerm: propSearchTerm || '',
    status: queryFilters.status || undefined,
    startDate: queryFilters.startDate || undefined,
    endDate: queryFilters.endDate || undefined,
  });

  const normalizedReturns = (returns || []).map(normalizeSalesReturn);

  const {
    localSearchTerm,
    setLocalSearchTerm,
    showFilters,
    setShowFilters,
    filters,
    setFilters,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    processedReturns,
    totalAmount,
    handleExportExcel,
    clearFilters,
    hasActiveFilters,
  } = useReturnsListView(normalizedReturns, 'sales', filteredReturns => {
    try {
      return sumInBaseCurrency(filteredReturns as SalesReturnRow[]);
    } catch {
      return 0;
    }
  });

  React.useEffect(() => {
    if (propSearchTerm) {
      setLocalSearchTerm(propSearchTerm);
    }
  }, [propSearchTerm, setLocalSearchTerm]);

  React.useEffect(() => {
    setQueryFilters({
      status: filters.status,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });
  }, [filters.status, filters.startDate, filters.endDate]);

  const handlePrint = async () => {
    if (!printRef.current) return;
    try {
      await exportToPDF(printRef.current, `مرتجعات_المبيعات_${formatLocalDate()}`);
    } catch (error) {
      logger.error('SalesReturnsView', 'Print error:', error);
    }
  };

  const columns = useSalesReturnsColumns({
    onPrefetchDetails: handlePrefetchDetails,
    onViewDetails,
    onDeleteInvoice: deleteInvoice,
    isDeleting,
  });

  return (
    <div className="animate-in fade-in space-y-3 pt-2 duration-300" ref={printRef}>
      <ReturnsStatsHeader
        returnCount={stats?.returnCount || 0}
        totalReturns={stats?.totalReturns || 0}
        avgReturn={stats?.avgReturn || 0}
        pendingCount={stats?.pendingCount || 0}
        type="sales"
      />

      <ReturnsFilterControls
        localSearchTerm={localSearchTerm}
        setLocalSearchTerm={setLocalSearchTerm}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        filters={filters}
        setFilters={setFilters}
        sortField={sortField}
        setSortField={setSortField}
        sortDirection={sortDirection}
        setSortDirection={setSortDirection}
        hasActiveFilters={hasActiveFilters}
        clearFilters={clearFilters}
        handleExportExcel={handleExportExcel}
        handlePrint={handlePrint}
        refetch={refetch}
        isLoading={isLoading}
        hasData={processedReturns.length > 0}
        type="sales"
      />

      <div className="flex justify-end">
        <Button
          onClick={() => {
            setIsModalOpen(true);
          }}
          variant="danger"
          size="sm"
          leftIcon={<Plus size={14} />}
        >
          مرتجع مبيعات جديد
        </Button>
      </div>

      <div className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-xl border border-gray-100 bg-[var(--app-surface)] shadow-sm dark:border-slate-800">
        {isLoading ? (
          <div className="space-y-4 p-8 max-md:p-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-10 w-full animate-pulse rounded bg-gray-50 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : processedReturns.length === 0 ? (
          <div className="py-20 text-center text-gray-500">
            <RotateCcw size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium">لا توجد مرتجعات مبيعات</p>
            <p className="mt-1 text-sm text-gray-400">قم بإنشاء مرتجع جديد للبدء</p>
          </div>
        ) : (
          <ExcelTable
            columns={columns}
            data={processedReturns as unknown as SalesReturnRow[]}
            colorTheme="indigo"
            isRTL={true}
            onRowDoubleClick={row => {
              onViewDetails(row.id);
            }}
            onRowClick={row => {
              handlePrefetchDetails(row.id);
            }}
            showSearch={false}
            pageSize={10}
          />
        )}
      </div>

      {processedReturns.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20 max-md:p-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-red-800 dark:text-red-300">
              إجمالي المرتجعات المعروضة:
            </span>
            <div className="flex flex-col items-end text-left">
              <span className="text-xl font-bold text-red-600 dark:text-red-400">
                {formatCurrency(totalAmount, 'SAR')}
              </span>
              <span className="text-[10px] font-medium text-gray-400">
                إجمالي القيمة بالريال السعودي
              </span>
            </div>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            عدد النتائج: {processedReturns.length} من {normalizedReturns.length}
          </div>
        </div>
      )}

      <AdvancedReturnModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
        }}
        returnType="sale"
        partyName="عميل"
        onSuccess={() => {
          setIsModalOpen(false);
          refetch();
        }}
      />
    </div>
  );
};

export default SalesReturnsView;
