import React from 'react';
import type {
  DemandPattern,
  MovementClass,
  ProductIdentityProfile,
  UrgencyLevel,
} from '../../types';
import { cn } from '../../../../core/utils';

const URGENCY_STYLES: Record<UrgencyLevel, { label: string; cls: string }> = {
  critical: {
    label: 'حرج',
    cls: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
  },
  high: {
    label: 'عالي',
    cls: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  },
  medium: {
    label: 'متوسط',
    cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
  },
  low: {
    label: 'منخفض',
    cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
};

export const UrgencyBadge: React.FC<{ level: UrgencyLevel }> = ({ level }) => {
  const cfg = URGENCY_STYLES[level] ?? URGENCY_STYLES.medium;
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold', cfg.cls)}>
      {cfg.label}
    </span>
  );
};

const PATTERN_LABELS: Record<DemandPattern, { label: string; cls: string }> = {
  smooth: { label: 'مستقر', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  growing: { label: 'متنامٍ', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  declining: { label: 'متراجع', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  seasonal: { label: 'موسمي', cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  intermittent: { label: 'متقطع', cls: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' },
  erratic_spike: { label: 'طفرة استثنائية', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  new_or_sparse: { label: 'بيانات محدودة', cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
};

export const PatternBadge: React.FC<{ pattern: DemandPattern }> = ({ pattern }) => {
  const cfg = PATTERN_LABELS[pattern] ?? PATTERN_LABELS.smooth;
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold', cfg.cls)}>
      {cfg.label}
    </span>
  );
};

const MOVEMENT_LABELS: Record<MovementClass, { label: string; cls: string }> = {
  fast_moving: { label: 'سريع الحركة', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  medium_moving: { label: 'متوسط الحركة', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  slow_moving: { label: 'بطيء الحركة', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  dead_stock: { label: 'راكد', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  excess_stock: { label: 'مخزون فائض', cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  stockout_risk: { label: 'خطر نفاد', cls: 'bg-red-500/15 text-red-700 dark:text-red-300' },
  newly_stocked: { label: 'مورد حديثاً', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
};

export const MovementBadge: React.FC<{ movement: MovementClass }> = ({ movement }) => {
  const cfg = MOVEMENT_LABELS[movement] ?? MOVEMENT_LABELS.medium_moving;
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold', cfg.cls)}>
      {cfg.label}
    </span>
  );
};

const GRADE_LABELS: Record<ProductIdentityProfile['qualityGrade'], string> = {
  genuine_oem: 'أصلي / OEM',
  japanese_aftermarket: 'ياباني',
  korean_aftermarket: 'كوري',
  thai_aftermarket: 'تايلندي',
  chinese_commercial: 'صيني / تجاري',
  other_aftermarket: 'بديل آخر',
};

export const QualityBadge: React.FC<{ grade: ProductIdentityProfile['qualityGrade'] }> = ({
  grade,
}) => (
  <span className="inline-flex items-center rounded border border-[var(--app-border)] bg-[var(--app-surface-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-text-secondary)]">
    {GRADE_LABELS[grade] ?? 'قياسي'}
  </span>
);

export const ConfidenceMeter: React.FC<{ score: number }> = ({ score }) => {
  const clamped = Math.max(0, Math.min(100, score));
  const barColor =
    clamped >= 75 ? 'bg-emerald-500' : clamped >= 50 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={cn('h-full rounded-full', barColor)} style={{ width: `${clamped}%` }} />
      </div>
      <span dir="ltr" className="font-mono text-[10px] font-bold text-[var(--app-text-secondary)]">
        {clamped.toFixed(0)}%
      </span>
    </div>
  );
};
