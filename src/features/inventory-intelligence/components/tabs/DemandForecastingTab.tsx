import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { ProductIntelligenceSummary } from '../../types';
import { formatNumberDisplay } from '../../../../core/utils';
import {
  ConfidenceMeter,
  GRID_TABLE_CLASS,
  LastSupplierCell,
  PatternBadge,
  ProductIdentityCell,
  TablePaginationBar,
} from '../shared/IntelligenceBadges';

interface Props {
  products: ProductIntelligenceSummary[];
  horizons: number[];
}

export const DemandForecastingTab: React.FC<Props> = React.memo(({ products, horizons }) => {
  const [search, setSearch] = useState('');
  const [localSearch, setLocalSearch] = useState('');
  const [horizon, setHorizon] = useState<number>(horizons.includes(30) ? 30 : horizons[0] ?? 30);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(localSearch);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [localSearch]);

  const allCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter(p => {
        if (!q) return p.companyMetrics.qty365d > 0;
        return `${p.identity.name} ${p.identity.partNumber} ${p.identity.sku} ${p.identity.brand}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b.forecast30d.predictedQty - a.forecast30d.predictedQty);
  }, [products, search]);

  const candidates = useMemo(
    () => allCandidates.slice((page - 1) * pageSize, page * pageSize),
    [allCandidates, page]
  );

  const active = useMemo(
    () => products.find(p => p.identity.productId === selectedId) ?? candidates[0] ?? null,
    [products, candidates, selectedId]
  );

  const activeForecast = active
    ? active.forecastsByHorizon[horizon] ?? active.forecast30d
    : null;

  const chartMax = useMemo(() => {
    if (!active || !activeForecast) return 1;
    return Math.max(
      1,
      ...active.companyMetrics.monthlySeries,
      activeForecast.dailyRate * 30
    );
  }, [active, activeForecast]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)]" />
          <input
            type="text"
            value={localSearch}
            onChange={e => {
              setLocalSearch(e.target.value);
            }}
            placeholder="اختر صنفاً لمعاينة السلسلة التاريخية والتنبؤ..."
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] py-1.5 pl-3 pr-9 text-xs text-[var(--app-text)] outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-1">
          {horizons.map(h => (
            <button
              key={h}
              type="button"
              onClick={() => {
                setHorizon(h);
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                horizon === h
                  ? 'bg-blue-600 text-white'
                  : 'border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text-secondary)]'
              }`}
            >
              {h} يوم
            </button>
          ))}
        </div>
      </div>

      {active && activeForecast && (
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--app-text)]">{active.identity.name}</h3>
              <p className="font-mono text-[11px] text-[var(--app-text-secondary)]">
                النموذج المختار: <span className="font-bold text-blue-600">{activeForecast.selectedModel}</span> •{' '}
                الطلب المتوقع خلال {horizon} يوماً:{' '}
                <span className="font-bold text-emerald-600">
                  {formatNumberDisplay(activeForecast.predictedQty)} وحدة
                </span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <PatternBadge pattern={activeForecast.demandPattern} />
              <ConfidenceMeter score={activeForecast.confidenceScore} />
            </div>
          </div>

          {/* 12-Month Actual vs Next-Month Forecast Visual Bar Chart */}
          <div
            dir="ltr"
            className="grid h-40 grid-cols-[repeat(13,minmax(0,1fr))] items-end gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3"
          >
            {active.companyMetrics.monthlySeries.map((val, idx) => {
              const pct = Math.max(4, Math.round((val / chartMax) * 100));
              return (
                <div key={idx} className="flex h-full flex-col items-center justify-end gap-1">
                  <span dir="ltr" className="font-mono text-[10px] text-[var(--app-text-secondary)]">
                    {val > 0 ? val : ''}
                  </span>
                  <div
                    className="w-full rounded-t bg-blue-500/80 transition-all"
                    style={{ height: `${pct}%` }}
                  />
                  <span className="font-mono text-[10px] text-[var(--app-text-secondary)]">
                    M{idx + 1}
                  </span>
                </div>
              );
            })}
            <div className="flex h-full flex-col items-center justify-end gap-1">
              <span dir="ltr" className="font-mono text-[10px] font-bold text-emerald-600">
                {Math.round(activeForecast.dailyRate * 30)}
              </span>
              <div
                className="w-full rounded-t border-2 border-dashed border-emerald-500 bg-emerald-500/30"
                style={{
                  height: `${Math.max(6, Math.round(((activeForecast.dailyRate * 30) / chartMax) * 100))}%`,
                }}
              />
              <span className="font-mono text-[10px] font-bold text-emerald-600">توقع</span>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
        <table className={GRID_TABLE_CLASS}>
          <thead className="bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
            <tr>
              <th className="p-2.5">القطعة / الرقم / الشركة الصانعة</th>
              <th className="p-2.5">آخر مورد</th>
              <th className="p-2.5 text-center">النمط</th>
              <th className="p-2.5 text-center">النموذج البطل</th>
              <th className="p-2.5 text-center">المعدل اليومي</th>
              <th className="p-2.5 text-center">التوقع ({horizon} يوم)</th>
              <th className="p-2.5 text-center">WAPE</th>
              <th className="p-2.5 text-center">مستوى الثقة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {candidates.map(p => {
              const f = p.forecastsByHorizon[horizon] ?? p.forecast30d;
              return (
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
                  <td className="p-2.5 text-center">
                    <PatternBadge pattern={f.demandPattern} />
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono font-bold text-blue-600">
                    {f.selectedModel}
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono">
                    {f.dailyRate}
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono font-bold text-emerald-600">
                    {formatNumberDisplay(f.predictedQty)}
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono">
                    {f.wape}%
                  </td>
                  <td className="p-2.5">
                    <div className="flex justify-center">
                      <ConfidenceMeter score={f.confidenceScore} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TablePaginationBar
        page={page}
        pageSize={pageSize}
        total={allCandidates.length}
        onPageChange={setPage}
      />
    </div>
  );
});
