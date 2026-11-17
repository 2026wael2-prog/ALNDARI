import React from 'react';
import { Layers, Search } from 'lucide-react';
import { cn } from '../../../core/utils';
import type { FilterStatus } from '../hooks/usePartyInvoicesFilter';

interface PartyInvoicesToolbarProps {
  headerTitle: string;
  count: number;
  statusFilter: FilterStatus;
  onStatusFilterChange: (status: FilterStatus) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

const FILTER_TABS: ReadonlyArray<{
  id: FilterStatus;
  label: string;
  activeClass: string;
}> = [
  {
    id: 'all',
    label: 'الكل',
    activeClass: 'bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
  },
  {
    id: 'partial',
    label: 'مسدد جزئياً',
    activeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  {
    id: 'unpaid',
    label: 'غير مسدد',
    activeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  },
];

export const PartyInvoicesToolbar: React.FC<PartyInvoicesToolbarProps> = ({
  headerTitle,
  count,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchQueryChange,
}) => (
  <div className="flex flex-col gap-2.5 border-b border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-850 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-black text-white shadow-sm">
        <Layers size={13} />
        <span>{headerTitle}</span>
        <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
          {count}
        </span>
      </div>

      <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-[10px] font-bold dark:border-slate-700 dark:bg-slate-800">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              onStatusFilterChange(tab.id);
            }}
            className={cn(
              'rounded px-2 py-0.5 transition-colors',
              statusFilter === tab.id
                ? tab.activeClass
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>

    <div className="relative w-full sm:w-60">
      <input
        type="text"
        value={searchQuery}
        onChange={e => {
          onSearchQueryChange(e.target.value);
        }}
        placeholder="بحث برقم الفاتورة، القطعة، المبلغ..."
        className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs font-bold text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500"
      />
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
    </div>
  </div>
);
