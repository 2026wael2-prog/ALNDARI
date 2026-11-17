import React, { Suspense, lazy } from 'react';
import PurchasesTable from '../PurchasesTable';
import type { ExtractedItem } from '../../../smart-import/components/SmartImportView';
import InvoiceSearchToolbar from '../../../../ui/common/InvoiceSearchToolbar';
import type { DatePreset } from '@/core/types/invoiceSearch';
import type { PurchaseTab } from './usePurchasePrefill';

const CreatePurchaseModal = lazy(() => import('../CreatePurchaseModal'));
const PurchaseReturnsView = lazy(() => import('../Returns/PurchaseReturnsView'));
const PurchaseQuotationsTab = lazy(() => import('../quotations/PurchaseQuotationsTab'));
const SmartImportView = lazy(() => import('../../../smart-import/components/SmartImportView'));
const SupplierBiView = lazy(() =>
  import('../../../reports/components/bi/SupplierBiView').then(m => ({
    default: m.SupplierBiView,
  }))
);
const SupplierPriceComparisonView = lazy(() =>
  import('../../../reports/components/bi/SupplierPriceComparisonView').then(m => ({
    default: m.SupplierPriceComparisonView,
  }))
);

type PurchaseRows = React.ComponentProps<typeof PurchasesTable>['data'];

interface PageContentProps {
  activeTab: PurchaseTab;
  data: PurchaseRows;
  isLoading: boolean;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  datePreset: DatePreset;
  onDatePresetChange: (
    preset: DatePreset,
    range: { from?: string | undefined; to?: string | undefined }
  ) => void;
  dateFrom?: string | undefined;
  onDateFromChange?: ((val: string) => void) | undefined;
  dateTo?: string | undefined;
  onDateToChange?: ((val: string) => void) | undefined;
  statusFilter?: string | undefined;
  onStatusFilterChange?: ((val: string) => void) | undefined;
  paymentMethodFilter?: string | undefined;
  onPaymentMethodFilterChange?: ((val: string) => void) | undefined;
  currencyFilter?: string | undefined;
  onCurrencyFilterChange?: ((curr: string) => void) | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  onSortChange?: ((by: string, order: 'asc' | 'desc') => void) | undefined;
  limit?: number | undefined;
  onLimitChange?: ((limit: number) => void) | undefined;
  onResetFilters: () => void;

  setViewInvoiceId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<PurchaseTab>>;
  handleSmartImportConfirm: (data: {
    items: ExtractedItem[];
    supplierName?: string;
    currency?: string;
  }) => void;
}

export const PurchasePageContent: React.FC<PageContentProps> = ({
  activeTab,
  data,
  isLoading,
  searchTerm,
  onSearchChange,
  datePreset,
  onDatePresetChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  statusFilter,
  onStatusFilterChange,
  paymentMethodFilter,
  onPaymentMethodFilterChange,
  currencyFilter,
  onCurrencyFilterChange,
  sortBy,
  sortOrder,
  onSortChange,
  limit,
  onLimitChange,
  onResetFilters,
  setViewInvoiceId,
  setActiveTab,
  handleSmartImportConfirm,
}) => {
  switch (activeTab) {
    case 'create':
      return (
        <Suspense fallback={null}>
          <CreatePurchaseModal
            onSuccess={() => {
              setActiveTab('list');
            }}
          />
        </Suspense>
      );
    case 'smart_import':
      return (
        <Suspense fallback={null}>
          <SmartImportView mode="invoice" onConfirm={handleSmartImportConfirm} />
        </Suspense>
      );
    case 'list':
      return (
        <div className="flex min-h-0 flex-1 flex-col space-y-3">
          <InvoiceSearchToolbar
            searchTerm={searchTerm}
            onSearchChange={onSearchChange}
            datePreset={datePreset}
            onDatePresetChange={onDatePresetChange}
            dateFrom={dateFrom}
            onDateFromChange={onDateFromChange}
            dateTo={dateTo}
            onDateToChange={onDateToChange}
            statusFilter={statusFilter}
            onStatusFilterChange={onStatusFilterChange}
            paymentMethodFilter={paymentMethodFilter}
            onPaymentMethodFilterChange={onPaymentMethodFilterChange}
            currencyFilter={currencyFilter}
            onCurrencyFilterChange={onCurrencyFilterChange}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={onSortChange}
            totalMatches={data.length}
            totalMatchingCount={(data[0] as any)?.total_matching_count || data.length}
            limit={limit}
            onLimitChange={onLimitChange}
            isLoading={isLoading}
            onResetFilters={onResetFilters}
            scopeLabel="purchases"
          />
          <PurchasesTable data={data} isLoading={isLoading} onView={setViewInvoiceId} />
        </div>
      );

    case 'returns':
      return (
        <Suspense fallback={null}>
          <PurchaseReturnsView searchTerm={searchTerm} onViewDetails={setViewInvoiceId} />
        </Suspense>
      );
    case 'quotations':
      return (
        <Suspense fallback={null}>
          <PurchaseQuotationsTab
            onConvertToPurchase={() => {
              setActiveTab('create');
            }}
          />
        </Suspense>
      );
    case 'bi_suppliers':
      return (
        <Suspense fallback={null}>
          <SupplierBiView />
        </Suspense>
      );
    case 'bi_prices':
      return (
        <Suspense fallback={null}>
          <SupplierPriceComparisonView />
        </Suspense>
      );
    default:
      return null;
  }
};

