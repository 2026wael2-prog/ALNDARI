import React from 'react';
import { Check, Copy, Pencil, RotateCcw } from 'lucide-react';
import { cn } from '../../../core/utils';
import type { InspectedEntityData, InspectorRowReturnAction } from '../types';
import { ENTITY_TYPE_LABEL, TONE_BADGE, TONE_TEXT } from './inspectorMeta';

interface InspectorHeaderCardProps {
  data: InspectedEntityData;
  copiedKey: string | null;
  canEditProduct: boolean;
  onCopy: (key: string, value: string) => void;
  onEditProduct: () => void;
  onOpenReturn: (action: InspectorRowReturnAction) => void;
}

export const InspectorHeaderCard: React.FC<InspectorHeaderCardProps> = ({
  data,
  copiedKey,
  canEditProduct,
  onCopy,
  onEditProduct,
  onOpenReturn,
}) => (
  <div className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
    <div
      data-inspector-subheader="true"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] bg-[var(--app-bg)] px-3.5 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-0.5 text-[11px] font-black text-[var(--app-text)]">
          {ENTITY_TYPE_LABEL[data.type]}
        </span>
        {data.code && (
          <button
            type="button"
            onClick={() => onCopy('header-code', data.code!)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-700 hover:border-indigo-500 dark:text-indigo-300"
            title="نسخ الرمز"
          >
            <span>{data.code}</span>
            {copiedKey === 'header-code' ? (
              <Check size={11} className="text-emerald-600" />
            ) : (
              <Copy size={11} className="opacity-70" />
            )}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {data.badge && (
          <span
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-black',
              TONE_BADGE[data.badge.tone]
            )}
          >
            {data.badge.label}
          </span>
        )}
        {data.type === 'product' && data.product && canEditProduct && (
          <button
            type="button"
            onClick={onEditProduct}
            className="inline-flex items-center gap-1 rounded-lg border border-blue-500/35 bg-blue-500/15 px-2.5 py-1 text-[11px] font-black text-blue-700 transition-colors hover:bg-blue-600 hover:text-white dark:text-blue-300 dark:hover:bg-blue-600 dark:hover:text-white"
            title="تعديل بيانات المنتج"
          >
            <Pencil size={12} />
            <span>تعديل المنتج</span>
          </button>
        )}
        {data.returnContext && (
          <button
            type="button"
            onClick={() => {
              const ctx = data.returnContext!;
              onOpenReturn({
                returnType: ctx.returnType,
                invoiceId: ctx.invoiceId || '',
                ...(ctx.productId ? { productId: ctx.productId } : {}),
                ...(ctx.partyId ? { partyId: ctx.partyId } : {}),
                ...(ctx.partyName ? { partyName: ctx.partyName } : {}),
              });
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/35 bg-rose-500/15 px-2.5 py-1 text-[11px] font-black text-rose-700 transition-colors hover:bg-rose-600 hover:text-white dark:text-rose-300 dark:hover:bg-rose-600 dark:hover:text-white"
          >
            <RotateCcw size={12} />
            <span>
              {data.type === 'product'
                ? 'إرجاع المنتج'
                : data.type === 'invoice'
                  ? 'إرجاع من الفاتورة'
                  : 'إنشاء مرتجع'}
            </span>
          </button>
        )}
      </div>
    </div>

    <div className="grid grid-cols-2 divide-x divide-x-reverse divide-[var(--app-border)] sm:grid-cols-4">
      {data.kpis.map((kpi, idx) => (
        <div
          key={idx}
          className="flex flex-col justify-between border-b border-[var(--app-border)] p-3 sm:border-b-0"
        >
          <span className="text-[11px] font-bold text-[var(--app-text-secondary)]">
            {kpi.label}
          </span>
          <span
            className={cn(
              'mt-1 font-mono text-sm font-black tabular-nums md:text-base',
              TONE_TEXT[kpi.tone ?? 'default']
            )}
            dir="ltr"
          >
            {kpi.value}
          </span>
          {kpi.subValue && (
            <span className="mt-0.5 truncate text-[10px] font-semibold text-[var(--app-text-secondary)]">
              {kpi.subValue}
            </span>
          )}
        </div>
      ))}
    </div>
  </div>
);
