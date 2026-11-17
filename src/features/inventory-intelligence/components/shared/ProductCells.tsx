import React from 'react';
import type { ProductIdentityProfile } from '../../types';
import { formatCurrency } from '../../../../core/utils';
import { QualityBadge } from './StatusBadges';

export const GRID_TABLE_CLASS =
  'w-full border-collapse text-right text-xs [&_th]:border [&_th]:border-[var(--app-border)] [&_td]:border [&_td]:border-[var(--app-border)]';

export const ProductIdentityCell: React.FC<{
  name: string;
  partNumber: string;
  sku?: string;
  brand: string;
  originTag?: string;
  qualityGrade?: ProductIdentityProfile['qualityGrade'];
  categoryName?: string;
  partType?: string | undefined;
  size?: string | undefined;
  alternativeNumbers?: string[];
}> = ({
  name,
  partNumber,
  sku,
  brand,
  originTag,
  qualityGrade,
  categoryName,
  partType,
  size,
  alternativeNumbers,
}) => (
  <div className="space-y-1">
    <div className="font-bold leading-snug text-[var(--app-text)]">{name}</div>
    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--app-text-secondary)]">
      <span dir="ltr" className="rounded bg-[var(--app-bg)] px-1.5 py-0.5 font-mono font-semibold text-[var(--app-text)]">
        P/N: {partNumber || '—'}
      </span>
      {partType && (
        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-bold text-blue-700 dark:text-blue-300">
          {partType}
        </span>
      )}
      {size && size !== '—' && (
        <span dir="ltr" className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono font-bold text-amber-700 dark:text-amber-300">
          {size}
        </span>
      )}
      {sku && sku !== '—' && (
        <span dir="ltr" className="font-mono">
          SKU: {sku}
        </span>
      )}
      {alternativeNumbers && alternativeNumbers.length > 0 && (
        <span dir="ltr" className="font-mono text-blue-600 dark:text-blue-400">
          Alt: {alternativeNumbers.slice(0, 2).join(', ')}
        </span>
      )}
    </div>
    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
      <span className="font-bold text-indigo-600 dark:text-indigo-400">
        الشركة الصانعة: {brand || 'غير محدد'}
      </span>
      {originTag && originTag !== 'غير محدد' && (
        <span className="text-[var(--app-text-secondary)]">({originTag})</span>
      )}
      {qualityGrade && <QualityBadge grade={qualityGrade} />}
      {categoryName && categoryName !== 'عام' && (
        <span className="text-[var(--app-text-secondary)]">• {categoryName}</span>
      )}
    </div>
  </div>
);

export const LastSupplierCell: React.FC<{
  supplier?: {
    supplierName: string;
    lastUnitPrice: number;
    lastPurchaseDate: string | null;
  } | null;
}> = ({ supplier }) => {
  if (!supplier) {
    return <span className="text-[11px] text-[var(--app-text-secondary)]">لا يوجد سجل مورد</span>;
  }
  return (
    <div className="space-y-0.5">
      <div className="font-bold text-[var(--app-text)]">{supplier.supplierName}</div>
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[var(--app-text-secondary)]">
        <span dir="ltr" className="font-semibold text-emerald-600 dark:text-emerald-400">
          {formatCurrency(supplier.lastUnitPrice)}
        </span>
        {supplier.lastPurchaseDate && <span>• {supplier.lastPurchaseDate}</span>}
      </div>
    </div>
  );
};
