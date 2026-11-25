import React from 'react';
import type { Product } from '../types';
import { formatCurrency, formatNumberDisplay, cn } from '../../../core/utils';
import { Hash, MapPin, Box, Tag, Factory, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { EntityInfoDot } from '../../entity-inspector';

interface Props {
  product: Product;
  onClick: (product: Product) => void;
}

const ProductMicroCard: React.FC<Props> = ({ product, onClick }) => {
  const isLow = product.isLowStock || product.stock_quantity <= (product.min_stock_level || 0);
  const price = product.sale_price ?? product.selling_price ?? 0;
  const partNumber =
    product.part_number && product.part_number !== '---' ? product.part_number : null;
  const sku = product.sku && product.sku !== '---' ? product.sku : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        onClick(product);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(product);
        }
      }}
      className={cn(
        'group relative flex min-w-0 cursor-pointer flex-col justify-between overflow-hidden rounded-lg border bg-[var(--app-surface)] shadow-xs transition-all duration-200 hover:shadow-md active:scale-[0.98] sm:rounded-xl',
        isLow
          ? 'border-amber-300/80 bg-amber-50/20 hover:border-amber-500 dark:border-amber-900/50 dark:bg-amber-950/15'
          : 'border-[var(--app-border)] hover:border-blue-500/60 hover:bg-blue-50/10'
      )}
    >
      {/* Top Compact Visual Header (Optimized for 3 cards per row on mobile) */}
      <div className="relative flex h-14 w-full shrink-0 items-center justify-center overflow-hidden border-b border-slate-100 bg-slate-50/90 dark:border-slate-800/80 dark:bg-slate-800/60 sm:h-16">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name_ar || product.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <Box size={18} className="text-slate-300 dark:text-slate-600 sm:h-5 sm:w-5" />
        )}

        {/* Top-Right Stock Status Pill */}
        <span
          className={cn(
            'absolute right-1 top-1 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-bold leading-none shadow-2xs sm:right-1.5 sm:top-1.5 sm:px-1.5',
            isLow
              ? 'bg-rose-500/90 text-white'
              : 'bg-emerald-500/90 text-white'
          )}
        >
          {isLow ? <AlertTriangle size={9} /> : <CheckCircle2 size={9} />}
          <span className="hidden sm:inline">{isLow ? 'منخفض' : 'متوفر'}</span>
        </span>

        {/* Top-Left Entity Inspector Dot */}
        <div
          className="absolute left-1 top-1 sm:left-1.5 sm:top-1.5"
          onClick={e => {
            e.stopPropagation();
          }}
        >
          <EntityInfoDot
            type="product"
            id={product.id}
            label={product.name_ar || product.name}
            size="xs"
          />
        </div>

        {/* Bottom-Right Brand Pill overlay if present */}
        {product.brand && (
          <span className="absolute bottom-1 right-1 inline-flex max-w-[85%] items-center gap-0.5 truncate rounded bg-white/90 px-1 py-0.5 text-[10px] font-bold leading-none text-blue-700 shadow-2xs dark:bg-slate-900/90 dark:text-blue-300">
            <Factory size={9} className="hidden shrink-0 sm:inline" />
            <span className="truncate">{product.brand}</span>
          </span>
        )}
      </div>

      {/* Main Body */}
      <div className="flex flex-1 flex-col justify-between gap-1 p-1.5 sm:gap-1.5 sm:p-2">
        <h3
          className="line-clamp-2 text-[11px] font-bold leading-snug text-slate-900 dark:text-white sm:text-xs"
          title={product.name_ar || product.name}
        >
          {product.name_ar || product.name}
        </h3>

        {/* Identifiers Row (Part Number / SKU / Location) */}
        {(partNumber || sku || product.location) && (
          <div className="flex flex-wrap items-center gap-1 font-mono text-[10px]">
            {partNumber && (
              <span className="inline-flex max-w-full items-center gap-0.5 truncate rounded bg-slate-100 px-1 py-0.5 font-bold leading-none text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <Tag size={9} className="hidden shrink-0 text-slate-400 sm:inline" />
                <span className="truncate">{partNumber}</span>
              </span>
            )}
            {!partNumber && sku && (
              <span className="inline-flex max-w-full items-center gap-0.5 truncate rounded bg-slate-100 px-1 py-0.5 leading-none text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <Hash size={9} className="hidden shrink-0 text-slate-400 sm:inline" />
                <span className="truncate">{sku}</span>
              </span>
            )}
            {product.location && (
              <span className="mr-auto hidden items-center gap-0.5 font-sans text-[10px] text-slate-400 dark:text-slate-500 sm:inline-flex">
                <MapPin size={9} />
                <span className="truncate">{product.location}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom Strip: Price & Stock */}
      <div className="flex items-center justify-between gap-1 border-t border-slate-100 bg-slate-50/80 px-1.5 py-1 dark:border-slate-800/80 dark:bg-slate-900/50 sm:px-2 sm:py-1.5">
        <span
          dir="ltr"
          title={formatCurrency(price)}
          className="min-w-0 break-words font-mono text-[10.5px] font-black leading-tight text-blue-600 dark:text-blue-400 sm:text-xs"
        >
          {formatCurrency(price)}
        </span>

        <span
          dir="ltr"
          className={cn(
            'shrink-0 rounded px-1 py-0.5 font-mono text-[10px] font-black leading-none sm:px-1.5',
            isLow
              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          )}
        >
          {formatNumberDisplay(product.stock_quantity)}
        </span>
      </div>
    </div>
  );
};

export default ProductMicroCard;
