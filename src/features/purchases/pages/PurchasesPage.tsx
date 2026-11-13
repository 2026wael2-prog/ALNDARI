import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  FileText,
  History,
  Plus,
  RefreshCw,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import PurchaseStats from '../components/PurchaseStats';
import PurchaseDetailsModal from '../components/PurchaseDetailsModal';
import CreatePaymentModal from '../components/CreatePaymentModal';
import { AuditModal } from '../../accounting/components/AuditModal';
import { usePurchases } from '../hooks';
import MicroHeader from '../../../ui/base/MicroHeader';
import { useTranslation } from '../../../lib/hooks/useTranslation';
import type { ExtractedItem } from '../../smart-import/components/SmartImportView';
import { usePurchaseStore } from '../store';
import { useAuthStore } from '../../auth/store';
import type { DatePreset } from '@/core/types/invoiceSearch';
import {
  usePurchasePrefill,
  type PurchaseTab,
} from '../components/page/usePurchasePrefill';
import { PurchaseHeaderActions } from '../components/page/PurchaseHeaderActions';
import { PurchasePageContent } from '../components/page/PurchasePageContent';

const isPurchaseTab = (value: string): value is PurchaseTab =>
  ['create', 'list', 'returns', 'analytics', 'smart_import', 'quotations'].includes(value);

const PurchasesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PurchaseTab>('list');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'date' | 'total' | 'number'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(50);
  const { t } = useTranslation();
  const { user } = useAuthStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const searchParams = useMemo(
    () => ({
      searchTerm: debouncedSearch,
      dateFrom,
      dateTo,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      paymentMethod: paymentMethodFilter !== 'all' ? paymentMethodFilter : undefined,
      type: activeTab === 'returns' ? 'purchase_return' : 'purchase',
      limit,
      enabled: activeTab === 'list' || activeTab === 'returns',
    }),
    [debouncedSearch, dateFrom, dateTo, statusFilter, paymentMethodFilter, activeTab, limit]
  );

  const { data: allPurchases = [], isLoading } = usePurchases(searchParams);
  const { bulkLoadItems, setMetadata, setSupplier } = usePurchaseStore();
  usePurchasePrefill(setActiveTab);

  const handleResetFilters = useCallback(() => {
    setSearchTerm('');
    setDebouncedSearch('');
    setDatePreset('all');
    setDateFrom(undefined);
    setDateTo(undefined);
    setStatusFilter('all');
    setPaymentMethodFilter('all');
    setCurrencyFilter('all');
    setSortBy('date');
    setSortOrder('desc');
  }, []);

  const handleSmartImportConfirm = useCallback(
    (data: { items: ExtractedItem[]; supplierName?: string; currency?: string }): void => {
      bulkLoadItems(data.items);
      if (data.supplierName !== undefined && data.supplierName !== '')
        setSupplier({ id: 'ai_detected', name: data.supplierName });
      if (data.currency !== undefined && data.currency !== '')
        setMetadata('currency', data.currency);
      setActiveTab('create');
    },
    [bulkLoadItems, setActiveTab, setMetadata, setSupplier]
  );

  const filteredData = useMemo(() => {
    let result = (allPurchases || []) as any[];

    if (currencyFilter !== 'all') {
      result = result.filter(
        p =>
          (p.currency_code || p.currencyCode || '').toUpperCase() === currencyFilter.toUpperCase()
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'total') {
        const totA = Number(a.total_amount ?? a.total ?? 0);
        const totB = Number(b.total_amount ?? b.total ?? 0);
        cmp = totA - totB;
      } else if (sortBy === 'number') {
        const numA = String(a.invoice_number ?? a.invoiceNumber ?? '');
        const numB = String(b.invoice_number ?? b.invoiceNumber ?? '');
        cmp = numA.localeCompare(numB, undefined, { numeric: true });
      } else {
        const dateA = new Date(a.issue_date ?? a.date ?? 0).getTime() || 0;
        const dateB = new Date(b.issue_date ?? b.date ?? 0).getTime() || 0;
        cmp = dateA - dateB;
        if (cmp === 0) {
          const createdA = new Date(a.created_at ?? 0).getTime() || 0;
          const createdB = new Date(b.created_at ?? 0).getTime() || 0;
          if (createdA !== createdB) {
            cmp = createdA - createdB;
          } else {
            const numA = String(a.invoice_number ?? a.invoiceNumber ?? '');
            const numB = String(b.invoice_number ?? b.invoiceNumber ?? '');
            cmp = numA.localeCompare(numB, undefined, { numeric: true });
          }
        }
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [allPurchases, currencyFilter, sortBy, sortOrder]);

  const TABS = [
    { id: 'list', label: t('purchases_log'), icon: History },
    { id: 'create', label: t('new_invoice'), icon: Plus },
    { id: 'smart_import', label: 'استيراد ذكي (AI)', icon: Sparkles },
    { id: 'returns', label: t('supplier_returns'), icon: RefreshCw },
    { id: 'quotations', label: 'عروض الأسعار', icon: FileText },
    { id: 'analytics', label: t('financial_analytics'), icon: BarChart3 },
  ];

  return (
    <div className="font-cairo flex h-full flex-col bg-gray-50 dark:bg-slate-950">
      <MicroHeader
        title={activeTab === 'create' ? 'فاتورة توريد جديدة' : t('purchasing_and_supply')}
        icon={ShoppingCart}
        iconColor="text-blue-600"
        actions={
          activeTab === 'create' ? (
            <button
              type="button"
              onClick={() => {
                setActiveTab('list');
              }}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-xs font-bold text-[var(--app-text)] shadow-xs transition-all hover:bg-[var(--app-surface-hover)] active:scale-95"
            >
              <History size={13} className="text-blue-500" />
              <span>سجل الفواتير</span>
            </button>
          ) : (
            <PurchaseHeaderActions
              user={user}
              setIsPaymentModalOpen={setIsPaymentModalOpen}
              setIsAuditOpen={setIsAuditOpen}
            />
          )
        }
        {...(activeTab !== 'create'
          ? {
              tabs: TABS,
              searchPlaceholder: t('search_by_invoice_or_supplier'),
              searchValue: searchTerm,
              onSearchChange: setSearchTerm,
            }
          : {})}
        activeTab={activeTab}
        onTabChange={(id: string): void => {
          if (isPurchaseTab(id)) setActiveTab(id);
        }}
      />
      <div className="custom-scrollbar flex-1 overflow-y-auto px-2 pb-16 pt-0">
        <div className="h-full space-y-3 pt-2">
          {activeTab !== 'analytics' && activeTab !== 'create' && activeTab !== 'smart_import' && (
            <PurchaseStats />
          )}
          <div className="animate-in fade-in slide-in-from-bottom-1 h-full">
            <PurchasePageContent
              activeTab={activeTab}
              data={filteredData}
              isLoading={isLoading}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
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
              limit={limit}
              onLimitChange={setLimit}
              onResetFilters={handleResetFilters}
              setViewInvoiceId={setViewInvoiceId}
              setActiveTab={setActiveTab}
              handleSmartImportConfirm={handleSmartImportConfirm}
            />
          </div>
        </div>
      </div>
      <PurchaseDetailsModal
        invoiceId={viewInvoiceId}
        onClose={() => {
          setViewInvoiceId(null);
        }}
      />
      <CreatePaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
        }}
      />
      {isAuditOpen && (
        <AuditModal
          onClose={() => {
            setIsAuditOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default PurchasesPage;
