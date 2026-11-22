import React, { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { BranchInfo, ProductIntelligenceSummary } from '../../types';
import { formatNumberDisplay } from '../../../../core/utils';
import {
  DEFAULT_INTELLIGENCE_FILTERS,
  filterAndSortProducts,
  type IntelligenceFilterState,
} from '../../domain/sorting/intelligenceSortAndFilter';
import {
  GRID_TABLE_CLASS,
  LastSupplierCell,
  PatternBadge,
  ProductIdentityCell,
  TablePaginationBar,
} from '../shared/IntelligenceBadges';
import { IntelligenceFilterSortBar } from '../shared/IntelligenceFilterSortBar';

interface Props {
  products: ProductIntelligenceSummary[];
  branches?: BranchInfo[];
}

export const FastGrowingTab: React.FC<Props> = React.memo(({ products, branches = [] }) => {
  const [filters, setFilters] = useState<IntelligenceFilterState>(DEFAULT_INTELLIGENCE_FILTERS);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const baseGrowing = useMemo(
    () =>
      products
        .filter(p => p.isFastGrowing)
        .sort((a, b) => b.companyMetrics.growthRatePct - a.companyMetrics.growthRatePct),
    [products]
  );

  const allGrowing = useMemo(
    () => filterAndSortProducts(baseGrowing, filters),
    [baseGrowing, filters]
  );

  const growing = useMemo(
    () => allGrowing.slice((page - 1) * pageSize, page * pageSize),
    [allGrowing, page]
  );

  if (baseGrowing.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-10 text-center text-sm text-[var(--app-text-secondary)]">
        لم يتم رصد أصناف ذات نمو متسارع يتجاوز عتبة النمو المحددة في الإعدادات.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <IntelligenceFilterSortBar
        products={baseGrowing}
        branches={branches}
        filters={filters}
        onChange={next => {
          setFilters(next);
          setPage(1);
        }}
      />

      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
        <table className={GRID_TABLE_CLASS}>
          <thead className="bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
            <tr>
              <th className="p-2.5">القطعة / الرقم / الشركة الصانعة</th>
              <th className="p-2.5">آخر مورد</th>
              <th className="p-2.5 text-center">مبيعات آخر 3 أشهر (شهر بشهر)</th>
              <th className="p-2.5 text-center">نسبة النمو</th>
              <th className="p-2.5 text-center">المتاح الحالي</th>
              <th className="p-2.5 text-center">التوقع 30 يوم</th>
              <th className="p-2.5 text-center">النمط</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {growing.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--app-text-secondary)]">
                  لا توجد أصناف مطابقة للفلاتر المحددة
                </td>
              </tr>
            ) : (
              growing.map(p => {
                const last3 = p.companyMetrics.monthlySeries.slice(-3);
                return (
                  <tr key={p.identity.productId} className="hover:bg-[var(--app-surface-hover)]">
                    <td className="p-2.5">
                      <ProductIdentityCell
                        productId={p.identity.productId}
                        name={p.identity.name}
                        partNumber={p.identity.partNumber}
                        sku={p.identity.sku}
                        brand={p.identity.brand}
                        partType={p.identity.partType}
                        size={p.identity.size}
                        originTag={p.identity.originTag}
                        qualityGrade={p.identity.qualityGrade}
                        categoryName={p.identity.categoryName}
                        alternativeNumbers={p.identity.alternativeNumbers}
                      />
                    </td>
                    <td className="p-2.5">
                      <LastSupplierCell supplier={p.lastSupplier} />
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono">
                      {last3.join(' → ')}
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono font-bold text-emerald-600">
                      <span className="inline-flex items-center gap-1">
                        <TrendingUp size={12} />+{p.companyMetrics.growthRatePct}%
                      </span>
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono">
                      {formatNumberDisplay(p.companyMetrics.availableStock)}
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono font-bold text-blue-600">
                      {formatNumberDisplay(p.forecast30d.predictedQty)}
                    </td>
                    <td className="p-2.5 text-center">
                      <PatternBadge pattern={p.companyMetrics.demandPattern} />
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
        total={allGrowing.length}
        onPageChange={setPage}
      />
    </div>
  );
});
