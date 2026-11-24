import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../../core/utils';
import type { InspectorTarget } from '../types';
import { ENTITY_TYPE_LABEL } from './inspectorMeta';

interface InspectorBreadcrumbProps {
  stack: InspectorTarget[];
  onBack: () => void;
  onGoToIndex: (index: number) => void;
}

export const InspectorBreadcrumb: React.FC<InspectorBreadcrumbProps> = ({
  stack,
  onBack,
  onGoToIndex,
}) => {
  if (stack.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-xs">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 font-bold text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-hover)]"
      >
        <ArrowRight size={13} />
        <span>رجوع</span>
      </button>
      <span className="text-[var(--app-text-secondary)]">|</span>
      {stack.map((item, idx) => {
        const isLast = idx === stack.length - 1;
        return (
          <React.Fragment key={`${item.type}-${item.id}-${idx}`}>
            <button
              type="button"
              disabled={isLast}
              onClick={() => onGoToIndex(idx)}
              className={cn(
                'rounded px-2 py-0.5 font-bold transition-colors',
                isLast
                  ? 'bg-blue-600/15 text-blue-700 dark:text-blue-300'
                  : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]'
              )}
            >
              {item.label || ENTITY_TYPE_LABEL[item.type]}
            </button>
            {!isLast && <span className="text-[var(--app-text-secondary)]">/</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
};
