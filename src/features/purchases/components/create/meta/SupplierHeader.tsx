import React from 'react';
import { Search, User, X } from 'lucide-react';
import type { SupplierRef } from '../../../store';
import type { Party } from '../../../../parties/types';

export interface SupplierHeaderProps {
  supplier: SupplierRef | null;
  query: string;
  isOpen: boolean;
  suppliers: Party[];
  setSupplier: (supplier: SupplierRef | null) => void;
  setQuery: (query: string) => void;
  setIsOpen: (open: boolean) => void;
}

export const SupplierHeader: React.FC<SupplierHeaderProps> = ({
  supplier,
  query,
  isOpen,
  suppliers,
  setSupplier,
  setQuery,
  setIsOpen,
}) => (
  <div className="relative border-b border-blue-100/70 dark:border-slate-800">
    {supplier ? (
      <div className="flex items-center justify-between bg-blue-600 px-3 py-1.5 text-white max-md:px-2 max-md:py-1">
        <div className="flex min-w-0 items-center gap-2">
          <User size={13} className="shrink-0 text-blue-200" />
          <span className="truncate text-xs font-bold max-md:text-[11px]">
            المورد: {supplier.name}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setSupplier(null);
          }}
          className="rounded p-1 text-blue-100 transition-colors hover:bg-white/20 hover:text-white"
          title="تغيير المورد"
        >
          <X size={13} />
        </button>
      </div>
    ) : (
      <div className="relative">
        <label htmlFor="purchase-supplier-search" className="sr-only">
          بحث عن المورد
        </label>
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400" size={14} />
        <input
          id="purchase-supplier-search"
          type="text"
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          placeholder="ابحث عن المورد بالاسم أو الهاتف..."
          className="w-full bg-white py-2 pl-3 pr-9 text-xs font-bold text-blue-900 outline-none placeholder:font-normal placeholder:text-slate-400 dark:bg-slate-900 dark:text-white max-md:py-1.5 max-md:text-[11px]"
        />
        {isOpen && query.length > 1 && (
          <div className="absolute top-full z-50 max-h-56 w-full overflow-y-auto border-2 border-blue-600 bg-[var(--app-surface)] shadow-2xl">
            {suppliers.map(item => (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  setSupplier(item);
                  setIsOpen(false);
                }}
                className="w-full border-b px-3 py-2 text-right text-xs font-bold text-slate-800 transition-colors hover:bg-blue-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-blue-900/30"
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
);
