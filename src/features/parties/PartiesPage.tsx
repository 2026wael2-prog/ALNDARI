/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-misused-promises */
import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, FileText, LayoutGrid, BarChart3 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useParties, usePartyMutations, usePartiesView } from './hooks';
import type { Party, PartyCurrencyFilter, PartyView, PartyType, PartyFormData } from './types';
import { useAIPrefillStore } from '../ai/store';
import MicroHeader from '../../ui/base/MicroHeader';
import PartyTypeSwitcher from './components/PartyTypeSwitcher';
import PartiesListView from './components/PartiesListView';
import { usePartiesColumns } from './hooks/usePartiesColumns';
import Button from '../../ui/base/Button';
import { cn } from '../../core/utils';
import { ROUTES } from '../../core/routes/paths';
import { useTranslation } from '../../lib/hooks/useTranslation';
import FullscreenContainer from '../../ui/base/FullscreenContainer';

const PartyModal = lazy(() => import('./components/PartyModal'));
const StatementView = lazy(() => import('./components/StatementView'));
const CategoriesView = lazy(() => import('./components/CategoriesView'));
const PartyAnalyticsView = lazy(() => import('./components/PartyAnalyticsView'));
const CustomerTimelineModal = lazy(() => import('./components/customers/CustomerTimelineModal'));
const SupplierPortalShareModal = lazy(() => import('./components/SupplierPortalShareModal'));

interface PartiesPageProps {
  partyType: PartyType;
  title?: string;
  icon?: LucideIcon;
  iconColor?: string;
}

const isPartyView = (value: string): value is PartyView =>
  ['list', 'statements', 'analytics', 'categories'].includes(value);

const PartiesPage: React.FC<PartiesPageProps> = ({ partyType, title, icon, iconColor }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const {
    activeView,
    setActiveView,
    searchTerm,
    setSearchTerm,
    isModalOpen,
    editingParty,
    handleEdit,
    handleAddNew,
    handleCloseModal,
  } = usePartiesView();

  const handleTabChange = useCallback(
    (nextTab: PartyView) => {
      setActiveView(nextTab);
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (nextTab === 'list') {
            next.delete('tab');
            next.delete('party');
            next.delete('currency');
            next.delete('from');
            next.delete('to');
          } else {
            next.set('tab', nextTab);
            if (nextTab !== 'statements') {
              next.delete('party');
              next.delete('currency');
              next.delete('from');
              next.delete('to');
            }
          }
          return next;
        },
        { replace: true }
      );
    },
    [setActiveView, setSearchParams]
  );

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && isPartyView(tabParam)) {
      setActiveView(tabParam);
    }
    if (searchParams.get('action') === 'new') {
      handleAddNew();
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setActiveView, handleAddNew, setSearchParams]);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [currencyFilter, setCurrencyFilter] = useState<PartyCurrencyFilter>('ALL');
  const [selectedPartyForStatementId, setSelectedPartyForStatementId] = useState<string>(
    () => searchParams.get('party') || ''
  );
  const [selectedStatementCurrency, setSelectedStatementCurrency] = useState<string>(
    () => searchParams.get('currency') || 'ALL'
  );

  const openPartyStatement = useCallback(
    (party: Party, currencyCode?: string) => {
      const nextCurr = currencyCode || 'ALL';
      setSelectedPartyForStatementId(party.id);
      setSelectedStatementCurrency(nextCurr);
      setActiveView('statements');
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.set('tab', 'statements');
          next.set('party', party.id);
          if (nextCurr && nextCurr !== 'ALL') {
            next.set('currency', nextCurr);
          } else {
            next.delete('currency');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setActiveView, setSearchParams]
  );

  const { data: parties, isLoading, stats } = useParties(partyType, searchTerm);
  const { saveParty, deleteParty, isSaving } = usePartyMutations(partyType);

  // Modal states
  const [selectedCustomer, setSelectedCustomer] = useState<Party | null>(null);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [selectedSupplierForPortal, setSelectedSupplierForPortal] = useState<Party | null>(null);
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);

  // AI Prefill Logic
  const consumePrefill = useAIPrefillStore(s => s.consumePrefill);
  const [prefillData, setPrefillData] = useState<Partial<PartyFormData> | null>(null);

  React.useEffect(() => {
    const intent = partyType === 'customer' ? 'create_customer' : 'create_supplier';
    const aiData = consumePrefill(intent);
    if (aiData?.entities) {
      setPrefillData({
        name: aiData.entities.partyName || '',
      });
      handleAddNew();
    }
  }, [partyType, consumePrefill, handleAddNew]);

  const defaultTitle =
    partyType === 'customer'
      ? t('customer_management')
      : partyType === 'employee'
        ? 'إدارة الموظفين'
        : t('supplier_management');
  const displayTitle = title || defaultTitle;
  const displayIcon = icon || Users;
  const displayIconColor =
    iconColor ||
    (partyType === 'customer'
      ? 'text-emerald-600'
      : partyType === 'employee'
        ? 'text-purple-600'
        : 'text-blue-600');

  const columns = usePartiesColumns({
    partyType,
    currencyFilter,
    onEdit: handleEdit,
    onDelete: deleteParty,
    onOpenTimeline: party => {
      setSelectedCustomer(party);
      setIsTimelineOpen(true);
    },
    onOpenPortal: party => {
      setSelectedSupplierForPortal(party);
      setIsPortalModalOpen(true);
    },
    onViewStatement: (party, currencyCode) => {
      openPartyStatement(party, currencyCode);
    },
  });

  const headerActions = (
    <div className="flex items-center gap-1.5 md:gap-2">
      <Button
        onClick={() => navigate(ROUTES.DASHBOARD.POS)}
        variant="outline"
        size="sm"
        className="hidden sm:inline-flex"
        leftIcon={<LayoutGrid size={14} />}
      >
        نقطة البيع
      </Button>
      <Button
        onClick={handleAddNew}
        variant={partyType === 'customer' ? 'success' : 'primary'}
        size="sm"
        leftIcon={<UserPlus size={14} />}
      >
        {partyType === 'customer'
          ? t('new_customer')
          : partyType === 'employee'
            ? 'موظف جديد'
            : t('new_supplier')}
      </Button>
    </div>
  );

  const renderContent = () => {
    switch (activeView) {
      case 'list':
        return (
          <PartiesListView
            partyType={partyType}
            parties={parties}
            isLoading={isLoading}
            stats={stats}
            columns={columns}
            onEdit={handleEdit}
            currencyFilter={currencyFilter}
            onCurrencyFilterChange={setCurrencyFilter}
          />
        );
      case 'statements':
        return (
          <Suspense fallback={null}>
            <StatementView
              partyType={partyType}
              initialPartyId={selectedPartyForStatementId}
              initialCurrency={selectedStatementCurrency}
            />
          </Suspense>
        );
      case 'analytics':
        return (
          <Suspense fallback={null}>
            <PartyAnalyticsView
              partyType={partyType}
              parties={parties}
              isLoading={isLoading}
              onViewStatement={party => {
                openPartyStatement(party);
              }}
            />
          </Suspense>
        );
      case 'categories':
        return (
          <Suspense fallback={null}>
            <CategoriesView partyType={partyType} />
          </Suspense>
        );
    }
  };

  return (
    <FullscreenContainer
      isMaximized={isMaximized}
      onToggleMaximize={() => {
        setIsMaximized(false);
        setIsZenMode(false);
      }}
      isZenMode={isZenMode}
    >
      <div className="font-cairo flex h-full flex-col bg-[#f8fafc] dark:bg-slate-950">
        <MicroHeader
          title={displayTitle}
          icon={displayIcon}
          iconColor={displayIconColor}
          actions={headerActions}
          searchPlaceholder={t('search_by_name_phone_category')}
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          tabs={[
            { id: 'list', label: t('records'), icon: Users },
            { id: 'statements', label: t('account_statements'), icon: FileText },
            { id: 'analytics', label: 'التحليلات والائتمان', icon: BarChart3 },
            { id: 'categories', label: t('categories'), icon: LayoutGrid },
          ]}
          activeTab={activeView}
          onTabChange={id => {
            if (isPartyView(id)) {
              handleTabChange(id);
            }
          }}
          isMaximized={isMaximized}
          onToggleMaximize={() => {
            setIsMaximized(!isMaximized);
            if (isMaximized) setIsZenMode(false);
          }}
          isZenMode={isZenMode}
          onToggleZen={() => {
            setIsZenMode(!isZenMode);
          }}
        />

        {/* Type switcher — the URL is the single source of truth */}
        <PartyTypeSwitcher
          partyType={partyType}
          onSwitch={type => {
            void navigate(
              type === 'customer'
                ? ROUTES.DASHBOARD.CLIENTS
                : type === 'employee'
                  ? ROUTES.DASHBOARD.EMPLOYEES
                  : ROUTES.DASHBOARD.SUPPLIERS
            );
          }}
          customerCount={
            partyType === 'customer' ? (stats?.totalCount ?? parties?.length) : undefined
          }
          supplierCount={
            partyType === 'supplier' ? (stats?.totalCount ?? parties?.length) : undefined
          }
          employeeCount={
            partyType === 'employee' ? (stats?.totalCount ?? parties?.length) : undefined
          }
        />

        <div
          className={cn(
            'relative z-20 flex flex-1 flex-col overflow-hidden',
            isZenMode ? 'bg-[var(--app-surface)]' : ''
          )}
        >
          <div
            className={cn(
              'custom-scrollbar flex-1 overflow-y-auto',
              activeView === 'statements'
                ? 'px-1.5 pb-6 pt-1.5 md:px-2.5 md:pb-8 md:pt-2'
                : 'px-2 pb-20 pt-2 md:px-4 md:pb-24 md:pt-5'
            )}
          >
            {renderContent()}
          </div>
        </div>

        <Suspense fallback={null}>
          {isModalOpen && (
            <PartyModal
              isOpen={isModalOpen}
              onClose={handleCloseModal}
              onSubmit={data => {
                const payload: { data: PartyFormData; id?: string } = { data };
                if (editingParty?.id) {
                  payload.id = editingParty.id;
                }
                saveParty(payload, {
                  onSuccess: () => {
                    handleCloseModal();
                    setPrefillData(null);
                  },
                });
              }}
              isSubmitting={isSaving}
              initialData={editingParty}
              prefillData={prefillData}
              partyType={partyType}
            />
          )}

          {/* Customer Timeline Modal */}
          {isTimelineOpen && (
            <CustomerTimelineModal
              isOpen={isTimelineOpen}
              onClose={() => {
                setIsTimelineOpen(false);
                setSelectedCustomer(null);
              }}
              customer={selectedCustomer}
            />
          )}

          {/* Supplier Portal Share Modal */}
          {isPortalModalOpen && (
            <SupplierPortalShareModal
              isOpen={isPortalModalOpen}
              onClose={() => {
                setIsPortalModalOpen(false);
                setSelectedSupplierForPortal(null);
              }}
              party={selectedSupplierForPortal}
              onTokenUpdated={updated => {
                setSelectedSupplierForPortal(updated);
              }}
            />
          )}
        </Suspense>
      </div>
    </FullscreenContainer>
  );
};

export default PartiesPage;
