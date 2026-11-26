import React from 'react';
import { ArrowRightLeft, ExternalLink, Plus, Search, Sparkles, Wrench } from 'lucide-react';
import type { Product } from '../../../inventory/types';
import type { AutomotiveRelationResult } from '../../../ai/automotiveCrossSell';
import { buildGoogleSearchUrl } from '../../../ai/automotiveCrossSell';
import { useFeedbackStore } from '../../../feedback/store';

interface RelatedProductsPanelProps {
  relation: AutomotiveRelationResult;
  relatedProducts: Product[];
  isLoading: boolean;
  mode: 'sale' | 'purchase' | 'quotation';
  onSelectProduct: (product: Product) => void;
  onRequestFromBranch: (product: Product) => void;
  onSearchChipClick: (term: string) => void;
}

interface CompactCompanionPillProps {
  prod: Product;
  mode: 'sale' | 'purchase' | 'quotation';
  onAdd: (prod: Product) => void;
  onRequestFromBranch: (prod: Product) => void;
}

/* eslint-disable max-lines-per-function -- compact inline pill showing companion product & 3 quick actions */
const CompactCompanionPill: React.FC<CompactCompanionPillProps> = ({
  prod,
  mode,
  onAdd,
  onRequestFromBranch,
}) => {
  const displayName = prod.name !== '' ? prod.name : prod.name_ar;
  const sellingPrice = prod.selling_price ?? 0;
  const price =
    mode === 'purchase' ? prod.cost_price : sellingPrice > 0 ? sellingPrice : prod.sale_price;
  const qty = prod.stock_quantity;
  const partSuffix =
    prod.part_number !== null && prod.part_number !== '' ? ` (${prod.part_number})` : '';

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-300/70 bg-white px-2 py-0.5 text-[11px] shadow-2xs transition-colors hover:border-amber-500 dark:border-slate-700 dark:bg-slate-800">
      <button
        type="button"
        onClick={() => {
          onAdd(prod);
        }}
        className="inline-flex items-center gap-1.5 text-right font-bold text-slate-800 hover:text-emerald-700 dark:text-slate-100 dark:hover:text-emerald-300"
        title={`إضافة فورية: ${displayName}${partSuffix}`}
      >
        <span className="flex h-4 w-4 items-center justify-center rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <Plus size={10} />
        </span>
        <span className="max-w-[165px] truncate">{displayName}</span>
        <span className="font-mono text-[10px] font-black text-emerald-700 dark:text-emerald-400">
          {price}
        </span>
        <span
          className={`rounded px-1 font-mono text-[10px] font-black ${
            qty > 0
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300'
          }`}
        >
          {qty}
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          onRequestFromBranch(prod);
        }}
        className="rounded p-0.5 text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
        title="طلب هذه القطعة من فرع آخر"
      >
        <ArrowRightLeft size={10} />
      </button>

      <a
        href={buildGoogleSearchUrl({
          name: displayName,
          partNumber: prod.part_number,
          brand: prod.brand,
        })}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded p-0.5 text-sky-600 transition-colors hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-900/40"
        title="البحث عن القطعة في جوجل"
      >
        <ExternalLink size={10} />
      </a>
    </div>
  );
};

/**
 * RelatedProductsPanel
 * ----------------------------------------------------------------------------
 * Ultra-compact single-row horizontal bar (~36px height) rendered cleanly above
 * PaginationBar ONLY when an explicit search query or selected product matches
 * a mechanical system. Zero bulky cards, zero layout jitter!
 */
/* eslint-disable max-lines-per-function -- sleek single-row companion bar with system badge, product pills & quick search chips */
export const RelatedProductsPanel: React.FC<RelatedProductsPanelProps> = ({
  relation,
  relatedProducts,
  isLoading,
  mode,
  onSelectProduct,
  onRequestFromBranch,
  onSearchChipClick,
}) => {
  const { showToast } = useFeedbackStore();

  const hasContent =
    relation.matchedSystems.length > 0 || relatedProducts.length > 0 || isLoading;

  if (!hasContent) return null;

  const vehicleBadge = relation.vehicleTokens.join(' ');

  const handleAddCompanion = (prod: Product): void => {
    if (mode === 'sale' && prod.stock_quantity <= 0) {
      const displayName = prod.name !== '' ? prod.name : prod.name_ar;
      showToast(`تنبيه: المنتج "${displayName}" رصيده 0 في هذا الفرع`, 'warning');
    }
    onSelectProduct(prod);
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-amber-300/80 bg-amber-50/75 px-2.5 py-1 dark:border-amber-800/50 dark:bg-slate-900/95">
      {/* Compact system + vehicle identifier */}
      <div className="flex shrink-0 items-center gap-1.5 border-l border-amber-300/60 pl-2 dark:border-slate-700">
        <Sparkles size={12} className="text-amber-500" />
        {relation.primarySystemLabel !== null ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-900 dark:text-amber-300">
            <Wrench size={10} />
            {relation.primarySystemLabel}
          </span>
        ) : (
          <span className="text-[10px] font-black text-amber-900 dark:text-amber-300">
            قطع مرتبطة
          </span>
        )}
        {vehicleBadge !== '' && (
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-extrabold text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">
            {vehicleBadge}
          </span>
        )}
      </div>

      {/* Single-line horizontal scrollable strip of compact product pills + search chips */}
      <div className="custom-scrollbar flex flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
        {isLoading && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            جاري المطابقة...
          </span>
        )}

        {relatedProducts.map(prod => (
          <CompactCompanionPill
            key={prod.id}
            prod={prod}
            mode={mode}
            onAdd={handleAddCompanion}
            onRequestFromBranch={onRequestFromBranch}
          />
        ))}

        {relation.companionChips.slice(0, 6).map(chip => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              onSearchChipClick(vehicleBadge !== '' ? `${chip} ${vehicleBadge}` : chip);
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/70 bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-700 transition-colors hover:border-amber-500 hover:bg-amber-100 hover:text-amber-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-amber-500"
            title={`بحث فوري عن: ${chip}`}
          >
            <Search size={9} className="text-amber-600" />
            <span>{chip}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
