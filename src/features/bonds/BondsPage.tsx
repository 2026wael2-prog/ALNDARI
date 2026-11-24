/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/explicit-function-return-type, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-explicit-any */
import React, { Suspense, lazy, useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileText,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  LayoutGrid,
  Table as TableIcon,
  Maximize2,
  Minimize2,
  ArrowRightLeft,
  BookOpen,
} from 'lucide-react';
import { useBonds, useBondMutation, useBondsAnalytics } from './hooks';
import type { Bond, BondType } from './types';
import { useJournalMutation } from '../accounting/hooks/index';
import type { JournalEntryFormData } from '../accounting/types/models';
import MicroHeader from '../../ui/base/MicroHeader';
import Button from '../../ui/base/Button';
import PageLoader from '../../ui/base/PageLoader';
import BondsList from './components/BondsList';
import { BondsQuickKpiBar } from './components/BondsQuickKpiBar';
import { BondsToolbar } from './components/BondsToolbar';
import { useBondsFilter } from './hooks/useBondsFilter';
import { useBondsTotals } from './hooks/useBondsTotals';
import { useTranslation } from '../../lib/hooks/useTranslation';
import { useAIPrefillStore } from '../ai/store';
import { cn } from '../../core/utils';

const CreateBondModal = lazy(() => import('./components/CreateBondModal'));
const BondsAnalyticsView = lazy(() => import('./components/BondsAnalyticsView'));
const BondVoucherModal = lazy(() => import('./components/BondVoucherModal'));
const JournalTable = lazy(() => import('../accounting/components/journals/JournalTable'));
const AddJournalEntryModal = lazy(
  () => import('../accounting/components/journals/AddJournalEntryModal')
);

type ViewType = 'list' | 'analytics';
type BondsPageTab = BondType | 'journal';

const isBondsPageTab = (value: string): value is BondsPageTab =>
  ['receipt', 'payment', 'transfer', 'journal'].includes(value);

const BondsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTabState] = useState<BondsPageTab>(() => {
    const tabParam = searchParams.get('tab');
    return tabParam && isBondsPageTab(tabParam) ? tabParam : 'receipt';
  });
  const [modalType, setModalType] = useState<BondType>('receipt');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);

  const isJournalTab = activeTab === 'journal';

  const setActiveTab = useCallback(
    (nextTab: BondsPageTab) => {
      setActiveTabState(nextTab);
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (nextTab === 'receipt') {
            next.delete('tab');
          } else {
            next.set('tab', nextTab);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const resolvedTab = tabParam && isBondsPageTab(tabParam) ? tabParam : undefined;
    if (resolvedTab) {
      setActiveTabState(resolvedTab);
    }
    if (searchParams.get('action') === 'new') {
      const targetTab = resolvedTab ?? activeTab;
      if (targetTab === 'journal') {
        setIsJournalModalOpen(true);
      } else {
        setModalType(targetTab);
        setIsModalOpen(true);
      }
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, activeTab, setSearchParams]);
  const [viewType, setViewType] = useState<ViewType>('list');
  const [displayMode, setDisplayMode] = useState<'table' | 'cards'>('table');
  const [previewBond, setPreviewBond] = useState<Bond | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { t } = useTranslation();

  const {
    data: bonds,
    totalCount: totalBondsCount,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useBonds(isJournalTab ? 'receipt' : activeTab);
  const { mutate: createBond, isPending: isCreating } = useBondMutation();
  const { createJournal, isCreating: isCreatingJournal } = useJournalMutation();
  const { data: serverAnalytics } = useBondsAnalytics();

  const handleCreateJournal = (data: JournalEntryFormData) => {
    if (isCreatingJournal) return;
    createJournal(data, {
      onSuccess: () => {
        setIsJournalModalOpen(false);
      },
    });
  };

  // Search, Filter and Sort state & computations
  const {
    searchTerm,
    setSearchTerm,
    datePreset,
    setDatePreset,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    currencyFilter,
    setCurrencyFilter,
    paymentMethodFilter,
    setPaymentMethodFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    displayedBonds,
    hasActiveFilters,
    handleResetFilters,
  } = useBondsFilter(bonds);

  // Totals & KPI metrics (serverAnalytics via get_bonds_stats RPC is authoritative; bonds is fallback; displayedBonds when filtered)
  const { totals, analytics } = useBondsTotals(
    serverAnalytics,
    hasActiveFilters ? displayedBonds : bonds,
    hasActiveFilters
  );

  // AI Prefill: consume pending bond intent
  const consumePrefill = useAIPrefillStore((s: any) => s.consumePrefill);
  useEffect(() => {
    const aiData = consumePrefill(['create_bond_receipt', 'create_bond_payment']);
    if (aiData) {
      if (aiData.intent === 'create_bond_receipt') {
        setActiveTab('receipt');
        setModalType('receipt');
      } else {
        setActiveTab('payment');
        setModalType('payment');
      }
      setIsModalOpen(true);
    }
  }, [consumePrefill]);

  // Handle browser fullscreen sync
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen(!isFullscreen);
    }
  };

  // Analytics View
  if (viewType === 'analytics') {
    return (
      <Suspense fallback={null}>
        <BondsAnalyticsView
          onSwitchToList={() => {
            setViewType('list');
          }}
        />
      </Suspense>
    );
  }

  const openCreateModal = (type: BondType) => {
    setModalType(type);
    setIsModalOpen(true);
  };

  const headerActions = (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {/* Payment Method Quick Filter (bonds tabs only) */}
      {!isJournalTab && (
        <div className="hidden items-center gap-0.5 rounded-lg border border-gray-200 bg-[var(--app-surface)] p-0.5 dark:border-slate-800 lg:flex">
          <button
            type="button"
            onClick={() => setPaymentMethodFilter('all')}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] font-bold transition-all',
              paymentMethodFilter === 'all'
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30'
                : 'text-gray-400 hover:text-gray-600'
            )}
          >
            الكل
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethodFilter('cash')}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] font-bold transition-all',
              paymentMethodFilter === 'cash'
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30'
                : 'text-gray-400 hover:text-gray-600'
            )}
          >
            نقداً
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethodFilter('bank')}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] font-bold transition-all',
              paymentMethodFilter === 'bank'
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30'
                : 'text-gray-400 hover:text-gray-600'
            )}
          >
            بنك
          </button>
        </div>
      )}

      {/* View Display Mode Toggle (bonds tabs only) */}
      {!isJournalTab && (
        <div className="flex items-center rounded-lg border border-gray-200 bg-[var(--app-surface)] p-0.5 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setDisplayMode('table')}
            className={`rounded-md p-1.5 transition-all ${
              displayMode === 'table'
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30'
                : 'text-gray-400 hover:text-gray-600'
            }`}
            title="عرض الجدول المحاسبي العريض"
          >
            <TableIcon size={16} />
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode('cards')}
            className={`rounded-md p-1.5 transition-all ${
              displayMode === 'cards'
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30'
                : 'text-gray-400 hover:text-gray-600'
            }`}
            title="عرض البطاقات"
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      )}

      {/* Fullscreen Toggle */}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="rounded-lg border border-gray-200 bg-[var(--app-surface)] p-1.5 text-gray-500 shadow-sm transition-all hover:border-blue-300 hover:text-blue-600 dark:border-slate-800 dark:text-slate-400"
        title={isFullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة وضع الكمبيوتر'}
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>

      <Button
        onClick={() => navigate('/pos')}
        variant="outline"
        size="sm"
        className="hidden sm:inline-flex"
        leftIcon={<LayoutGrid size={14} />}
      >
        نقطة البيع
      </Button>

      {!isJournalTab && (
        <Button onClick={() => setViewType('analytics')} variant="outline" size="sm">
          تحليلات
        </Button>
      )}

      {/* Internal Transfer Button */}
      {!isJournalTab && (
        <Button
          onClick={() => openCreateModal('transfer')}
          variant="outline"
          size="sm"
          className="hidden md:inline-flex"
          leftIcon={<ArrowRightLeft size={14} />}
        >
          تحويل داخلي
        </Button>
      )}

      {/* Primary Action Button */}
      {isJournalTab ? (
        <Button
          onClick={() => setIsJournalModalOpen(true)}
          variant="primary"
          size="sm"
          leftIcon={<Plus size={14} />}
        >
          {t('new_journal_entry')}
        </Button>
      ) : (
        <Button
          onClick={() => openCreateModal(activeTab)}
          variant={
            activeTab === 'receipt' ? 'success' : activeTab === 'transfer' ? 'primary' : 'danger'
          }
          size="sm"
          leftIcon={<Plus size={14} />}
        >
          {activeTab === 'receipt' ? 'سند قبض' : activeTab === 'transfer' ? 'تحويل مالي' : 'سند صرف'}
        </Button>
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'font-cairo flex h-full flex-col bg-[#f8fafc] transition-all dark:bg-slate-950',
        isFullscreen && 'fixed inset-0 z-50 overflow-hidden'
      )}
    >
      <MicroHeader
        title={t('bonds_management')}
        icon={isJournalTab ? BookOpen : FileText}
        iconColor={
          activeTab === 'receipt'
            ? 'text-emerald-600'
            : activeTab === 'transfer'
              ? 'text-blue-600'
              : activeTab === 'journal'
                ? 'text-indigo-600'
                : 'text-rose-600'
        }
        actions={headerActions}
        tabs={[
          { id: 'receipt', label: t('receipt_bonds'), icon: ArrowDownCircle },
          { id: 'payment', label: t('payment_bonds'), icon: ArrowUpCircle },
          { id: 'transfer', label: 'سندات التحويل', icon: ArrowRightLeft },
          { id: 'journal', label: t('journal'), icon: BookOpen },
        ]}
        activeTab={activeTab}
        onTabChange={id => setActiveTab(id as BondsPageTab)}
        {...(!isJournalTab
          ? {
              searchPlaceholder: t('search_in_bonds'),
              searchValue: searchTerm,
              onSearchChange: setSearchTerm,
            }
          : {})}
      />

      {isJournalTab ? (
        <div className="relative z-20 flex flex-1 flex-col overflow-hidden">
          <div className="custom-scrollbar flex-1 overflow-y-auto px-2 pb-24 pt-3 md:px-5 md:pt-4">
            <Suspense fallback={<PageLoader />}>
              <JournalTable />
            </Suspense>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Quick KPI Summary Bar with Active Filtering */}
          <BondsQuickKpiBar
            totals={totals}
            analytics={analytics}
            isFiltered={hasActiveFilters}
            onResetFilters={handleResetFilters}
          />

          <div className="relative z-20 flex flex-1 flex-col overflow-hidden">
            <div className="custom-scrollbar flex-1 overflow-y-auto px-2 pb-24 pt-3 md:px-5 md:pt-4">
              {/* Enhanced Filtering & Sorting Toolbar */}
              <BondsToolbar
                datePreset={datePreset}
                setDatePreset={setDatePreset}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
                currencyFilter={currencyFilter}
                setCurrencyFilter={setCurrencyFilter}
                sortBy={sortBy}
                setSortBy={setSortBy}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
                displayedCount={displayedBonds.length}
                totalServerCount={totalBondsCount}
                hasActiveFilters={hasActiveFilters}
                onResetFilters={handleResetFilters}
              />

              <BondsList
                bonds={displayedBonds}
                isLoading={isLoading}
                searchTerm={searchTerm}
                displayMode={displayMode}
                onPreviewBond={bond => setPreviewBond(bond)}
              />

              {hasNextPage && (
                <div className="mt-4 flex flex-col items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-center">
                  <p className="text-xs font-bold text-[var(--app-text-secondary)]">
                    تم تحميل {bonds.length} من أصل {totalBondsCount} سند (الإجماليات أعلاه محسوبة من كامل السجل في قاعدة البيانات)
                  </p>
                  <button
                    type="button"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="rounded-lg bg-blue-600 px-5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isFetchingNextPage ? 'جاري تحميل المزيد...' : 'تحميل المزيد من السندات'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <Suspense fallback={null}>
        {/* Fullscreen Create / Edit Bond Modal */}
        {isModalOpen && (
          <CreateBondModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            type={modalType}
            onSubmit={data => {
              createBond(data, {
                onSuccess: () => setIsModalOpen(false),
              });
            }}
            isSubmitting={isCreating}
          />
        )}

        {/* Create Manual Journal Entry Modal */}
        {isJournalModalOpen && (
          <AddJournalEntryModal
            isOpen={isJournalModalOpen}
            onClose={() => setIsJournalModalOpen(false)}
            onSubmit={handleCreateJournal}
            isSubmitting={isCreatingJournal}
          />
        )}

        {/* Official Voucher Preview & Print Modal */}
        {previewBond && (
          <BondVoucherModal
            isOpen={!!previewBond}
            onClose={() => setPreviewBond(null)}
            bond={previewBond}
          />
        )}
      </Suspense>
    </div>
  );
};

export default BondsPage;
