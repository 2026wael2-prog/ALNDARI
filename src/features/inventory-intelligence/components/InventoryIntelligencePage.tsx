import React, { useEffect, useState, useTransition } from 'react';
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
import { useAuthStore } from '../../auth/store';
import { runAiOrchestration } from '../domain/orchestration/aiOrchestrationEngine';
import { IntelligenceExportBar } from './shared/IntelligenceExportBar';
import {
  useIntelligenceConfig,
  useIntelligenceMutations,
  useIntelligenceRuns,
  useInventoryIntelligence,
  useInventoryIntelligenceSummary,
  useInventoryIntelligenceProductsPage,
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
  const [visualTab, setVisualTab] = useState<IntelligenceTabId>('overview');
  const [isTabPending, startTabTransition] = useTransition();
  const [fullAnalysisEnabled, setFullAnalysisEnabled] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const [pageSearch, setPageSearch] = useState('');
  const [debouncedPageSearch, setDebouncedPageSearch] = useState('');
  const pageSize = 25;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPageSearch(pageSearch.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [pageSearch]);

  const {
    data: summaryData,
    isLoading: isLoadingSummary,
    isError: isErrorSummary,
    refetch: refetchSummary,
    isFetching: isFetchingSummary,
  } = useInventoryIntelligenceSummary(365, null);

  const {
    data: pageData,
    isLoading: isLoadingPage,
  } = useInventoryIntelligenceProductsPage({
    lookbackDays: 365,
    search: debouncedPageSearch || null,
    limit: pageSize,
    offset: pageIdx * pageSize,
    enabled: activeTab === 'overview' && !fullAnalysisEnabled,
  });

  const { data, isLoading, isError, refetch, isFetching } = useInventoryIntelligence(fullAnalysisEnabled);
  const { data: config } = useIntelligenceConfig();
  const { data: history = EMPTY_HISTORY, isLoading: isLoadingHistory } = useRecommendationHistory(
    fullAnalysisEnabled || activeTab === 'decisions'
  );
  const { data: runs = EMPTY_RUNS } = useIntelligenceRuns(activeTab === 'ml_performance');
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
    const next = id as IntelligenceTabId;
    setVisualTab(next);
    startTabTransition(() => {
      setActiveTab(next);
      if (next !== 'overview' && next !== 'settings') {
        setFullAnalysisEnabled(true);
      }
    });
  }, []);

  const companyId = useAuthStore(s => s.user?.company_id) ?? '';
  const orchestration = React.useMemo(
    () => (data && companyId ? runAiOrchestration(data, history, companyId) : null),
    [data, history, companyId]
  );

  const blockedDecisionByRecKey = React.useMemo(() => {
    const map = new Map<string, string[]>();
    if (!orchestration) return map;
    for (const d of orchestration.decisions) {
      if (d.conflictBlocked && d.productId) {
        map.set(`${d.recType}::${d.productId}`, d.conflictsDetected ?? []);
      }
    }
    return map;
  }, [orchestration]);

  const governedTransfers = React.useMemo(() => {
    if (!data) return [];
    return data.transferRecommendations.filter(
      tr => !blockedDecisionByRecKey.has(`transfer::${tr.productId}`)
    );
  }, [data, blockedDecisionByRecKey]);

  const governedPurchases = React.useMemo(() => {
    if (!data) return [];
    return data.purchaseRecommendations.filter(
      po => !blockedDecisionByRecKey.has(`purchase::${po.productId}`)
    );
  }, [data, blockedDecisionByRecKey]);

  const handleDecide = React.useCallback(
    async (params: any) => {
      const blockedReasons = blockedDecisionByRecKey.get(`${params.recType}::${params.productId}`);
      await decideRecommendation({
        ...params,
        conflictBlocked: Boolean(blockedReasons),
        conflictReasons: blockedReasons,
      });
    },
    [decideRecommendation, blockedDecisionByRecKey]
  );

  return (
    <div className="font-cairo flex h-full flex-col bg-[var(--app-bg)]">
      <MicroHeader
        title="مركز ذكاء المخزون والتنبؤ بالطلب"
        icon={Cpu}
        iconColor="text-blue-500"
        tabs={headerTabs}
        activeTab={visualTab}
        onTabChange={handleTabChange}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setFullAnalysisEnabled(true);
                void refetch();
              }}
              isLoading={isFetching}
              leftIcon={<Cpu size={14} />}
            >
              تشغيل التحليل الكامل
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void refetchSummary();
                if (fullAnalysisEnabled) void refetch();
              }}
              isLoading={isFetchingSummary || isFetching}
              leftIcon={<RefreshCw size={14} />}
            >
              تحديث الملخص
            </Button>
          </div>
        }
      />

      <div
        className={`custom-scrollbar flex-1 overflow-y-auto px-2 pt-3 pb-24 transition-opacity duration-150 md:px-4 ${
          isTabPending ? 'opacity-70' : 'opacity-100'
        }`}
      >
        <ContentContainer>
          {activeTab === 'settings' ? (
            <EngineSettingsTab
              config={config}
              branches={data?.branches ?? summaryData?.branches ?? []}
              onSave={saveConfig}
              isSaving={isSavingConfig}
            />
          ) : activeTab === 'overview' && !fullAnalysisEnabled ? (
            isLoadingSummary ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                <p className="text-sm font-bold text-[var(--app-text-secondary)]">
                  جاري تحميل ملخص ذكاء المخزون...
                </p>
              </div>
            ) : isErrorSummary || !summaryData ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-xl border border-rose-500/20 bg-[var(--app-surface)] p-8 text-center">
                <p className="text-sm font-bold text-rose-600">
                  تعذر تحميل ملخص ذكاء المخزون. يرجى المحاولة مرة أخرى.
                </p>
                <Button variant="primary" onClick={() => { void refetchSummary(); }}>
                  إعادة المحاولة
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
                    <div className="text-xs text-[var(--app-text-secondary)]">إجمالي الأصناف النشطة</div>
                    <div className="mt-1 text-xl font-black">{Number(summaryData.totals?.total_products ?? 0).toLocaleString()}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
                    <div className="text-xs text-[var(--app-text-secondary)]">إجمالي الوحدات المتاحة</div>
                    <div className="mt-1 text-xl font-black">{Number(summaryData.totals?.total_avail_qty ?? 0).toLocaleString()}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
                    <div className="text-xs text-[var(--app-text-secondary)]">قيمة المخزون بالتكلفة</div>
                    <div className="mt-1 text-xl font-black">{Number(summaryData.totals?.total_stock_cost ?? 0).toLocaleString()} ر.س</div>
                  </div>
                  <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
                    <div className="text-xs text-[var(--app-text-secondary)]">نقص / نفاد المخزون</div>
                    <div className="mt-1 text-xl font-black text-amber-600">
                      {Number(summaryData.totals?.low_stock_count ?? 0)} / {Number(summaryData.totals?.out_of_stock_count ?? 0)}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">
                      تفاصيل الأصناف (ترقيم خادمي — إجمالي {Number(pageData?.total_count ?? 0).toLocaleString()} صنفاً)
                    </h3>
                    <input
                      type="text"
                      value={pageSearch}
                      onChange={e => {
                        setPageSearch(e.target.value);
                        setPageIdx(0);
                      }}
                      placeholder="بحث بالاسم أو SKU أو رقم القطعة..."
                      className="w-64 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-1.5 text-xs"
                    />
                  </div>
                  {isLoadingPage ? (
                    <div className="py-8 text-center text-xs text-[var(--app-text-secondary)]">جاري تحميل الصفحة...</div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                          <thead>
                            <tr className="border-b border-[var(--app-border)] text-[var(--app-text-secondary)]">
                              <th className="p-2">SKU</th>
                              <th className="p-2">الصنف</th>
                              <th className="p-2">العلامة</th>
                              <th className="p-2">التكلفة</th>
                              <th className="p-2">البيع</th>
                              <th className="p-2">مبيعات 30 يوم</th>
                              <th className="p-2">مبيعات 90 يوم</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(pageData?.items ?? []).map((item: any) => (
                              <tr key={item.id} className="border-b border-[var(--app-border)]/50">
                                <td className="p-2 font-mono">{item.sku}</td>
                                <td className="p-2 font-medium">{item.name_ar}</td>
                                <td className="p-2">{item.brand || '—'}</td>
                                <td className="p-2">{Number(item.cost_price ?? 0).toFixed(2)}</td>
                                <td className="p-2">{Number(item.sale_price ?? 0).toFixed(2)}</td>
                                <td className="p-2">{Number(item.net_qty_30 ?? 0)}</td>
                                <td className="p-2">{Number(item.net_qty_90 ?? 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span>
                          صفحة {pageIdx + 1} من {Math.max(1, Math.ceil((pageData?.total_count ?? 0) / pageSize))}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pageIdx === 0}
                            onClick={() => setPageIdx(p => Math.max(0, p - 1))}
                          >
                            السابق
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={(pageIdx + 1) * pageSize >= (pageData?.total_count ?? 0)}
                            onClick={() => setPageIdx(p => p + 1)}
                          >
                            التالي
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
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
                  orchestration={orchestration}
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
                  recommendations={governedTransfers}
                  history={history}
                  onDecide={handleDecide}
                  isDeciding={isDeciding}
                />
              )}
              {activeTab === 'purchase_recs' && (
                <PurchaseRecommendationsTab
                  recommendations={governedPurchases}
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
                <SuppliersTab recommendations={governedPurchases} />
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
