import React from 'react';
import { cn } from '../../../core/utils';
import { useEntityInspectorStore } from '../store';
import type { InspectableEntityType } from '../types';
import { EntityHoverCard } from './EntityHoverCard';

export interface EntityInfoDotProps {
  type: InspectableEntityType;
  id: string | null | undefined;
  label?: string | null | undefined;
  subType?: string | null | undefined;
  /** True when rendered inside the inspector modal itself so clicks push to the drill-down stack. */
  inInspector?: boolean;
  /** Disable hover preview card if needed. */
  disableHover?: boolean;
  /** Optional custom tooltip text. */
  title?: string;
  className?: string;
  size?: 'xs' | 'sm';
}

const DEFAULT_TITLES: Record<InspectableEntityType, string> = {
  product: 'استعلام فوري ومعاينة عند التمرير',
  party: 'استعلام فوري ومعاينة عند التمرير',
  invoice: 'استعلام فوري ومعاينة عند التمرير',
  bond: 'استعلام فوري ومعاينة عند التمرير',
  account: 'استعلام فوري ومعاينة عند التمرير',
};

/**
 * نقطة استعلام فورية خفيفة جداً، تدعم المعاينة السريعة عند التمرير (Hover Card)
 * وتفتح نافذة الاستعلام الشامل فور النقر عليها.
 */
export const EntityInfoDot: React.FC<EntityInfoDotProps> = React.memo(
  ({
    type,
    id,
    label,
    subType,
    inInspector = false,
    disableHover = false,
    title,
    className,
    size = 'sm',
  }) => {
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

    const dotButton = (
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
          'border-amber-600/40 bg-amber-500/15 text-amber-300 hover:scale-110 hover:border-amber-500 hover:bg-amber-500 hover:text-black',
          'dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500 dark:hover:text-black',
          'focus:outline-none focus:ring-2 focus:ring-amber-500/40 active:scale-95',
          size === 'xs' ? 'h-4 w-4 text-[10px]' : 'h-[18px] w-[18px] text-[10px]',
          className
        )}
      >
        i
      </button>
    );

    if (inInspector || disableHover) {
      return dotButton;
    }

    return (
      <EntityHoverCard type={type} id={id} label={label} subType={subType}>
        {dotButton}
      </EntityHoverCard>
    );
  }
);

EntityInfoDot.displayName = 'EntityInfoDot';
