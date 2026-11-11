import React from 'react';
import { FileText, ArrowUpRight, ArrowDownLeft, Clock, CheckCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { salesQuotationsApi } from '../../sales/api/quotationsApi';
import { purchaseQuotationsApi } from '../../purchases/api/quotationsApi';
import { useAuthStore } from '../../auth/store';

const QuotationSummaryWidget: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const companyId = user?.company_id;

  const { data: salesQuots, isLoading: salesLoading } = useQuery({
    queryKey: ['sales_quotations_summary', companyId],
    queryFn: () =>
      companyId
        ? salesQuotationsApi.getQuotations(companyId)
        : Promise.resolve({ data: [], error: null }),
    enabled: !!companyId,
  });

  const { data: purchaseQuots, isLoading: purchaseLoading } = useQuery<{
    data: Array<Record<string, unknown>>;
    error: unknown;
  }>({
    queryKey: ['purchase_quotations_summary', companyId],
    queryFn: () =>
      companyId
        ? (purchaseQuotationsApi.getQuotations(companyId) as unknown as Promise<{
            data: Array<Record<string, unknown>>;
            error: unknown;
          }>)
        : Promise.resolve({ data: [], error: null }),
    enabled: !!companyId,
  });

  const salesStats = React.useMemo(() => {
    const data = (salesQuots?.data || []) as Array<{ status?: string }>;
    return {
      pending: data.filter(
        q => typeof q.status === 'string' && ['draft', 'sent'].includes(q.status)
      ).length,
      accepted: data.filter(q => q.status === 'accepted').length,
    };
  }, [salesQuots]);

  const purchaseStats = React.useMemo(() => {
    const data = (purchaseQuots?.data || []) as Array<{ status?: string }>;
    return {
      pending: data.filter(
        q => typeof q.status === 'string' && ['draft', 'sent'].includes(q.status)
      ).length,
    };
  }, [purchaseQuots]);

  const lastUpdated = React.useMemo(() => {
    const timestamps = [
      ...((salesQuots?.data as unknown as Array<Record<string, unknown>>) || []),
      ...((purchaseQuots?.data as unknown as Array<Record<string, unknown>>) || []),
    ]
      .map(q => {
        if (typeof q.updated_at === 'string' && q.updated_at) return q.updated_at;
        if (typeof q.created_at === 'string' && q.created_at) return q.created_at;
        return '';
      })
      .filter(Boolean)
      .sort()
      .reverse();
    return timestamps.length > 0 ? new Date(timestamps[0]) : null;
  }, [salesQuots, purchaseQuots]);

  const isLoading = salesLoading || purchaseLoading;

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
        <div className="mb-3 h-5 w-28 rounded bg-[var(--app-surface-hover)]"></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 rounded-lg bg-[var(--app-surface-hover)]"></div>
          <div className="h-16 rounded-lg bg-[var(--app-surface-hover)]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 transition-colors">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-[var(--app-surface-hover)] p-2 text-[var(--accent)]">
            <FileText size={16} />
          </div>
          <h3 className="text-xs font-bold text-[var(--app-text)]">عروض الأسعار</h3>
        </div>
        <button
          type="button"
          onClick={() => {
            navigate('/sales');
          }}
          className="text-[11px] font-bold text-[var(--accent)] hover:opacity-80 transition-opacity"
        >
          عرض الكل
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Sales Quotations */}
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium text-[var(--app-text-secondary)]">
              عروض المبيعات
            </span>
            <ArrowUpRight size={12} className="text-blue-500" />
          </div>
          <div className="flex items-end gap-2">
            <span className="font-mono text-lg font-bold leading-none text-[var(--app-text)]">
              {salesStats.pending + salesStats.accepted}
            </span>
            {salesStats.accepted > 0 && (
              <span className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                <CheckCircle size={9} /> {salesStats.accepted} مقبول
              </span>
            )}
          </div>
        </div>

        {/* Purchase Quotations */}
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium text-[var(--app-text-secondary)]">
              عروض المشتريات
            </span>
            <ArrowDownLeft size={12} className="text-[var(--accent)]" />
          </div>
          <div className="flex items-end gap-2">
            <span className="font-mono text-lg font-bold leading-none text-[var(--app-text)]">
              {purchaseStats.pending}
            </span>
            <span className="rounded px-1.5 py-0.5 text-[10px] text-[var(--app-text-secondary)] bg-[var(--app-surface)]">
              قيد التفاوض
            </span>
          </div>
        </div>
      </div>

      {lastUpdated && (
        <div className="mt-3 border-t border-[var(--app-border)] pt-2.5">
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--app-text-secondary)]">
            <Clock size={11} />
            <span>
              آخر تحديث:{' '}
              {lastUpdated.toLocaleTimeString('ar-SA-u-nu-latn', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuotationSummaryWidget;
