import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, Plus, RefreshCw } from 'lucide-react';
import { salesQuotationsApi } from '@/features/sales/api/quotationsApi';
import { useAuthStore } from '@/features/auth/store';
import { normalizeSearch } from '@/core/utils';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';
import CreateQuotationModal from '@/features/sales/components/quotations/CreateQuotationModal';
import QuotationDetailsModal from '@/features/sales/components/quotations/QuotationDetailsModal';
import type { QuotationRowAction } from '@/features/sales/components/quotations/QuotationActionIcons';
import { computeQuotationStats } from './tab/quotationsTabHelpers';
import { QuotationsKpiBar } from './tab/QuotationsKpiBar';
import { QuotationsFilterBar, QuotationsTable } from './tab/QuotationsListSection';

interface Props {
  onConvertToInvoice?: () => void;
}

export const QuotationsTab: React.FC<Props> = ({ onConvertToInvoice }) => {
  const { user } = useAuthStore();
  const { branchId } = useBranchFilter();
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<QuotationRowAction | null>(null);

  const openDetails = (id: string, action: QuotationRowAction | null): void => {
    setSelectedQuotationId(id);
    setPendingAction(action);
  };

  const fetchQuotations = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    const { data } = await salesQuotationsApi.getQuotations(user.company_id, branchId);
    setQuotations(data || []);
    setLoading(false);
  }, [user?.company_id, branchId]);

  useEffect(() => {
    void fetchQuotations();
  }, [fetchQuotations]);

  const stats = useMemo(() => computeQuotationStats(quotations), [quotations]);

  const filtered = useMemo(() => {
    const term = normalizeSearch(searchTerm);
    return quotations.filter(q => {
      const matchesStatus = statusFilter === 'all' || q.status === statusFilter;
      const matchesSearch =
        !term ||
        normalizeSearch(q.quotation_number).includes(term) ||
        normalizeSearch(q.party?.name).includes(term) ||
        normalizeSearch(q.party?.phone).includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [quotations, statusFilter, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-[var(--app-surface)] p-4 shadow-sm dark:border-slate-800 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-600/20">
            <FileText size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                عروض الأسعار
              </h2>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-mono text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {stats.totalCount}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              إدارة ومتابعة عروض أسعار المبيعات والطباعة الرسمية والتحويل المباشر لفواتير
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void fetchQuotations();
            }}
            title="تحديث القائمة"
            aria-label="تحديث قائمة عروض الأسعار"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-indigo-500' : ''} />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-600/25 transition-all hover:bg-indigo-700 active:scale-[0.99]"
          >
            <Plus size={16} />
            عرض سعر جديد
          </button>
        </div>
      </div>

      <QuotationsKpiBar stats={stats} />

      <QuotationsFilterBar
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        countsByStatus={stats.countsByStatus}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      <QuotationsTable
        loading={loading}
        filtered={filtered}
        hasActiveFilter={searchTerm !== '' || statusFilter !== 'all'}
        onCreateNew={() => {
          setShowCreateModal(true);
        }}
        onOpenDetails={openDetails}
      />

      {showCreateModal && (
        <CreateQuotationModal
          onClose={() => {
            setShowCreateModal(false);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            void fetchQuotations();
          }}
        />
      )}

      {selectedQuotationId && (
        <QuotationDetailsModal
          quotationId={selectedQuotationId}
          onClose={() => {
            setSelectedQuotationId(null);
            setPendingAction(null);
          }}
          onRefresh={() => {
            void fetchQuotations();
          }}
          {...(pendingAction !== null ? { initialAction: pendingAction } : {})}
          {...(onConvertToInvoice ? { onConvertToInvoice } : {})}
        />
      )}
    </div>
  );
};

export default QuotationsTab;
