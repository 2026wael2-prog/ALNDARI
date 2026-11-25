import React, { useEffect, useMemo, Suspense, lazy, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// Fix: Corrected import path to point to the barrel file.
import { useAccountingView } from './hooks/index';
import type { AccountingView } from './types/index';
import {
  Calculator,
  FileText,
  Calendar,
  BookOpen,
  Landmark,
  Layers,
  LayoutDashboard,
  RefreshCw,
  Wallet,
  Building2,
  Percent,
} from 'lucide-react';
import MicroHeader from '../../ui/base/MicroHeader';
import PageLoader from '../../ui/base/PageLoader';
import { useTranslation } from '../../lib/hooks/useTranslation';
import FullscreenContainer from '../../ui/base/FullscreenContainer';
import { useQueryClient } from '@tanstack/react-query';
import { cn, formatLocalDate, getLocalYearStart } from '../../core/utils';
import type { LucideIcon } from 'lucide-react';
import { DOMAIN_KEYS } from '../../lib/invalidation';
import { ROUTES } from '../../core/routes/paths';
import Button from '../../ui/base/Button';

// إبطال موجّه لمفاتيح صفحة المحاسبة ذاتها فقط — بدل الإبطال الشامل لكاش التطبيق كله.
// (نفس تغطية preset «journal» من lib/invalidation + مفاتيح الخزينة والتقارير المحاسبية.)
const REFRESH_KEYS: readonly string[] = [
  ...new Set<string>([
    ...DOMAIN_KEYS.accounting,
    ...DOMAIN_KEYS.dashboard,
    ...DOMAIN_KEYS.reports,
    'ledger',
    'trial_balance',
    'financials',
    'audit_journals',
    'cashboxes',
    'exchange_companies',
    'fixed_assets',
    'vat_return_report',
  ]),
];

// Lazy loading for components
const AccountingOverview = lazy(() => import('./components/layout/AccountingOverview'));
const AccountsTable = lazy(() => import('./components/accounts/AccountsTable'));
const TreasuryView = lazy(() => import('./components/treasury/TreasuryView'));
const LedgerView = lazy(() => import('./components/reports/LedgerView'));
const IncomeStatement = lazy(() => import('./components/reports/IncomeStatement'));
const BalanceSheet = lazy(() => import('./components/reports/BalanceSheet'));
const FixedAssetsView = lazy(() => import('./components/assets/FixedAssetsView'));
const VatReturnView = lazy(() => import('./components/reports/VatReturnView'));

const AccountingPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeView, setActiveView, dateRange, setDateRange } = useAccountingView();
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Redirect legacy /accounting?tab=journal links to BondsPage -> Journal tab
  useEffect(() => {
    if (activeView === 'journal') {
      navigate(`${ROUTES.DASHBOARD.BONDS}?tab=journal`, { replace: true });
    }
  }, [activeView, navigate]);

  const handleOpenNewJournalInBonds = () => {
    navigate(`${ROUTES.DASHBOARD.BONDS}?tab=journal&action=new`);
  };

  // ينتظر اكتمال عمليات الإبطال/إعادة الجلب فعلياً — لا تأخير اصطناعي بعد الآن
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all(
        REFRESH_KEYS.map(key => queryClient.invalidateQueries({ queryKey: [key] }))
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const TABS: Array<{ id: AccountingView; label: string; icon: LucideIcon }> = [
    { id: 'overview', label: t('accounting_overview'), icon: LayoutDashboard },
    { id: 'treasury', label: t('treasury'), icon: Wallet },
    { id: 'ledger', label: t('ledger'), icon: BookOpen },
    { id: 'income', label: t('income_statement'), icon: FileText },
    { id: 'balance_sheet', label: t('balance_sheet_report'), icon: Landmark },
    { id: 'accounts', label: t('chart_of_accounts'), icon: Layers },
    { id: 'assets', label: 'الأصول الثابتة', icon: Building2 },
    { id: 'vat_return', label: 'الإقرار الضريبي', icon: Percent },
  ];

  const headerActions = (
    <div className="flex gap-2 print:hidden">
      <Button
        onClick={() => navigate(`${ROUTES.DASHBOARD.BONDS}?tab=journal`)}
        variant="outline"
        size="sm"
        leftIcon={<BookOpen size={14} />}
        className="hidden sm:inline-flex"
      >
        {t('journal')}
      </Button>
    </div>
  );

  const dateFilterRow = useMemo(() => {
    const showDateFilter = [
      'overview',
      'ledger',
      'income',
      'balance_sheet',
      'treasury',
      'vat_return',
    ].includes(activeView);
    if (!showDateFilter) return undefined;

    const currentYear = new Date().getFullYear();
    const today = formatLocalDate();
    const yearStart = getLocalYearStart();
    const presets = [
      { key: 'current', label: `السنة الجارية (${currentYear})`, from: yearStart, to: today },
      {
        key: `y-${currentYear - 1}`,
        label: `${currentYear - 1}`,
        from: `${currentYear - 1}-01-01`,
        to: `${currentYear - 1}-12-31`,
      },
      {
        key: `y-${currentYear - 2}`,
        label: `${currentYear - 2}`,
        from: `${currentYear - 2}-01-01`,
        to: `${currentYear - 2}-12-31`,
      },
      { key: 'all', label: 'كل السنوات', from: '2000-01-01', to: today },
    ];

    return (
      <div className="animate-in slide-in-from-top-1 no-scrollbar mx-1 flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto rounded-[var(--radius)] border border-blue-100 bg-blue-50 px-2 py-1 duration-300 dark:border-blue-900/20 dark:bg-blue-900/10 md:mx-2 md:w-fit md:flex-wrap md:gap-2 md:px-2.5 md:py-1.5">
        <div className="hidden shrink-0 rounded-md bg-blue-600 p-1.5 text-white sm:block">
          <Calendar size={13} />
        </div>
        <div className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-blue-900 dark:text-blue-300">
          <div className="flex items-center gap-1 border-l border-blue-200 pl-1.5 dark:border-blue-800/50 md:pl-2">
            {presets.map(preset => {
              const isSelected = dateRange.from === preset.from && dateRange.to === preset.to;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setDateRange({ from: preset.from, to: preset.to })}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] font-bold transition-colors',
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-[var(--app-surface)] text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/30'
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1">
            <span>{t('from_date')}:</span>
            <input
              type="date"
              value={dateRange.from}
              onChange={e => {
                setDateRange(prev => ({ ...prev, from: e.target.value }));
              }}
              className="rounded border-none bg-[var(--app-surface)] p-0.5 font-mono text-[10px] text-blue-600 outline-none dark:text-blue-400 md:p-1"
            />
          </div>
          <div className="mx-0.5 h-3.5 w-px bg-blue-200 dark:bg-blue-800/50"></div>
          <div className="flex items-center gap-1">
            <span>{t('to_date')}:</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={e => {
                setDateRange(prev => ({ ...prev, to: e.target.value }));
              }}
              className="rounded border-none bg-[var(--app-surface)] p-0.5 font-mono text-[10px] text-blue-600 outline-none dark:text-blue-400 md:p-1"
            />
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          aria-label="تحديث البيانات"
          className="shrink-0 p-1 text-blue-400 transition-colors hover:text-blue-600 disabled:opacity-50"
        >
          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>
    );
  }, [activeView, dateRange, setDateRange, t, isRefreshing]);

  const renderContent = () => {
    switch (activeView) {
      case 'overview':
        return (
          <AccountingOverview
            onNewJournal={handleOpenNewJournalInBonds}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />
        );
      case 'accounts':
        return <AccountsTable />;
      case 'treasury':
        return <TreasuryView dateRange={dateRange} />;
      case 'ledger':
        return <LedgerView dateRange={dateRange} />;
      case 'income':
        return <IncomeStatement dateRange={dateRange} />;
      case 'balance_sheet':
        return <BalanceSheet dateRange={dateRange} />;
      case 'assets':
        return <FixedAssetsView />;
      case 'vat_return':
        return <VatReturnView dateRange={dateRange} />;
      default:
        return (
          <AccountingOverview
            onNewJournal={handleOpenNewJournalInBonds}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />
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
      <div className="font-cairo flex h-full flex-col bg-[var(--app-bg)]">
        <MicroHeader
          title={t('accounting_center_title')}
          icon={Calculator}
          actions={headerActions}
          tabs={TABS}
          activeTab={activeView}
          onTabChange={id => {
            setActiveView(id as AccountingView);
          }}
          extraRow={dateFilterRow}
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

        <div
          className={cn(
            'relative z-20 flex flex-1 flex-col overflow-hidden',
            isZenMode ? 'bg-[var(--app-surface)]' : ''
          )}
        >
          <Suspense fallback={<PageLoader />}>
            <div className="custom-scrollbar print-area animate-in slide-in-from-bottom-4 flex-1 overflow-y-auto p-2 pt-3 duration-500 max-md:p-1 max-md:pt-1.5 md:p-4 md:pt-6">
              {renderContent()}
            </div>
          </Suspense>
        </div>
      </div>
    </FullscreenContainer>
  );
};

export default AccountingPage;
