/* eslint-disable max-lines-per-function, complexity */
import React, { useState, useMemo } from 'react';
import { Filter, X, Coins, AlertTriangle } from 'lucide-react';
import type { Party, PartyCurrencyFilter, PartyType, PartyStats } from '../types';
import type { Column } from '../../../ui/common/ExcelTable';
import PartiesStats from './PartiesStats';
import ExcelTable from '../../../ui/common/ExcelTable';
import { cn } from '../../../core/utils';
import { useAccompanyingInfoStore } from '../../accompanying-info';
import {
  calculatePartyStats,
  classifyPartyBalance,
  filterPartiesStrict,
  getPartyCurrencyBalance,
  hasMultipleActiveCurrencies,
  PARTY_BALANCE_EPSILON,
  type PartyListStatusFilter,
} from '../services/partyStatementService';

interface PartiesListViewProps {
  partyType: PartyType;
  parties?: Party[];
  isLoading: boolean;
  stats?: PartyStats;
  columns: Array<Column<Party>>;
  onEdit: (party: Party) => void;
  currencyFilter?: PartyCurrencyFilter;
  onCurrencyFilterChange?: (currency: PartyCurrencyFilter) => void;
}

export const PartiesListView: React.FC<PartiesListViewProps> = ({
  partyType,
  parties = [],
  isLoading,
  stats,
  columns,
  onEdit,
  currencyFilter: controlledCurrencyFilter,
  onCurrencyFilterChange,
}) => {
  const [activeFilter, setActiveFilter] = useState<PartyListStatusFilter>('all');
  const [internalCurrencyFilter, setInternalCurrencyFilter] =
    useState<PartyCurrencyFilter>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const currencyFilter = controlledCurrencyFilter ?? internalCurrencyFilter;
  const setCurrencyFilter = onCurrencyFilterChange ?? setInternalCurrencyFilter;

  // Extract unique categories from parties
  const categories = useMemo(() => {
    const set = new Set<string>();
    parties.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [parties]);

  // Strict per-currency counts (always computed on full list so tabs show exact coverage)
  const currencyTabCounts = useMemo(() => {
    let sar = 0;
    let yer = 0;
    let mixed = 0;
    for (const p of parties) {
      if (Math.abs(getPartyCurrencyBalance(p, 'SAR')) > PARTY_BALANCE_EPSILON) sar += 1;
      if (Math.abs(getPartyCurrencyBalance(p, 'YER')) > PARTY_BALANCE_EPSILON) yer += 1;
      if (hasMultipleActiveCurrencies(p)) mixed += 1;
    }
    return { all: parties.length, sar, yer, mixed };
  }, [parties]);

  // Scope parties by currency + category first so status chip counts reflect the active currency!
  const currencyScopedParties = useMemo(() => {
    return filterPartiesStrict({
      parties,
      currencyFilter,
      statusFilter: 'all',
      selectedCategory,
    });
  }, [parties, currencyFilter, selectedCategory]);

  // Final filtered parties
  const filteredParties = useMemo(() => {
    return filterPartiesStrict({
      parties,
      currencyFilter,
      statusFilter: activeFilter,
      selectedCategory,
    });
  }, [parties, currencyFilter, activeFilter, selectedCategory]);

  // Status chip counts strictly scoped to active currency
  const counts = useMemo(() => {
    let debtors = 0;
    let creditors = 0;
    let mixed = 0;
    let settled = 0;
    let active = 0;
    let blocked = 0;

    for (const p of currencyScopedParties) {
      if ((p.status ?? 'active') === 'active') active += 1;
      else if (p.status === 'blocked') blocked += 1;

      const cls = classifyPartyBalance(p);
      if (cls === 'mixed_currency') mixed += 1;

      if (currencyFilter === 'SAR' || currencyFilter === 'YER') {
        const curBal = getPartyCurrencyBalance(p, currencyFilter);
        if (curBal > PARTY_BALANCE_EPSILON) debtors += 1;
        else if (curBal < -PARTY_BALANCE_EPSILON) creditors += 1;
        else settled += 1;
      } else {
        if (cls === 'debtor') debtors += 1;
        else if (cls === 'creditor') creditors += 1;
        else if (cls === 'settled') settled += 1;
      }
    }

    return {
      all: currencyScopedParties.length,
      debtors,
      creditors,
      mixed,
      settled,
      active,
      blocked,
    };
  }, [currencyScopedParties, currencyFilter]);

  const currencyTabs: Array<{
    id: PartyCurrencyFilter;
    label: string;
    count: number;
    tone: string;
  }> = [
    { id: 'ALL', label: 'جميع العملات', count: currencyTabCounts.all, tone: 'blue' },
    { id: 'SAR', label: 'ريال سعودي (SAR)', count: currencyTabCounts.sar, tone: 'emerald' },
    { id: 'YER', label: 'ريال يمني (YER)', count: currencyTabCounts.yer, tone: 'amber' },
    { id: 'MIXED', label: 'عملات متعددة (SAR + YER)', count: currencyTabCounts.mixed, tone: 'indigo' },
  ];

  const chips: Array<{ id: PartyListStatusFilter; label: string; count: number; color?: string }> = [
    { id: 'all', label: 'الكل', count: counts.all },
    {
      id: 'debtors',
      label:
        currencyFilter === 'SAR' || currencyFilter === 'YER'
          ? `عليهم مديونية (${currencyFilter})`
          : partyType === 'customer'
            ? 'عليهم مديونية'
            : 'مدينون لنا',
      count: counts.debtors,
      color: 'emerald',
    },
    {
      id: 'creditors',
      label:
        currencyFilter === 'SAR' || currencyFilter === 'YER'
          ? `لهم أرصدة دائنة (${currencyFilter})`
          : partyType === 'customer'
            ? 'لهم أرصدة دائنة'
            : 'مستحق للمورد',
      count: counts.creditors,
      color: 'amber',
    },
    ...(counts.mixed > 0
      ? [{ id: 'mixed' as const, label: 'متعاكس العملات', count: counts.mixed, color: 'amber' }]
      : []),
    { id: 'settled', label: 'رصيد مسوّى', count: counts.settled },
    { id: 'active', label: 'نشط', count: counts.active },
    { id: 'blocked', label: 'محظور', count: counts.blocked, color: 'rose' },
  ];

  const isFiltered =
    activeFilter !== 'all' || currencyFilter !== 'ALL' || selectedCategory !== 'all';

  const effectiveStats: PartyStats = useMemo(() => {
    if (!isFiltered && stats) return stats;
    return calculatePartyStats(filteredParties, partyType);
  }, [isFiltered, stats, filteredParties, partyType]);

  const handleResetAll = () => {
    setActiveFilter('all');
    setCurrencyFilter('ALL');
    setSelectedCategory('all');
  };

  return (
    <div className="animate-in fade-in space-y-1.5 duration-500">
      <PartiesStats
        stats={effectiveStats}
        type={partyType}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        activeCurrencyFilter={currencyFilter}
        onCurrencyFilterChange={setCurrencyFilter}
        isFiltered={isFiltered}
        onResetFilters={handleResetAll}
        showFilterControls={false}
      />

      {/* Dedicated Strict Per-Currency Tabs Strip */}
      <div
        data-testid="parties-currency-filter-bar"
        className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2 py-1 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="no-scrollbar flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto sm:w-auto sm:flex-wrap">
          <div className="flex shrink-0 items-center gap-1 px-1 text-[11px] font-black text-slate-600 dark:text-slate-300">
            <Coins size={13} className="text-amber-500" />
            <span className="hidden sm:inline">فصل حسب العملة:</span>
          </div>
          {currencyTabs.map(tab => {
            const isSelected = currencyFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCurrencyFilter(tab.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-black transition-all sm:text-xs',
                  isSelected
                    ? tab.id === 'YER'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : tab.id === 'SAR'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : tab.id === 'MIXED'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 font-mono text-[10px]',
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200/80 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <span className="hidden text-[10px] font-bold text-slate-400 md:inline">
          اضغط على أي رصيد SAR أو YER لفتح كشف حسابه بعملته مباشرة
        </span>
      </div>

      {/* Status & Category Filter Chips Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2 py-1 dark:border-slate-800 dark:bg-slate-900">
        <div className="no-scrollbar flex w-full flex-nowrap items-center gap-1 overflow-x-auto sm:w-auto sm:flex-wrap">
          {chips.map(chip => {
            const isSelected = activeFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setActiveFilter(chip.id);
                }}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all sm:text-xs',
                  isSelected
                    ? chip.id === 'mixed'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                )}
              >
                {chip.id === 'mixed' && <AlertTriangle size={11} />}
                <span>{chip.label}</span>
                <span
                  className={cn(
                    'py-0.2 rounded-full px-1.5 font-mono text-[10px]',
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200/80 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                  )}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Category Filter & Reset */}
        <div className="flex items-center gap-2">
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-slate-400" />
              <select
                value={selectedCategory}
                onChange={e => {
                  setSelectedCategory(e.target.value);
                }}
                className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 outline-none transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">جميع الفئات</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isFiltered && (
            <button
              type="button"
              onClick={handleResetAll}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              title="إلغاء التصفية"
            >
              <X size={12} />
              <span>إعادة ضبط</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-xl border border-gray-100 bg-[var(--app-surface)] shadow-sm dark:border-slate-800 md:min-h-[480px]">
        <ExcelTable
          columns={columns}
          data={filteredParties}
          colorTheme={partyType === 'customer' ? 'blue' : 'indigo'}
          isRTL={true}
          showSearch={false}
          isLoading={isLoading}
          onRowClick={row => {
            const store = useAccompanyingInfoStore.getState();
            if (store.isOpen) {
              store.setTarget({
                type: partyType === 'supplier' ? 'supplier' : 'customer',
                id: row.id,
                title: row.name,
              });
            }
          }}
          onRowDoubleClick={row => {
            onEdit(row);
          }}
        />
      </div>
    </div>
  );
};
/* eslint-enable max-lines-per-function, complexity */

export default PartiesListView;
