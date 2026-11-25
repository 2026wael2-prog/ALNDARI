import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '../../../core/utils';
import { useAuthStore } from '../../auth/store';
import { useBranchFilterStore } from '../../branches/store';
import { fetchInspectedEntity } from '../service';
import { useEntityInspectorStore } from '../store';
import type { InspectableEntityType } from '../types';
import { ENTITY_ICON_MAP, ENTITY_TYPE_LABEL, TONE_BADGE } from './inspectorMeta';

export interface EntityHoverCardProps {
  type: InspectableEntityType;
  id: string | null | undefined;
  label?: string | null | undefined;
  subType?: string | null | undefined;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  /** Hover delay in milliseconds before displaying the card. Default 300ms. */
  openDelay?: number;
}

interface CardPosition {
  top: number;
  left: number;
}

interface EntityHoverCardContentProps {
  type: InspectableEntityType;
  id: string;
  label?: string | null | undefined;
  subType?: string | null | undefined;
  position: CardPosition;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClose: () => void;
}

const EntityHoverCardContent: React.FC<EntityHoverCardContentProps> = ({
  type,
  id,
  label,
  subType,
  position,
  onMouseEnter,
  onMouseLeave,
  onClose,
}) => {
  const user = useAuthStore(s => s.user);
  const activeBranchId = useBranchFilterStore(s => s.activeBranchId);
  const companyId = user?.company_id || '';
  const canViewCost = user?.role !== 'cashier' && user?.role !== 'sales_rep';

  const { data, isLoading } = useQuery({
    queryKey: ['entity-inspector', type, id, subType, companyId, activeBranchId, canViewCost],
    queryFn: () =>
      fetchInspectedEntity(
        {
          type,
          id,
          label: label ?? undefined,
          subType: subType ?? undefined,
        },
        {
          companyId,
          branchId: activeBranchId,
          canViewCost,
        }
      ),
    staleTime: 60_000,
  });

  const handleOpenFullInspector = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      useEntityInspectorStore.getState().open({
        type,
        id,
        label: label ?? undefined,
        subType: subType ?? undefined,
      });
    },
    [id, label, onClose, subType, type]
  );

  const Icon = ENTITY_ICON_MAP[type];

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      data-testid="entity-hover-card"
      className={cn(
        'fixed z-[9999] w-[330px] rounded-xl border border-amber-900/30 bg-[#24150d] text-white shadow-2xl backdrop-blur-md transition-opacity duration-150',
        'dark:border-amber-700/30 dark:bg-[#190e09] dark:text-white',
        'font-sans text-xs leading-normal select-text animate-in fade-in zoom-in-95 duration-100'
      )}
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-amber-400">
            <Icon size={14} />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-amber-300">
              {ENTITY_TYPE_LABEL[type]}
            </span>
            <h4 className="truncate text-xs font-black text-white">
              {data?.title || label || '—'}
            </h4>
          </div>
        </div>

        {data?.badge && (
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-extrabold',
              TONE_BADGE[data.badge.tone]
            )}
          >
            {data.badge.label}
          </span>
        )}
      </div>

      {/* Content Body */}
      <div className="p-3">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center gap-2 text-white/70">
            <Loader2 size={16} className="animate-spin text-amber-400" />
            <span className="text-xs font-semibold">جارٍ جلب البيانات...</span>
          </div>
        ) : data ? (
          <div className="space-y-2.5">
            {/* Code / Part Number Subtitle */}
            {(data.code || data.subtitle) && (
              <div className="flex items-center justify-between rounded-md bg-white/5 px-2 py-1 text-[11px]">
                <span className="text-white/60">المرجع / الكود:</span>
                <span className="font-mono font-bold text-amber-200">
                  {data.code || data.subtitle}
                </span>
              </div>
            )}

            {/* Top KPIs Grid (Key stats like Stock, Price, Balance) */}
            {data.kpis && data.kpis.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5">
                {data.kpis.slice(0, 4).map((kpi, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col rounded-lg border border-white/10 bg-white/[0.04] p-1.5"
                  >
                    <span className="text-[10px] font-medium text-white/60">
                      {kpi.label}
                    </span>
                    <span className="truncate font-mono text-xs font-black text-white">
                      {kpi.value}
                    </span>
                    {kpi.subValue && (
                      <span className="text-[9px] text-white/50">{kpi.subValue}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Secondary Fields Preview */}
            {data.fields && data.fields.length > 0 && (
              <div className="space-y-1 border-t border-white/10 pt-1.5 text-[11px]">
                {data.fields.slice(0, 2).map((field, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2">
                    <span className="text-white/60">{field.label}:</span>
                    <span className="truncate font-semibold text-white/90">
                      {field.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-white/60">
            لا تتوفر تفاصيل إضافية لهذا السجل.
          </div>
        )}
      </div>

      {/* Footer with Action Button */}
      <div className="flex items-center justify-between border-t border-white/10 bg-white/5 px-3 py-1.5">
        <span className="text-[10px] text-white/50">معاينة ذكية فلاشية</span>
        <button
          type="button"
          onClick={handleOpenFullInspector}
          className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300 transition-colors hover:bg-amber-500 hover:text-black active:scale-95"
        >
          <span>استعلام شامل</span>
          <ExternalLink size={10} />
        </button>
      </div>
    </div>
  );
};

export const EntityHoverCard: React.FC<EntityHoverCardProps> = ({
  type,
  id,
  label,
  subType,
  children,
  disabled = false,
  className,
  openDelay = 300,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<CardPosition | null>(null);

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const cardWidth = 330;
    const cardHeight = 240;
    const margin = 10;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.left + rect.width / 2 - cardWidth / 2;
    if (left < margin) {
      left = margin;
    } else if (left + cardWidth > viewportWidth - margin) {
      left = viewportWidth - cardWidth - margin;
    }

    let top = rect.bottom + 6;
    if (top + cardHeight > viewportHeight - margin) {
      top = Math.max(margin, rect.top - cardHeight - 6);
    }

    return { top, left };
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (disabled || !id) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (!isOpen && !openTimerRef.current) {
      openTimerRef.current = setTimeout(() => {
        const pos = calculatePosition();
        if (pos) {
          setPosition(pos);
          setIsOpen(true);
        }
      }, openDelay);
    }
  }, [disabled, id, isOpen, openDelay, calculatePosition]);

  const handleMouseLeave = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }

    if (isOpen && !closeTimerRef.current) {
      closeTimerRef.current = setTimeout(() => {
        setIsOpen(false);
      }, 150);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn('inline-flex items-center', className)}
      >
        {children}
      </div>

      {isOpen &&
        Boolean(id) &&
        position &&
        typeof document !== 'undefined' &&
        createPortal(
          <EntityHoverCardContent
            type={type}
            id={id!}
            label={label}
            subType={subType}
            position={position}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClose={() => setIsOpen(false)}
          />,
          document.body
        )}
    </>
  );
};

EntityHoverCard.displayName = 'EntityHoverCard';
