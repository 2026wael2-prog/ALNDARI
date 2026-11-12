import React from 'react';
import PurchasesTable from '../PurchasesTable';
import CreatePurchaseModal from '../CreatePurchaseModal';
import PurchasesAnalytics from '../Analytics/PurchasesAnalytics';
import PurchaseReturnsView from '../Returns/PurchaseReturnsView';
import PurchaseQuotationsTab from '../quotations/PurchaseQuotationsTab';
import SmartImportView, { type ExtractedItem } from '../../../smart-import/components/SmartImportView';
import InvoiceSearchToolbar from '../../../../ui/common/InvoiceSearchToolbar';
import type { DatePreset } from '@/core/types/invoiceSearch';
import type { PurchaseTab } from './usePurchasePrefill';

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
        <CreatePurchaseModal
          onSuccess={() => {
            setActiveTab('list');
          }}
        />
      );
    case 'smart_import':
      return <SmartImportView mode="invoice" onConfirm={handleSmartImportConfirm} />;
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
      return <PurchaseReturnsView searchTerm={searchTerm} onViewDetails={setViewInvoiceId} />;
    case 'quotations':
      return (
        <PurchaseQuotationsTab
          onConvertToPurchase={() => {
            setActiveTab('create');
          }}
        />
      );
    case 'analytics':
      return <PurchasesAnalytics />;
    default:
      return null;
  }
};
