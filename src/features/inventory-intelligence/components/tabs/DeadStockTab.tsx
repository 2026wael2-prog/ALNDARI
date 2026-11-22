import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type {
  BranchInfo,
  DeadExcessRecommendation,
  PersistedRecommendationRecord,
  ProductIntelligenceSummary,
  RecommendationStatus,
} from '../../types';
import { formatCurrency, formatNumberDisplay } from '../../../../core/utils';
import Button from '../../../../ui/base/Button';
import {
  DEFAULT_INTELLIGENCE_FILTERS,
  filterAndSortProducts,
  getProductMap,
  type IntelligenceFilterState,
} from '../../domain/sorting/intelligenceSortAndFilter';
import {
  GRID_TABLE_CLASS,
  ProductIdentityCell,
  TablePaginationBar,
} from '../shared/IntelligenceBadges';
import { IntelligenceFilterSortBar } from '../shared/IntelligenceFilterSortBar';

interface Props {
  items: DeadExcessRecommendation[];
  products?: ProductIntelligenceSummary[];
  branches?: BranchInfo[];
  history?: PersistedRecommendationRecord[];
  onDecide?: (params: {
    recType: 'excess_review';
    productId: string;
    recommendedQty: number;
    approvedQty?: number;
    urgency: string;
    confidenceScore: number;
    reason: string;
    status: RecommendationStatus;
  }) => Promise<void>;
  isDeciding?: boolean;
}

export const DeadStockTab: React.FC<Props> = React.memo(({
  items,
  products = [],
  branches = [],
  history = [],
  onDecide,
  isDeciding = false,
}) => {
  const [filter, setFilter] = useState<'all' | 'dead_stock' | 'excess_stock' | 'slow_moving'>('all');
  const [dimFilters, setDimFilters] = useState<IntelligenceFilterState>(DEFAULT_INTELLIGENCE_FILTERS);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [reviewedIds, setReviewedIds] = useState<Record<string, boolean>>({});

  const productMap = useMemo(() => getProductMap(products), [products]);

  const persistedReviewed = useMemo(() => {
    const set = new Set<string>();
    for (const h of history) {
      if (h.rec_type === 'excess_review') set.add(h.product_id);
    }
    return set;
  }, [history]);

  const allFiltered = useMemo(() => {
    const byClass = items.filter(i => (filter === 'all' ? true : i.classification === filter));
    if (products.length === 0) return byClass;

    const itemByProd = new Map(byClass.map(i => [i.productId, i]));
    const matchingProducts = byClass
      .map(i => productMap.get(i.productId))
      .filter((p): p is ProductIntelligenceSummary => Boolean(p));

    const sortedProducts = filterAndSortProducts(matchingProducts, dimFilters);
    return sortedProducts
      .map(p => itemByProd.get(p.identity.productId))
      .filter((i): i is DeadExcessRecommendation => Boolean(i));
  }, [items, filter, products.length, productMap, dimFilters]);

  const filtered = useMemo(
    () => allFiltered.slice((page - 1) * pageSize, page * pageSize),
    [allFiltered, page]
  );

  const labels: Record<DeadExcessRecommendation['classification'], { text: string; cls: string }> = {
    dead_stock: { text: 'راكد', cls: 'bg-rose-500/10 text-rose-600' },
    excess_stock: { text: 'مخزون فائض', cls: 'bg-violet-500/10 text-violet-600' },
    slow_moving: { text: 'بطيء الحركة', cls: 'bg-amber-500/10 text-amber-600' },
  };

  return (
    <div className="space-y-3">
      <IntelligenceFilterSortBar
        products={products}
        branches={branches}
        filters={dimFilters}
        onChange={next => {
          setDimFilters(next);
          setPage(1);
        }}
        extraControls={
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { key: 'all', label: 'الكل' },
                { key: 'dead_stock', label: 'الراكد فقط' },
                { key: 'excess_stock', label: 'الفائض فقط' },
                { key: 'slow_moving', label: 'البطيء فقط' },
              ] as const
            ).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setFilter(opt.key);
                  setPage(1);
                }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                  filter === opt.key
                    ? 'bg-blue-600 text-white'
                    : 'border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text-secondary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
        <table className={GRID_TABLE_CLASS}>
          <thead className="bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
            <tr>
              <th className="p-2.5">القطعة / الرقم / الشركة الصانعة</th>
              <th className="p-2.5 text-center">التصنيف</th>
              <th className="p-2.5 text-center">الرصيد الحالي</th>
              <th className="p-2.5 text-end">القيمة المجمدة</th>
              <th className="p-2.5 text-center">أيام منذ آخر بيع</th>
              <th className="p-2.5 text-center">مبيعات 365ي</th>
              <th className="p-2.5">الإجراء الموصى به</th>
              <th className="p-2.5 text-center">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-[var(--app-text-secondary)]">
                  لا توجد أصناف راكدة أو فائضة ضمن هذا التصنيف
                </td>
              </tr>
            ) : (
              filtered.map(item => {
                const badge = labels[item.classification];
                const isReviewed =
                  Boolean(reviewedIds[item.id]) || persistedReviewed.has(item.productId);
                return (
                  <tr key={item.id} className="hover:bg-[var(--app-surface-hover)]">
                    <td className="p-2.5">
                      <ProductIdentityCell
                        name={item.productName}
                        partNumber={item.partNumber}
                        sku={item.sku}
                        brand={item.brand}
                      />
                    </td>
                    <td className="p-2.5 text-center">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono font-bold">
                      {formatNumberDisplay(item.currentStock)}
                    </td>
                    <td dir="ltr" className="p-2.5 text-end font-mono font-bold text-rose-600">
                      {formatCurrency(item.stockValue)}
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono">
                      {item.daysSinceLastSale !== null ? `${item.daysSinceLastSale} يوم` : 'لم يُبع'}
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono">
                      {formatNumberDisplay(item.sold365d)}
                    </td>
                    <td className="p-2.5 text-[11px] text-[var(--app-text-secondary)]">
                      {item.recommendedAction}
                    </td>
                    <td className="p-2.5 text-center">
                      {isReviewed ? (
                        <span className="rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-600">
                          تمت المراجعة
                        </span>
                      ) : (
                        onDecide && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isDeciding}
                            onClick={() => {
                              void onDecide({
                                recType: 'excess_review',
                                productId: item.productId,
                                recommendedQty: item.currentStock,
                                approvedQty: item.currentStock,
                                urgency: item.classification === 'dead_stock' ? 'high' : 'medium',
                                confidenceScore: 85,
                                reason: item.recommendedAction,
                                status: 'approved',
                              }).then(() => {
                                setReviewedIds(prev => ({ ...prev, [item.id]: true }));
                              });
                            }}
                            leftIcon={<Check size={12} />}
                          >
                            اعتماد المراجعة
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <TablePaginationBar
        page={page}
        pageSize={pageSize}
        total={allFiltered.length}
        onPageChange={setPage}
      />
    </div>
  );
});
