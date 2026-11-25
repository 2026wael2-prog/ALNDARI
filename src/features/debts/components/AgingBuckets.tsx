import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../core/routes/paths';
import { formatCurrency } from '../../../core/utils/currencyUtils';
import { AGING_ORDER, getAgingMeta, type AgingKey } from '../lib/aging';
import type { DebtAnalytics } from '../types';

interface AgingTileProps {
  bucketKey: AgingKey;
  value: number;
  count: number;
  baseCurrency: string;
  onSelect: (key: AgingKey) => void;
}

/** بطاقة شريحة واحدة — مفصولة لخفض حجم المكوّن الأب. */
const AgingTile: React.FC<AgingTileProps> = ({
  bucketKey,
  value,
  count,
  baseCurrency,
  onSelect,
}) => {
  const meta = getAgingMeta(bucketKey);

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(bucketKey);
      }}
      title={`عرض عملاء شريحة: ${meta.label}`}
      className="min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] p-1.5 text-right transition-all hover:border-blue-400 hover:shadow-sm active:scale-[0.98] sm:rounded-xl sm:p-2 md:p-3"
    >
      <span className={`flex items-center gap-1 truncate text-[10px] font-bold sm:gap-1.5 sm:text-[10px] ${meta.colorClass}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2 ${meta.barClass}`} />
        <span className="truncate">{meta.label}</span>
      </span>
      <span dir="ltr" className="mt-0.5 block truncate text-right font-mono text-[10.5px] font-black text-[var(--app-text)] sm:mt-1 sm:text-sm sm:font-bold md:mt-1.5 md:text-base">
        {formatCurrency(value, baseCurrency)}
      </span>
      <span className="mt-0.5 block truncate text-[10px] text-[var(--app-text-secondary)] sm:text-[10px]">
        {count} عميل
      </span>
    </button>
  );
};

interface AgingBucketsProps {
  aging: DebtAnalytics['aging'];
  baseCurrency: string;
}

/**
 * شرائح أعمار الديون — كل شريحة قابلة للنقر وتفتح لوحة المتابعة
 * مفلترة على عملاء تلك الشريحة (مصدر الحقيقة للحساب في SQL).
 */
const AgingBuckets: React.FC<AgingBucketsProps> = ({ aging, baseCurrency }) => {
  const navigate = useNavigate();

  const byKey = useMemo(() => {
    const map = new Map<string, { value: number; count: number }>();
    (aging ?? []).forEach(row => {
      map.set(row.key, { value: row.value ?? 0, count: row.count ?? 0 });
    });
    return map;
  }, [aging]);

  return (
    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm max-md:p-2.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 max-md:mb-2">
        <h3 className="text-sm font-bold text-[var(--app-text)]">أعمار الديون (التقادم)</h3>
        <span className="text-[10px] font-bold text-[var(--app-text-secondary)]">
          اضغط أي شريحة لعرض عملائها ومتابعتهم
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1 sm:gap-2">
        {AGING_ORDER.map(key => {
          const row = byKey.get(key);

          return (
            <AgingTile
              key={key}
              bucketKey={key}
              value={row?.value ?? 0}
              count={row?.count ?? 0}
              baseCurrency={baseCurrency}
              onSelect={selected => {
                void navigate(`${ROUTES.DASHBOARD.DEBTS_FOLLOWUP}?aging=${selected}`);
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default AgingBuckets;
