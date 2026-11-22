import React, { useMemo, useState } from 'react';
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
  ProductIdentityCell,
  TablePaginationBar,
} from '../shared/IntelligenceBadges';
import { IntelligenceFilterSortBar } from '../shared/IntelligenceFilterSortBar';

interface Props {
  products: ProductIntelligenceSummary[];
  branches: BranchInfo[];
}

export const BranchDemandTab: React.FC<Props> = React.memo(({ products, branches }) => {
  const [filters, setFilters] = useState<IntelligenceFilterState>({
    ...DEFAULT_INTELLIGENCE_FILTERS,
    sortBy: 'qty365d',
    sortDir: 'desc',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const allFiltered = useMemo(() => {
    const active = products.filter(
      p => p.companyMetrics.qty365d > 0 || p.companyMetrics.availableStock > 0
    );
    return filterAndSortProducts(active, filters);
  }, [products, filters]);

  const filtered = useMemo(
    () => allFiltered.slice((page - 1) * pageSize, page * pageSize),
    [allFiltered, page]
  );

  const activeProduct = useMemo(
    () => products.find(p => p.identity.productId === selectedId) ?? filtered[0] ?? null,
    [products, filtered, selectedId]
  );

  return (
    <div className="space-y-4">
      <IntelligenceFilterSortBar
        products={products}
        branches={branches}
        filters={filters}
        onChange={next => {
          setFilters(next);
          setPage(1);
        }}
        searchPlaceholder="ابحث بالاسم، اسم القطعة، المقاس، المورد، العميل، أو الفرع..."
      />

      {activeProduct && (
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[var(--app-text)]">
                {activeProduct.identity.name}
              </h3>
              <p className="font-mono text-[11px] text-[var(--app-text-secondary)]">
                {activeProduct.identity.brand} • P/N: {activeProduct.identity.partNumber} • SKU:{' '}
                {activeProduct.identity.sku}
              </p>
            </div>
            <span className="rounded-lg bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-600 dark:text-blue-400">
              إجمالي طلب 90 يوماً: {formatNumberDisplay(activeProduct.companyMetrics.qty90d)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {activeProduct.branchMetrics.map(bm => (
              <div
                key={bm.branchId}
                className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--app-text)]">{bm.branchName}</span>
                  <span className="font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    متاح: {formatNumberDisplay(bm.availableStock)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="rounded bg-[var(--app-surface)] p-1.5">
                    <div className="text-[var(--app-text-secondary)]">30 يوم</div>
                    <div dir="ltr" className="font-mono font-bold">
                      {formatNumberDisplay(bm.qty30d)}
                    </div>
                  </div>
                  <div className="rounded bg-[var(--app-surface)] p-1.5">
                    <div className="text-[var(--app-text-secondary)]">90 يوم</div>
                    <div dir="ltr" className="font-mono font-bold">
                      {formatNumberDisplay(bm.qty90d)}
                    </div>
                  </div>
                  <div className="rounded bg-[var(--app-surface)] p-1.5">
                    <div className="text-[var(--app-text-secondary)]">تغطية</div>
                    <div dir="ltr" className="font-mono font-bold">
                      {bm.daysOfCoverage >= 999 ? '∞' : `${bm.daysOfCoverage}ي`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
        <table className={GRID_TABLE_CLASS}>
          <thead className="bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
            <tr>
              <th className="p-2.5">القطعة / الرقم / الشركة الصانعة</th>
              <th className="p-2.5">آخر مورد</th>
              {branches.map(b => (
                <th key={b.id} className="p-2.5 text-center">
                  {b.name} (متاح / 90ي)
                </th>
              ))}
              <th className="p-2.5 text-center">الإجمالي (متاح / 90ي)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={branches.length + 3} className="p-8 text-center text-[var(--app-text-secondary)]">
                  لا توجد أصناف مطابقة لمعايير البحث الحالية
                </td>
              </tr>
            ) : (
              filtered.map(p => (
              <tr
                key={p.identity.productId}
                onClick={() => {
                  setSelectedId(p.identity.productId);
                }}
                className="cursor-pointer hover:bg-[var(--app-surface-hover)]"
              >
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
                {branches.map(b => {
                  const bm = p.branchMetrics.find(x => x.branchId === b.id);
                  return (
                    <td key={b.id} dir="ltr" className="p-2.5 text-center font-mono">
                      <span className={(bm?.availableStock ?? 0) <= 0 ? 'font-bold text-rose-600' : ''}>
                        {formatNumberDisplay(bm?.availableStock ?? 0)}
                      </span>{' '}
                      / <span className="text-blue-600">{formatNumberDisplay(bm?.qty90d ?? 0)}</span>
                    </td>
                  );
                })}
                <td dir="ltr" className="p-2.5 text-center font-mono font-bold">
                  {formatNumberDisplay(p.companyMetrics.availableStock)} /{' '}
                  {formatNumberDisplay(p.companyMetrics.qty90d)}
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
        total={allFiltered.length}
        onPageChange={setPage}
      />
    </div>
  );
});
