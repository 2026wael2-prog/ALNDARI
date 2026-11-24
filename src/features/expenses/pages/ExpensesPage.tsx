import React, { Suspense, lazy, useState } from 'react';
import { Receipt, Plus, BarChart3, FileText } from 'lucide-react';

import { useExpensesData, useExpenseActions, useExpenseCategories } from '../hooks';
import MicroHeader from '../../../ui/base/MicroHeader';
import Button from '../../../ui/base/Button';
import ExpensesListView from './ExpensesListView';
import { useAIPrefillStore } from '../../ai/store';
import { useTranslation } from '../../../lib/hooks/useTranslation';

const CreateExpenseModal = lazy(() => import('../components/CreateExpenseModal'));
const ExpensesAnalyticsView = lazy(() => import('./ExpensesAnalyticsView'));
const ExpenseLedgerView = lazy(() => import('../components/ExpenseLedgerView'));

type PeriodType = 'today' | 'week' | 'month' | 'quarter' | 'year';
type ViewType = 'list' | 'analytics' | 'ledger';

const ExpensesPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewType, setViewType] = useState<ViewType>('list');
  const [period, setPeriod] = useState<PeriodType>('month');
  const [selectedLedgerAccountId, setSelectedLedgerAccountId] = useState<string | null>(null);

  const { expenses, isLoading, stats } = useExpensesData(searchTerm);
  const { data: categories = [] } = useExpenseCategories();
  const { createExpense, isCreating, deleteExpense } = useExpenseActions();
  const { t } = useTranslation();

  // AI Prefill: consume pending expense intent
  const consumePrefill = useAIPrefillStore((s: any) => s.consumePrefill);
  React.useEffect(() => {
    const aiData = consumePrefill('create_expense');
    if (aiData) {
      setIsModalOpen(true);
    }
  }, [consumePrefill]);

  const periodLabels: Record<PeriodType, string> = {
    today: t('today'),
    week: t('week'),
    month: t('month'),
    quarter: t('quarter'),
    year: t('year'),
  };

  const handleOpenLedger = (categoryIdOrAccountId?: string) => {
    if (categoryIdOrAccountId) {
      // Check if it corresponds to an expense category with account_id
      const matchedCat = categories.find((c: any) => c.id === categoryIdOrAccountId);
      if (matchedCat && matchedCat.account_id) {
        setSelectedLedgerAccountId(matchedCat.account_id);
      } else {
        setSelectedLedgerAccountId(categoryIdOrAccountId);
      }
    }
    setViewType('ledger');
  };

  const headerActions = (
    <Button
      onClick={() => {
        setIsModalOpen(true);
      }}
      variant="danger"
      size="sm"
      leftIcon={<Plus size={14} />}
    >
      {t('add_expense')}
    </Button>
  );

  const EXPENSE_TABS = [
    { id: 'list', label: 'سجل المصروفات', icon: Receipt },
    { id: 'analytics', label: 'التحليلات', icon: BarChart3 },
    { id: 'ledger', label: 'كشف حساب تفصيلي', icon: FileText },
  ];

  return (
    <div className="font-cairo flex h-full flex-col bg-[#f8fafc] dark:bg-slate-950">
      <MicroHeader
        title={
          viewType === 'ledger'
            ? 'كشف حساب تفصيلي للمصروفات والعهد'
            : viewType === 'analytics'
              ? t('expenses_analytics_title')
              : t('expenses_management_title')
        }
        icon={viewType === 'ledger' ? FileText : viewType === 'analytics' ? BarChart3 : Receipt}
        iconColor={viewType === 'ledger' ? 'text-blue-600' : 'text-rose-600'}
        actions={headerActions}
        tabs={EXPENSE_TABS}
        activeTab={viewType}
        onTabChange={id => {
          if (id === 'ledger') {
            handleOpenLedger();
          } else {
            setViewType(id as ViewType);
          }
        }}
        {...(viewType === 'list'
          ? {
              searchPlaceholder: t('search_expenses_placeholder'),
              searchValue: searchTerm,
              onSearchChange: setSearchTerm,
            }
          : {})}
      />

      <div className="custom-scrollbar flex-1 overflow-y-auto px-2 pb-20 pt-2 md:px-4 md:pb-24 md:pt-4">
        {viewType === 'ledger' && (
          <Suspense fallback={null}>
            <ExpenseLedgerView
              initialAccountId={selectedLedgerAccountId}
              onBackToList={() => {
                setViewType('list');
              }}
            />
          </Suspense>
        )}

        {viewType === 'analytics' && (
          <div className="space-y-3 md:space-y-4">
            {/* Period Filter Bar for Analytics */}
            <div className="shadow-2xs flex flex-col items-start justify-between gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5 sm:flex-row sm:items-center">
              <span className="text-xs font-bold text-[var(--app-text-secondary)]">
                فترة التحليل المالي:
              </span>
              <div className="no-scrollbar flex w-full overflow-x-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-0.5 sm:w-auto">
                {(['today', 'week', 'month', 'quarter', 'year'] as PeriodType[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPeriod(p);
                    }}
                    className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-bold transition-all sm:px-3 ${
                      period === p
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                    }`}
                  >
                    {periodLabels[p]}
                  </button>
                ))}
              </div>
            </div>

            <Suspense fallback={null}>
              <ExpensesAnalyticsView expenses={expenses || []} period={period} />
            </Suspense>
          </div>
        )}

        {viewType === 'list' && (
          <ExpensesListView
            expenses={expenses || []}
            isLoading={isLoading}
            stats={stats}
            onDelete={deleteExpense}
            onOpenLedger={handleOpenLedger}
          />
        )}
      </div>

      <Suspense fallback={null}>
        {isModalOpen && (
          <CreateExpenseModal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
            }}
            onSubmit={data => {
              createExpense(data, {
                onSuccess: () => {
                  setIsModalOpen(false);
                },
              });
            }}
            isSubmitting={isCreating}
          />
        )}
      </Suspense>
    </div>
  );
};

export default ExpensesPage;
