import React from 'react';
import { useParties } from '../hooks';
import { Users, UserCheck, Crown } from 'lucide-react';

interface CustomerSegmentationProps {
  companyId?: string;
}

export const CustomerSegmentation: React.FC<CustomerSegmentationProps> = () => {
  const { data: customers, isLoading } = useParties('customer');

  if (isLoading) {
    return <div className="h-28 animate-pulse rounded-xl bg-[var(--app-surface)]" />;
  }

  const totalCustomers = customers?.length || 0;
  const activeCustomers = customers?.filter(c => (c.balance || 0) > 0).length || 0;
  const vipCustomers = customers?.filter(c => (c.balance || 0) > 10000).length || 0;

  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 transition-colors">
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-lg bg-[var(--app-surface-hover)] p-1.5 text-[var(--accent)]">
          <Users size={16} />
        </div>
        <h3 className="text-xs font-bold text-[var(--app-text)]">تصنيف العملاء</h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] p-2.5 text-center">
          <div className="font-mono text-lg font-bold leading-tight text-[var(--app-text)]">
            {totalCustomers}
          </div>
          <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-[var(--app-text-secondary)]">
            <Users size={10} />
            إجمالي
          </div>
        </div>
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] p-2.5 text-center">
          <div className="font-mono text-lg font-bold leading-tight text-emerald-600 dark:text-emerald-400">
            {activeCustomers}
          </div>
          <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-[var(--app-text-secondary)]">
            <UserCheck size={10} />
            نشطون
          </div>
        </div>
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] p-2.5 text-center">
          <div className="font-mono text-lg font-bold leading-tight text-[var(--accent)]">
            {vipCustomers}
          </div>
          <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-[var(--app-text-secondary)]">
            <Crown size={10} />
            مميزون
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerSegmentation;
