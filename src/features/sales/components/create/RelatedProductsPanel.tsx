import React, { useState } from 'react';
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Plus,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { Product } from '../../../inventory/types';
import type { AutomotiveRelationResult } from '../../../ai/automotiveCrossSell';
import { buildGoogleSearchUrl } from '../../../ai/automotiveCrossSell';
import { useFeedbackStore } from '../../../feedback/store';
import { EntityInfoDot } from '../../../entity-inspector';

interface RelatedProductsPanelProps {
  relation: AutomotiveRelationResult;
  relatedProducts: Product[];
  isLoading: boolean;
  mode: 'sale' | 'purchase' | 'quotation';
  onSelectProduct: (product: Product) => void;
  onRequestFromBranch: (product: Product) => void;
  onSearchChipClick: (term: string) => void;
}

interface RelatedProductCardProps {
  prod: Product;
  mode: 'sale' | 'purchase' | 'quotation';
  onAdd: (prod: Product) => void;
  onRequestFromBranch: (prod: Product) => void;
}

/* eslint-disable max-lines-per-function -- compact card component displaying companion product details & 3 action buttons */
const RelatedProductCard: React.FC<RelatedProductCardProps> = ({
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
  const partLabel =
    prod.part_number !== null && prod.part_number !== ''
      ? prod.part_number
      : prod.sku !== ''
        ? prod.sku
        : '---';

  return (
    <div className="flex min-w-[220px] max-w-[250px] shrink-0 flex-col justify-between gap-1.5 rounded-lg border border-amber-200/80 bg-white p-2 shadow-sm transition-all hover:border-amber-400 hover:shadow dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <EntityInfoDot type="product" id={prod.id} label={displayName} size="sm" />
          <span
            className="truncate text-xs font-extrabold text-slate-900 dark:text-white"
            title={displayName}
          >
            {displayName}
          </span>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-black ${
            qty > 0
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300'
          }`}
        >
          {qty}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 dark:text-slate-400">
        <span className="truncate font-mono" dir="ltr">
          {partLabel}
        </span>
        <span className="shrink-0 font-mono text-xs font-black text-emerald-600 dark:text-emerald-400">
          {price}
        </span>
      </div>

      <div className="flex items-center justify-between gap-1 border-t border-gray-100 pt-1.5 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            onAdd(prod);
          }}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white transition-colors hover:bg-emerald-700"
          title="إضافة هذه القطعة المرتبطة للفاتورة"
        >
          <Plus size={11} />
          <span>إضافة</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onRequestFromBranch(prod);
          }}
          className="inline-flex items-center justify-center rounded border border-indigo-200 bg-indigo-50 p-1 text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-700/60 dark:bg-indigo-900/30 dark:text-indigo-300"
          title="طلب هذه القطعة من فرع آخر"
        >
          <ArrowRightLeft size={12} />
        </button>

        <a
          href={buildGoogleSearchUrl({
            name: displayName,
            partNumber: prod.part_number,
            brand: prod.brand,
          })}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded border border-sky-200 bg-sky-50 p-1 text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-700/60 dark:bg-sky-900/30 dark:text-sky-300"
          title="البحث عن القطعة في جوجل"
        >
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
};

/**
 * RelatedProductsPanel
 * ----------------------------------------------------------------------------
 * Collapsible smart companion-parts bar rendered at the bottom of the Advanced
 * Product Search modal. Displays mechanical-system companion chips (e.g.
 * ربلات عكس، ركب ذراع، ربلات شريم، صليب عكس داخلي) and real matched inventory
 * products that a customer buying the searched part is likely to need next.
 */
/* eslint-disable max-lines-per-function, complexity -- panel renders system badges, quick chips, and horizontal card strip */
export const RelatedProductsPanel: React.FC<RelatedProductsPanelProps> = ({
  relation,
  relatedProducts,
  isLoading,
  mode,
  onSelectProduct,
  onRequestFromBranch,
  onSearchChipClick,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
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
    <div className="border-t-2 border-amber-300/80 bg-gradient-to-b from-amber-50/90 to-white dark:border-amber-700/60 dark:from-slate-900 dark:to-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-black text-amber-800 dark:text-amber-300">
            <Sparkles size={13} className="text-amber-500" />
            <span>قطع مرتبطة ومكملة مقترحة</span>
          </span>

          {relation.primarySystemLabel !== null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-100/90 px-2 py-0.5 text-[10px] font-extrabold text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-200">
              <Wrench size={10} />
              {relation.primarySystemLabel}
            </span>
          )}

          {vehicleBadge !== '' && (
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:border-indigo-700/60 dark:bg-indigo-900/40 dark:text-indigo-200">
              المركبة: {vehicleBadge}
            </span>
          )}

          {!isCollapsed && relation.companionChips.length > 0 && (
            <div className="hidden flex-wrap items-center gap-1 xl:flex">
              {relation.companionChips.slice(0, 6).map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    onSearchChipClick(vehicleBadge !== '' ? `${chip} ${vehicleBadge}` : chip);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold text-gray-700 transition-colors hover:border-amber-400 hover:bg-amber-50 hover:text-amber-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-amber-500"
                  title={`بحث فوري عن: ${chip}`}
                >
                  <Search size={9} className="opacity-60" />
                  <span>{chip}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setIsCollapsed(prev => !prev);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-white/80 px-2 py-0.5 text-[10px] font-bold text-amber-900 transition-colors hover:bg-amber-100 dark:border-slate-700 dark:bg-slate-800 dark:text-amber-200"
          aria-expanded={!isCollapsed}
        >
          <span>
            {isCollapsed
              ? `إظهار المقترحات (${String(relatedProducts.length)})`
              : `طي (${String(relatedProducts.length)})`}
          </span>
          {isCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="px-3 pb-2">
          {relation.companionChips.length > 0 && (
            <div className="mb-1.5 flex flex-wrap items-center gap-1 xl:hidden">
              {relation.companionChips.slice(0, 6).map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    onSearchChipClick(vehicleBadge !== '' ? `${chip} ${vehicleBadge}` : chip);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold text-gray-700 transition-colors hover:border-amber-400 hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Search size={9} className="opacity-60" />
                  <span>{chip}</span>
                </button>
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 py-2 text-[11px] font-bold text-amber-700/80 dark:text-amber-300/80">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              <span>جاري استخراج القطع المرتبطة من المخزون...</span>
            </div>
          ) : relatedProducts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-amber-200 bg-white/60 px-3 py-2 text-[11px] font-semibold text-gray-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
              اضغط على أي قطعة مقترحة بالأعلى للبحث عنها مباشرة في المخزون أو في جوجل.
            </div>
          ) : (
            <div className="custom-scrollbar flex gap-2 overflow-x-auto pb-1">
              {relatedProducts.map(prod => (
                <RelatedProductCard
                  key={prod.id}
                  prod={prod}
                  mode={mode}
                  onAdd={handleAddCompanion}
                  onRequestFromBranch={onRequestFromBranch}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
