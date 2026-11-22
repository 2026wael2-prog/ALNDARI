import React, { useMemo, useState } from 'react';
import type { BranchInfo, ProductIntelligenceSummary } from '../../types';
import { formatCurrency, formatNumberDisplay } from '../../../../core/utils';
import {
  DEFAULT_INTELLIGENCE_FILTERS,
  filterAndSortProducts,
  type IntelligenceFilterState,
} from '../../domain/sorting/intelligenceSortAndFilter';
import {
  GRID_TABLE_CLASS,
  LastSupplierCell,
  MovementBadge,
  PatternBadge,
  ProductIdentityCell,
  TablePaginationBar,
} from '../shared/IntelligenceBadges';
import { IntelligenceFilterSortBar } from '../shared/IntelligenceFilterSortBar';

interface Props {
  products: ProductIntelligenceSummary[];
  branches: BranchInfo[];
}

export const TopMovingTab: React.FC<Props> = React.memo(({ products, branches }) => {
  const [filters, setFilters] = useState<IntelligenceFilterState>({
    ...DEFAULT_INTELLIGENCE_FILTERS,
    sortBy: 'qty365d',
    sortDir: 'desc',
  });
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const allRows = useMemo(() => {
    const active = products.filter(p => {
      if (gradeFilter !== 'all' && p.identity.qualityGrade !== gradeFilter) return false;
      const m =
        filters.branchId === 'all'
          ? p.companyMetrics
          : p.branchMetrics.find(b => b.branchId === filters.branchId) ?? p.companyMetrics;
      return m.qty365d > 0 || m.txCount > 0;
    });
    const sorted = filterAndSortProducts(active, filters);
    return sorted.map(p => {
      const m =
        filters.branchId === 'all'
          ? p.companyMetrics
          : p.branchMetrics.find(b => b.branchId === filters.branchId) ?? p.companyMetrics;
      return { p, m };
    });
  }, [products, filters, gradeFilter]);

  const rows = useMemo(
    () => allRows.slice((page - 1) * pageSize, page * pageSize),
    [allRows, page]
  );

  return (
    <div className="space-y-3">
      <IntelligenceFilterSortBar
        products={products}
        branches={branches}
        filters={filters}
        onChange={next => {
          setFilters(next);
          setPage(1);
        }}
        extraControls={
          <select
            value={gradeFilter}
            onChange={e => {
              setGradeFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1.5 text-xs font-bold text-[var(--app-text)]"
          >
            <option value="all">جميع درجات الجودة</option>
            <option value="genuine_oem">أصلي / OEM</option>
            <option value="japanese_aftermarket">ياباني</option>
            <option value="korean_aftermarket">كوري</option>
            <option value="thai_aftermarket">تايلندي</option>
            <option value="chinese_commercial">صيني / تجاري</option>
            <option value="other_aftermarket">بديل آخر</option>
          </select>
        }
      />

      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
        <table className={GRID_TABLE_CLASS}>
          <thead className="bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
            <tr>
              <th className="p-2.5">القطعة / الرقم / الشركة الصانعة</th>
              <th className="p-2.5">آخر مورد</th>
              <th className="p-2.5 text-center">الفواتير</th>
              <th className="p-2.5 text-center">30 يوم</th>
              <th className="p-2.5 text-center">365 يوم</th>
              <th className="p-2.5 text-center">المتاح</th>
              <th className="p-2.5 text-end">الإيراد</th>
              <th className="p-2.5 text-end">مجمل الربح</th>
              <th className="p-2.5 text-center">النمو</th>
              <th className="p-2.5 text-center">التصنيف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-[var(--app-text-secondary)]">
                  لا توجد أصناف مطابقة للفلاتر المحددة
                </td>
              </tr>
            ) : (
              rows.map(({ p, m }) => (
                <tr key={p.identity.productId} className="hover:bg-[var(--app-surface-hover)]">
                  <td className="p-2.5">
                    <ProductIdentityCell
                      productId={p.identity.productId}
                      name={p.identity.name}
                      partNumber={p.identity.partNumber}
                      sku={p.identity.sku}
                      brand={p.identity.brand}
                      originTag={p.identity.originTag}
                      qualityGrade={p.identity.qualityGrade}
                      categoryName={p.identity.categoryName}
                      alternativeNumbers={p.identity.alternativeNumbers}
                    />
                  </td>
                  <td className="p-2.5">
                    <LastSupplierCell supplier={p.lastSupplier} />
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono font-bold">
                    {formatNumberDisplay(m.txCount)}
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono">
                    {formatNumberDisplay(m.qty30d)}
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono font-bold">
                    {formatNumberDisplay(m.qty365d)}
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono">
                    {formatNumberDisplay(m.availableStock)}
                  </td>
                  <td dir="ltr" className="p-2.5 text-end font-mono">
                    {formatCurrency(m.revenue365d)}
                  </td>
                  <td dir="ltr" className="p-2.5 text-end font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(m.grossProfit365d)}
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono font-bold">
                    <span className={m.growthRatePct >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                      {m.growthRatePct > 0 ? '+' : ''}
                      {m.growthRatePct}%
                    </span>
                  </td>
                  <td className="p-2.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <MovementBadge movement={p.movementClass} />
                      <PatternBadge pattern={m.demandPattern} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TablePaginationBar
        page={page}
        pageSize={pageSize}
        total={allRows.length}
        onPageChange={setPage}
      />
    </div>
  );
});
