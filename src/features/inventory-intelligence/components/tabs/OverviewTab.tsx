import React from 'react';
import {
  Package,
  ShoppingCart,
  AlertTriangle,
  ArrowLeftRight,
  TrendingUp,
  Archive,
  Cpu,
  Clock,
  DollarSign,
  Ban,
} from 'lucide-react';
import type {
  IntelligenceEngineOutput,
  OrchestrationResult,
  PersistedRecommendationRecord,
} from '../../types';
import { formatCurrency, formatNumberDisplay } from '../../../../core/utils';
import { useAuthStore } from '../../../auth/store';
import { CommandCenterPanel } from '../command-center/CommandCenterPanel';
import { GRID_TABLE_CLASS, QualityBadge } from '../shared/IntelligenceBadges';

interface Props {
  data: IntelligenceEngineOutput;
  history?: PersistedRecommendationRecord[];
  orchestration?: OrchestrationResult | null | undefined;
  onNavigateTab: (tabId: string) => void;
}

export const OverviewTab: React.FC<Props> = React.memo(({ data, history = [], orchestration, onNavigateTab }) => {
  const companyId = useAuthStore(s => s.user?.company_id) ?? 'default_company';
  const { overviewKpis, championModel, generatedAt } = data;

  const cards = [
    {
      title: 'الأصناف المحللة',
      value: formatNumberDisplay(overviewKpis.totalAnalyzedProducts),
      icon: Package,
      color: 'text-blue-600 bg-blue-500/10',
      tab: 'top_moving',
    },
    {
      title: 'أصناف تتطلب شراءً',
      value: formatNumberDisplay(overviewKpis.productsRequiringPurchase),
      icon: ShoppingCart,
      color: 'text-emerald-600 bg-emerald-500/10',
      tab: 'purchase_recs',
    },
    {
      title: 'أصناف تقترب من النفاد',
      value: formatNumberDisplay(overviewKpis.productsApproachingStockout),
      icon: AlertTriangle,
      color: 'text-amber-600 bg-amber-500/10',
      tab: 'purchase_recs',
    },
    {
      title: 'نفاد كامل بالـ 3 فروع',
      value: formatNumberDisplay(overviewKpis.zeroStockAcrossAllBranches),
      icon: Ban,
      color: 'text-rose-600 bg-rose-500/10',
      tab: 'purchase_recs',
    },
    {
      title: 'توصيات تحويل بين الفروع',
      value: formatNumberDisplay(overviewKpis.pendingTransferCount),
      icon: ArrowLeftRight,
      color: 'text-indigo-600 bg-indigo-500/10',
      tab: 'transfers',
    },
    {
      title: 'أصناف سريعة النمو',
      value: formatNumberDisplay(overviewKpis.fastGrowingCount),
      icon: TrendingUp,
      color: 'text-teal-600 bg-teal-500/10',
      tab: 'fast_growing',
    },
    {
      title: 'أصناف راكدة',
      value: formatNumberDisplay(overviewKpis.deadStockCount),
      icon: Archive,
      color: 'text-rose-600 bg-rose-500/10',
      tab: 'dead_stock',
    },
    {
      title: 'أصناف بمخزون فائض',
      value: formatNumberDisplay(overviewKpis.excessStockCount),
      icon: Package,
      color: 'text-violet-600 bg-violet-500/10',
      tab: 'dead_stock',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400">
            <Cpu size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--app-text)]">
              حالة محرك التنبؤ والذكاء الاصطناعي: نشط وجاهز
            </h3>
            <p className="text-xs text-[var(--app-text-secondary)]">
              النموذج البطل الحالي:{' '}
              <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                {championModel}
              </span>{' '}
              • الفروع المتصلة: {data.branches.length}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--app-text-secondary)]">
          <Clock size={14} />
          <span>آخر تحليل: {new Date(generatedAt).toLocaleString('ar-SA')}</span>
        </div>
      </div>

      {/* KPI Grid (8 balanced cards) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <button
              key={c.title}
              type="button"
              onClick={() => {
                onNavigateTab(c.tab);
              }}
              className="flex items-center justify-between rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 text-start transition-all hover:-translate-y-0.5 hover:border-blue-500/40 hover:shadow-sm"
            >
              <div>
                <p className="text-[11px] font-bold text-[var(--app-text-secondary)]">{c.title}</p>
                <p dir="ltr" className="mt-1 font-mono text-2xl font-bold text-[var(--app-text)]">
                  {c.value}
                </p>
              </div>
              <div className={`rounded-xl p-2.5 ${c.color}`}>
                <Icon size={20} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Financial Impact Row */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--app-text-secondary)]">
            <DollarSign size={14} className="text-emerald-500" />
            <span>القيمة التقديرية للمشتريات الموصى بها</span>
          </div>
          <p dir="ltr" className="mt-2 font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(overviewKpis.estimatedRecommendedPurchaseValue)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
            بناءً على أسعار الموردين والتكلفة الفعلية بعد خصم المتاح والوارد
          </p>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--app-text-secondary)]">
            <ArrowLeftRight size={14} className="text-indigo-500" />
            <span>رأس المال الموفَّر عبر التحويلات الداخلية</span>
          </div>
          <p dir="ltr" className="mt-2 font-mono text-xl font-bold text-indigo-600 dark:text-indigo-400">
            {formatCurrency(overviewKpis.estimatedTransferCapitalSaved)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
            مشتريات يمكن تفاديها بإعادة توزيع الفائض بين الفروع الثلاثة
          </p>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--app-text-secondary)]">
            <Archive size={14} className="text-rose-500" />
            <span>قيمة المخزون الراكد والفائض المجمد</span>
          </div>
          <p dir="ltr" className="mt-2 font-mono text-xl font-bold text-rose-600 dark:text-rose-400">
            {formatCurrency(overviewKpis.totalExcessInventoryValue)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
            رأس مال مقيد في أصناف بطيئة أو راكدة أو فائضة عن حاجة الطلب
          </p>
        </div>
      </div>

      {/* Brand, Origin & Quality Analytics */}
      {(data.brandAnalytics?.length ?? 0) > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
          <div className="border-b border-[var(--app-border)] px-4 py-3 text-xs font-bold text-[var(--app-text)]">
            تحليل الطلب والمخزون حسب الشركة الصانعة والمنشأ ودرجة الجودة (أعلى 20 علامة)
          </div>
          <table className={GRID_TABLE_CLASS}>
            <thead className="bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
              <tr>
                <th className="p-2.5">الشركة الصانعة</th>
                <th className="p-2.5 text-center">الدرجة</th>
                <th className="p-2.5">المنشأ</th>
                <th className="p-2.5 text-center">عدد الأصناف</th>
                <th className="p-2.5 text-center">مبيعات 365ي</th>
                <th className="p-2.5 text-end">الإيراد السنوي</th>
                <th className="p-2.5 text-end">قيمة المخزون</th>
              </tr>
            </thead>
            <tbody>
              {(data.brandAnalytics ?? []).slice(0, 20).map(b => (
                <tr key={`${b.brand}-${b.qualityGrade}`} className="hover:bg-[var(--app-surface-hover)]">
                  <td className="p-2.5 font-bold text-[var(--app-text)]">{b.brand}</td>
                  <td className="p-2.5 text-center">
                    <QualityBadge grade={b.qualityGrade} />
                  </td>
                  <td className="p-2.5 text-[var(--app-text-secondary)]">{b.originTag}</td>
                  <td dir="ltr" className="p-2.5 text-center font-mono">
                    {formatNumberDisplay(b.productCount)}
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono font-bold text-blue-600">
                    {formatNumberDisplay(b.qty365d)}
                  </td>
                  <td dir="ltr" className="p-2.5 text-end font-mono">
                    {formatCurrency(b.revenue365d)}
                  </td>
                  <td dir="ltr" className="p-2.5 text-end font-mono font-bold">
                    {formatCurrency(b.stockValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CommandCenterPanel
        data={data}
        history={history}
        companyId={companyId}
        orchestration={orchestration}
        onNavigateTab={onNavigateTab}
      />
    </div>
  );
});
