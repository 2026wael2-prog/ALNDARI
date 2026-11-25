import React from 'react';
import {
  Search,
  ChevronDown,
  GitBranch,
  Globe,
  PackageCheck,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { buildGoogleSearchUrl } from '../../../ai/automotiveCrossSell';

export interface BranchOption {
  id: string;
  name: string;
}

export interface ProductSelectionToolbarProps {
  onOpenAddProduct: () => void;
  localQuery: string;
  onQueryChange: (value: string) => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  showInStockOnly: boolean;
  onToggleInStockOnly: () => void;
  isManager: boolean;
  branchMenuRef: React.RefObject<HTMLDivElement | null>;
  showBranchMenu: boolean;
  onToggleBranchMenu: () => void;
  localBranchId: string | null;
  onSelectBranch: (branchId: string | null) => void;
  selectedBranchName: string | undefined;
  activeBranches: BranchOption[];
  columnSettingsSlot: React.ReactNode;
}

export const ProductSelectionToolbar: React.FC<ProductSelectionToolbarProps> = ({
  onOpenAddProduct,
  localQuery,
  onQueryChange,
  onSearchKeyDown,
  showInStockOnly,
  onToggleInStockOnly,
  isManager,
  branchMenuRef,
  showBranchMenu,
  onToggleBranchMenu,
  localBranchId,
  onSelectBranch,
  selectedBranchName,
  activeBranches,
  columnSettingsSlot,
}) => (
  <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-[var(--app-surface)] px-2.5 py-1.5 dark:border-slate-800 max-md:gap-1.5 max-md:p-1.5">
    <button
      type="button"
      onClick={onOpenAddProduct}
      className="flex items-center gap-1 rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 max-md:gap-1.5"
      title="إضافة منتج جديد دون مغادرة النافذة"
    >
      <Plus size={14} />
      منتج جديد
    </button>

    <div className="relative min-w-[200px] flex-1">
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
      <input
        autoFocus
        type="text"
        value={localQuery}
        onChange={e => onQueryChange(e.target.value)}
        onKeyDown={onSearchKeyDown}
        placeholder="ابحث بالاسم، رقم القطعة، الماركة..."
        className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-24 pr-9 text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800"
      />
      {localQuery.trim().length > 0 && (
        <a
          href={buildGoogleSearchUrl({ query: localQuery })}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute left-1.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-700/60 dark:bg-sky-900/40 dark:text-sky-300"
          title="البحث عن النص الحالي في جوجل"
        >
          <span>جوجل</span>
          <ExternalLink size={10} />
        </a>
      )}
    </div>

    <button
      type="button"
      onClick={onToggleInStockOnly}
      className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold transition-colors max-md:gap-1.5 ${
        showInStockOnly
          ? 'border-emerald-600 bg-emerald-500 text-white'
          : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-emerald-400 hover:text-emerald-600 dark:border-slate-700 dark:bg-slate-800'
      }`}
    >
      <PackageCheck size={14} />
      متوفر فقط
    </button>

    {isManager && (
      <div className="relative" ref={branchMenuRef}>
        <button
          type="button"
          onClick={onToggleBranchMenu}
          className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold transition-colors max-md:gap-1.5 ${
            localBranchId !== null
              ? 'border-indigo-600 bg-indigo-500 text-white'
              : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800'
          }`}
        >
          {localBranchId !== null ? <GitBranch size={14} /> : <Globe size={14} />}
          <span className="max-w-[100px] truncate">{selectedBranchName}</span>
          <ChevronDown
            size={11}
            className={`transition-transform ${showBranchMenu ? 'rotate-180' : ''}`}
          />
        </button>
        {showBranchMenu && (
          <div className="absolute right-0 top-full z-[200] mt-1 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onSelectBranch(null)}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-right text-xs font-semibold transition-colors max-md:gap-2 ${
                localBranchId === null
                  ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Globe size={13} /> جميع الفروع
            </button>
            {activeBranches.map(branch => (
              <button
                key={branch.id}
                type="button"
                onClick={() => onSelectBranch(branch.id)}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-right text-xs font-semibold transition-colors max-md:gap-2 ${
                  localBranchId === branch.id
                    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <GitBranch size={13} /> {branch.name}
              </button>
            ))}
          </div>
        )}
      </div>
    )}
    {columnSettingsSlot}
  </div>
);
