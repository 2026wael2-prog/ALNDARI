
import React from 'react';
import { Car } from 'lucide-react';
import { cn } from '../../core/utils';

export type PageLoaderVariant = 'default' | 'table' | 'grid' | 'form' | 'dashboard';

interface PageLoaderProps {
  variant?: PageLoaderVariant;
  className?: string;
}

const TableSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-1">
    <div className="h-10 bg-[var(--app-surface-hover)] rounded-t-lg" />
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="flex gap-3 p-3 border-b border-[var(--app-border)]">
        <div className="h-4 bg-[var(--app-surface-hover)] rounded w-8" />
        <div className="h-4 bg-[var(--app-surface-hover)] rounded flex-1" />
        <div className="h-4 bg-[var(--app-surface-hover)] rounded w-24" />
        <div className="h-4 bg-[var(--app-surface-hover)] rounded w-20" />
      </div>
    ))}
  </div>
);

const GridSkeleton: React.FC = () => (
  <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 animate-pulse">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="bg-[var(--app-surface)] rounded-xl p-2.5 sm:rounded-2xl sm:p-4 border border-[var(--app-border)]">
        <div className="h-20 sm:h-32 bg-[var(--app-surface-hover)] rounded-lg sm:rounded-xl mb-2 sm:mb-3" />
        <div className="h-3.5 bg-[var(--app-surface-hover)] rounded w-3/4 mb-1.5" />
        <div className="h-3 bg-[var(--app-surface-hover)] rounded w-1/2" />
      </div>
    ))}
  </div>
);

const FormSkeleton: React.FC = () => (
  <div className="space-y-4 sm:space-y-6 animate-pulse max-w-lg mx-auto">
    <div className="space-y-2">
      <div className="h-4 bg-[var(--app-surface-hover)] rounded w-24" />
      <div className="h-9 sm:h-10 bg-[var(--app-surface-hover)] rounded-lg" />
    </div>
    <div className="space-y-2">
      <div className="h-4 bg-[var(--app-surface-hover)] rounded w-32" />
      <div className="h-9 sm:h-10 bg-[var(--app-surface-hover)] rounded-lg" />
    </div>
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <div className="space-y-2">
        <div className="h-4 bg-[var(--app-surface-hover)] rounded w-16" />
        <div className="h-9 sm:h-10 bg-[var(--app-surface-hover)] rounded-lg" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-[var(--app-surface-hover)] rounded w-20" />
        <div className="h-9 sm:h-10 bg-[var(--app-surface-hover)] rounded-lg" />
      </div>
    </div>
    <div className="h-20 sm:h-24 bg-[var(--app-surface-hover)] rounded-lg" />
    <div className="h-10 sm:h-12 bg-[var(--app-surface-hover)] rounded-lg w-32 mt-4" />
  </div>
);

const DashboardSkeleton: React.FC = () => (
  <div className="space-y-3 sm:space-y-6 animate-pulse">
    <div className="grid grid-cols-4 gap-1.5 sm:gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-[var(--app-surface)] rounded-lg sm:rounded-2xl p-2 sm:p-5 border border-[var(--app-border)]">
          <div className="h-2.5 sm:h-4 bg-[var(--app-surface-hover)] rounded w-12 sm:w-16 mb-1.5 sm:mb-3" />
          <div className="h-4 sm:h-8 bg-[var(--app-surface-hover)] rounded w-full sm:w-24 mb-1 sm:mb-2" />
          <div className="hidden sm:block h-3 bg-[var(--app-surface-hover)] rounded w-20" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
      <div className="h-44 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 md:h-64 md:p-5">
        <div className="mb-3 h-4 w-32 rounded bg-[var(--app-surface-hover)] md:mb-4 md:h-5" />
        <div className="h-28 rounded-xl bg-[var(--app-surface-hover)] md:h-48" />
      </div>
      <div className="h-44 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 md:h-64 md:p-5">
        <div className="mb-3 h-4 w-28 rounded bg-[var(--app-surface-hover)] md:mb-4 md:h-5" />
        <div className="h-28 rounded-xl bg-[var(--app-surface-hover)] md:h-48" />
      </div>
    </div>
  </div>
);

const variantMap: Record<PageLoaderVariant, React.ReactNode> = {
  default: (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center bg-[var(--app-bg)] transition-colors md:min-h-[400px]">
      <div className="relative flex h-16 w-16 items-center justify-center md:h-24 md:w-24">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100 dark:border-blue-900/30"></div>
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-t-blue-600"></div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--app-surface)] shadow-inner md:h-16 md:w-16">
          <Car size={22} className="animate-pulse text-blue-600 md:h-7 md:w-7" />
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-[var(--app-text-secondary)] md:mt-6 md:text-sm">جاري تحميل البيانات...</p>
    </div>
  ),
  table: <div className="p-4"><TableSkeleton /></div>,
  grid: <div className="p-4"><GridSkeleton /></div>,
  form: <div className="p-4"><FormSkeleton /></div>,
  dashboard: <div className="p-4"><DashboardSkeleton /></div>,
};

const PageLoader: React.FC<PageLoaderProps> = ({ variant = 'default', className }) => {
  return (
    <div className={cn('bg-[var(--app-bg)] transition-colors', className)}>
      {variantMap[variant]}
    </div>
  );
};

export default PageLoader;

