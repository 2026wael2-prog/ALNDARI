import React from 'react';
import { ArrowDownUp, RotateCcw, Search } from 'lucide-react';
import type { BranchInfo, ProductIntelligenceSummary } from '../../types';
import {
  DEFAULT_INTELLIGENCE_FILTERS,
  extractFilterOptions,
  type IntelligenceFilterState,
  type IntelligenceSortField,
} from '../../domain/sorting/intelligenceSortAndFilter';

interface IntelligenceFilterSortBarProps {
  products: ProductIntelligenceSummary[];
  branches: BranchInfo[];
  filters: IntelligenceFilterState;
  onChange: (next: IntelligenceFilterState) => void;
  searchPlaceholder?: string;
  extraControls?: React.ReactNode;
}

const SORT_OPTIONS: Array<{ value: IntelligenceSortField; label: string }> = [
  { value: 'default', label: 'الترتيب الافتراضي (الأولوية)' },
  { value: 'name', label: 'الاسم (أبجدي)' },
  { value: 'partType', label: 'اسم القطعة' },
  { value: 'size', label: 'المقاس' },
  { value: 'supplier', label: 'المورد' },
  { value: 'customer', label: 'العميل' },
  { value: 'branchStock', label: 'مخزون الفرع' },
  { value: 'branchDemand', label: 'طلب / عجز الفرع' },
  { value: 'qty365d', label: 'مبيعات 365 يوم' },
  { value: 'forecast30d', label: 'الطلب المتوقع (30 يوم)' },
  { value: 'stockValue', label: 'القيمة / التكلفة' },
];

export const IntelligenceFilterSortBar: React.FC<IntelligenceFilterSortBarProps> = React.memo(({
  products,
  branches,
  filters,
  onChange,
  searchPlaceholder = 'ابحث بالاسم، اسم القطعة، المقاس، المورد، العميل، SKU...',
  extraControls,
}) => {
  const options = React.useMemo(() => extractFilterOptions(products), [products]);
  const [localSearch, setLocalSearch] = React.useState(filters.search);

  React.useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filters.search) {
        onChange({ ...filters, search: localSearch });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [localSearch, filters, onChange]);

  const hasActiveFilters =
    filters.search !== '' ||
    filters.partType !== 'all' ||
    filters.size !== 'all' ||
    filters.supplierId !== 'all' ||
    filters.customerId !== 'all' ||
    filters.branchId !== 'all' ||
    filters.sortBy !== 'default';

  return (
    <div className="space-y-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[var(--app-text-secondary)]"
          />
          <input
            type="text"
            value={localSearch}
            onChange={e => {
              setLocalSearch(e.target.value);
            }}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] py-1.5 pr-9 pl-3 text-xs text-[var(--app-text)]"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <select
            aria-label="فرز حسب"
            value={filters.sortBy}
            onChange={e => {
              onChange({ ...filters, sortBy: e.target.value as IntelligenceSortField });
            }}
            className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1.5 text-xs font-bold text-[var(--app-text)]"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                فرز: {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              onChange({
                ...filters,
                sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc',
              });
            }}
            title={filters.sortDir === 'asc' ? 'تصاعدي' : 'تنازلي'}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1.5 text-xs font-bold text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]"
          >
            <ArrowDownUp size={13} />
            <span>{filters.sortDir === 'asc' ? 'تصاعدي' : 'تنازلي'}</span>
          </button>
        </div>

        {extraControls}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="تصفية حسب الفرع"
          value={filters.branchId}
          onChange={e => {
            onChange({ ...filters, branchId: e.target.value });
          }}
          className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-xs text-[var(--app-text)]"
        >
          <option value="all">كل الفروع</option>
          {branches.map(b => (
            <option key={b.id} value={b.id}>
              فرع: {b.name}
            </option>
          ))}
        </select>

        <select
          aria-label="تصفية حسب اسم القطعة"
          value={filters.partType}
          onChange={e => {
            onChange({ ...filters, partType: e.target.value });
          }}
          className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-xs text-[var(--app-text)]"
        >
          <option value="all">كل أسماء القطع</option>
          {options.partTypes.map(pt => (
            <option key={pt} value={pt}>
              القطعة: {pt}
            </option>
          ))}
        </select>

        <select
          aria-label="تصفية حسب المقاس"
          value={filters.size}
          onChange={e => {
            onChange({ ...filters, size: e.target.value });
          }}
          className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-xs text-[var(--app-text)]"
        >
          <option value="all">كل المقاسات</option>
          {options.sizes.map(sz => (
            <option key={sz} value={sz}>
              المقاس: {sz}
            </option>
          ))}
        </select>

        <select
          aria-label="تصفية حسب المورد"
          value={filters.supplierId}
          onChange={e => {
            onChange({ ...filters, supplierId: e.target.value });
          }}
          className="max-w-[200px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-xs text-[var(--app-text)]"
        >
          <option value="all">كل الموردين</option>
          {options.suppliers.map(s => (
            <option key={s.id} value={s.id}>
              المورد: {s.name}
            </option>
          ))}
        </select>

        {options.customers.length > 0 && (
          <select
            aria-label="تصفية حسب العميل"
            value={filters.customerId}
            onChange={e => {
              onChange({ ...filters, customerId: e.target.value });
            }}
            className="max-w-[200px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-xs text-[var(--app-text)]"
          >
            <option value="all">كل العملاء</option>
            {options.customers.map(c => (
              <option key={c.id} value={c.id}>
                العميل: {c.name}
              </option>
            ))}
          </select>
        )}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              onChange(DEFAULT_INTELLIGENCE_FILTERS);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-500/20"
          >
            <RotateCcw size={12} />
            <span>إعادة ضبط</span>
          </button>
        )}
      </div>
    </div>
  );
});
