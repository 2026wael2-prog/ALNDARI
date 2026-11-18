import React, { useState } from 'react';
import {
  Activity,
  Archive,
  ArrowLeftRight,
  Award,
  BarChart3,
  Cpu,
  GitBranch,
  History,
  LayoutDashboard,
  RefreshCw,
  Settings,
  ShoppingCart,
  TrendingUp,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import MicroHeader from '../../../ui/base/MicroHeader';
import ContentContainer from '../../../ui/layout/ContentContainer';
import Button from '../../../ui/base/Button';
import type { IntelligenceRunSummary, PersistedRecommendationRecord } from '../types';
import { IntelligenceExportBar } from './shared/IntelligenceExportBar';
import {
  useIntelligenceConfig,
  useIntelligenceMutations,
  useIntelligenceRuns,
  useInventoryIntelligence,
  useRecommendationHistory,
} from '../hooks/useInventoryIntelligence';
import { OverviewTab } from './tabs/OverviewTab';
import { TopMovingTab } from './tabs/TopMovingTab';
import { BranchDemandTab } from './tabs/BranchDemandTab';
import { TransferRecommendationsTab } from './tabs/TransferRecommendationsTab';
import { PurchaseRecommendationsTab } from './tabs/PurchaseRecommendationsTab';
import { DemandForecastingTab } from './tabs/DemandForecastingTab';
import { SuppliersTab } from './tabs/SuppliersTab';
import { FastGrowingTab } from './tabs/FastGrowingTab';
import { DeadStockTab } from './tabs/DeadStockTab';
import { DecisionHistoryTab } from './tabs/DecisionHistoryTab';
import { ModelPerformanceTab } from './tabs/ModelPerformanceTab';
import { EngineSettingsTab } from './tabs/EngineSettingsTab';

type IntelligenceTabId =
  | 'overview'
  | 'top_moving'
  | 'branch_demand'
  | 'transfers'
  | 'purchase_recs'
  | 'forecasting'
  | 'suppliers'
  | 'fast_growing'
  | 'dead_stock'
  | 'decisions'
  | 'ml_performance'
  | 'settings';

const TABS: Array<{ id: IntelligenceTabId; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
  { id: 'top_moving', label: 'الأكثر حركة', icon: Activity },
  { id: 'branch_demand', label: 'تحليل الفروع الثلاثة', icon: GitBranch },
  { id: 'transfers', label: 'توصيات التحويل', icon: ArrowLeftRight },
  { id: 'purchase_recs', label: 'توصيات الشراء', icon: ShoppingCart },
  { id: 'forecasting', label: 'التنبؤ بالطلب', icon: BarChart3 },
  { id: 'suppliers', label: 'الموردون المرشحون', icon: Truck },
  { id: 'fast_growing', label: 'النمو المتسارع', icon: TrendingUp },
  { id: 'dead_stock', label: 'الراكد والفائض', icon: Archive },
  { id: 'decisions', label: 'سجل القرارات', icon: History },
  { id: 'ml_performance', label: 'أداء النماذج', icon: Award },
  { id: 'settings', label: 'إعدادات المحرك', icon: Settings },
];

const EMPTY_HISTORY: PersistedRecommendationRecord[] = [];
const EMPTY_RUNS: IntelligenceRunSummary[] = [];

const InventoryIntelligencePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<IntelligenceTabId>('overview');
  const { data, isLoading, isError, refetch, isFetching } = useInventoryIntelligence();
  const { data: config } = useIntelligenceConfig();
  const { data: history = EMPTY_HISTORY, isLoading: isLoadingHistory } = useRecommendationHistory();
  const { data: runs = EMPTY_RUNS } = useIntelligenceRuns();
  const {
    decideRecommendation,
    isDeciding,
    saveConfig,
    isSavingConfig,
    reviewAlternative,
    isReviewingAlternative,
  } = useIntelligenceMutations();

  const headerTabs = React.useMemo(
    () =>
      TABS.map(t => ({
        id: t.id,
        label: t.label,
        icon: t.icon,
      })),
    []
  );

  const handleTabChange = React.useCallback((id: string) => {
    setActiveTab(id as IntelligenceTabId);
  }, []);

  const handleDecide = React.useCallback(
    async (params: any) => {
      await decideRecommendation(params);
    },
    [decideRecommendation]
  );

  return (
    <div className="font-cairo flex h-full flex-col bg-[var(--app-bg)]">
      <MicroHeader
        title="مركز ذكاء المخزون والتنبؤ بالطلب"
        icon={Cpu}
        iconColor="text-blue-500"
        tabs={headerTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void refetch();
            }}
            isLoading={isFetching}
            leftIcon={<RefreshCw size={14} />}
          >
            تحديث التحليل
          </Button>
        }
      />

      <div className="custom-scrollbar flex-1 overflow-y-auto px-2 pt-3 pb-24 md:px-4">
        <ContentContainer>
          {activeTab === 'settings' ? (
            <EngineSettingsTab
              config={config}
              branches={data?.branches ?? []}
              onSave={saveConfig}
              isSaving={isSavingConfig}
            />
          ) : isLoading ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-10">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
              <p className="text-sm font-bold text-[var(--app-text-secondary)]">
                جاري تشغيل محرك التحليل والتنبؤ على بيانات الفروع الثلاثة...
              </p>
            </div>
          ) : isError || !data ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-xl border border-rose-500/20 bg-[var(--app-surface)] p-10 text-center">
              <p className="text-sm font-bold text-rose-600">
                تعذر تحميل بيانات التحليل من الخادم. يرجى المحاولة مرة أخرى.
              </p>
              <Button
                variant="primary"
                onClick={() => {
                  void refetch();
                }}
              >
                إعادة المحاولة
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2">
                <span className="text-xs font-bold text-[var(--app-text-secondary)]">
                  التقارير والدراسات والتواصل الإداري
                </span>
                <IntelligenceExportBar output={data} />
              </div>
              {activeTab === 'overview' && (
                <OverviewTab
                  data={data}
                  history={history}
                  onNavigateTab={handleTabChange}
                />
              )}
              {activeTab === 'top_moving' && (
                <TopMovingTab products={data.products} branches={data.branches} />
              )}
              {activeTab === 'branch_demand' && (
                <BranchDemandTab products={data.products} branches={data.branches} />
              )}
              {activeTab === 'transfers' && (
                <TransferRecommendationsTab
                  recommendations={data.transferRecommendations}
                  history={history}
                  onDecide={handleDecide}
                  isDeciding={isDeciding}
                />
              )}
              {activeTab === 'purchase_recs' && (
                <PurchaseRecommendationsTab
                  recommendations={data.purchaseRecommendations}
                  products={data.products}
                  branches={data.branches}
                  history={history}
                  onDecide={handleDecide}
                  isDeciding={isDeciding}
                />
              )}
              {activeTab === 'forecasting' && (
                <DemandForecastingTab
                  products={data.products}
                  horizons={config.forecast_horizons}
                />
              )}
              {activeTab === 'suppliers' && (
                <SuppliersTab recommendations={data.purchaseRecommendations} />
              )}
              {activeTab === 'fast_growing' && (
                <FastGrowingTab products={data.products} branches={data.branches} />
              )}
              {activeTab === 'dead_stock' && (
                <DeadStockTab
                  items={data.deadExcessRecommendations}
                  products={data.products}
                  branches={data.branches}
                  history={history}
                  onDecide={handleDecide}
                  isDeciding={isDeciding}
                />
              )}
              {activeTab === 'decisions' && (
                <DecisionHistoryTab
                  history={history}
                  isLoading={isLoadingHistory}
                  products={data.products}
                  crossReferences={data.crossReferences}
                  onReviewAlternative={reviewAlternative}
                  isReviewingAlternative={isReviewingAlternative}
                />
              )}
              {activeTab === 'ml_performance' && (
                <ModelPerformanceTab
                  evaluations={data.modelEvaluations}
                  championModel={data.championModel}
                  runs={runs}
                />
              )}
            </>
          )}
        </ContentContainer>
      </div>
    </div>
  );
};

export default InventoryIntelligencePage;
