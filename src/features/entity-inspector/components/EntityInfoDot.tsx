import React from 'react';
import { cn } from '../../../core/utils';
import { useEntityInspectorStore } from '../store';
import type { InspectableEntityType } from '../types';

export interface EntityInfoDotProps {
  type: InspectableEntityType;
  id: string | null | undefined;
  label?: string | null | undefined;
  subType?: string | null | undefined;
  /** True when rendered inside the inspector modal itself so clicks push to the drill-down stack. */
  inInspector?: boolean;
  /** Optional custom tooltip text. */
  title?: string;
  className?: string;
  size?: 'xs' | 'sm';
}

const DEFAULT_TITLES: Record<InspectableEntityType, string> = {
  product: 'استعلام فوري عن كامل بيانات وسجل المنتج',
  party: 'استعلام فوري عن كامل بيانات وكشف حساب الطرف',
  invoice: 'استعلام فوري عن كامل بيانات وأصناف وقيود الفاتورة',
  bond: 'استعلام فوري عن كامل بيانات وقيود السند',
  account: 'استعلام فوري عن كامل بيانات وحركات الحساب',
};

/**
 * نقطة استعلام فورية خفيفة جداً (Zero Subscriptions / Zero Fetch until clicked).
 * تُستدعى عبر `useEntityInspectorStore.getState()` مباشرة داخل `onClick` لضمان
 * عدم حدوث أي إعادة تصيير (re-render) للجداول أو تأثير على سرعة التطبيق.
 */
export const EntityInfoDot: React.FC<EntityInfoDotProps> = React.memo(
  ({ type, id, label, subType, inInspector = false, title, className, size = 'sm' }) => {
    if (!id) return null;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const target = {
        type,
        id,
        label: label ?? undefined,
        subType: subType ?? undefined,
      };
      const store = useEntityInspectorStore.getState();
      if (inInspector) {
        store.drillDown(target);
      } else {
        store.open(target);
      }
    };

    const resolvedTitle = title || DEFAULT_TITLES[type];

    return (
      <button
        type="button"
        onClick={handleClick}
        onMouseDown={e => e.stopPropagation()}
        onDoubleClick={e => {
          e.preventDefault();
          e.stopPropagation();
        }}
        title={resolvedTitle}
        aria-label={resolvedTitle}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full border font-mono font-black leading-none transition-all duration-150',
          'border-blue-500/45 bg-blue-500/12 text-blue-700 hover:scale-110 hover:border-blue-600 hover:bg-blue-600 hover:text-white',
          'dark:border-blue-400/45 dark:bg-blue-400/15 dark:text-blue-300 dark:hover:bg-blue-500 dark:hover:text-white',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-95',
          size === 'xs' ? 'h-4 w-4 text-[9px]' : 'h-[18px] w-[18px] text-[10px]',
          className
        )}
      >
        i
      </button>
    );
  }
);

EntityInfoDot.displayName = 'EntityInfoDot';
