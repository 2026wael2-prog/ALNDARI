import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import {
  useStockTransferRequests,
  type StockTransferRequest,
  type TransferRequestStatus,
} from '../../../inventory/hooks/useStockTransferRequests';

interface BranchTransferHeaderBarProps {
  activeBranchId: string | null;
  onOpenNewRequest: () => void;
  onReviewIncoming: (requests: StockTransferRequest[]) => void;
}

const STATUS_META: Record<TransferRequestStatus, { label: string; className: string }> = {
  pending: {
    label: 'قيد الانتظار',
    className:
      'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700/60',
  },
  approved: {
    label: 'تم الاعتماد',
    className:
      'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700/60',
  },
  completed: {
    label: 'مكتمل',
    className:
      'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700/60',
  },
  rejected: {
    label: 'مرفوض',
    className:
      'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-700/60',
  },
  cancelled: {
    label: 'ملغي',
    className:
      'bg-gray-100 text-gray-600 border-gray-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  },
};

function formatRequestDirection(req: StockTransferRequest, activeBranchId: string | null): string {
  const from = req.requester_branch_name ?? 'فرع';
  const to = req.source_branch_name ?? 'فرع';
  if (activeBranchId === null) return `من ${from} ← إلى ${to}`;
  return req.source_branch_id === activeBranchId ? `من: ${from}` : `إلى: ${to}`;
}

interface BranchTransferRequestCardProps {
  req: StockTransferRequest;
  activeBranchId: string | null;
  onReview: (req: StockTransferRequest) => void;
}

/* eslint-disable max-lines-per-function, complexity -- transfer request card with direction, status badge, qty & quick action */
const BranchTransferRequestCard: React.FC<BranchTransferRequestCardProps> = ({
  req,
  activeBranchId,
  onReview,
}) => {
  const isIncoming = activeBranchId === null || req.source_branch_id === activeBranchId;
  const statusInfo = STATUS_META[req.status];
  const canReview = req.status === 'pending' && isIncoming;
  const partLabel =
    req.product_part_number !== null &&
    req.product_part_number !== undefined &&
    req.product_part_number !== ''
      ? req.product_part_number
      : (req.product_sku ?? '---');

  return (
    <div className="flex min-w-[235px] max-w-[270px] shrink-0 flex-col justify-between gap-1.5 rounded-lg border border-white/15 bg-white/95 p-2 text-right text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between gap-1.5">
        <span className="inline-flex items-center gap-1 truncate text-[10px] font-extrabold text-slate-600 dark:text-slate-300">
          {isIncoming ? (
            <ArrowDownLeft size={12} className="shrink-0 text-amber-600" />
          ) : (
            <ArrowUpRight size={12} className="shrink-0 text-sky-600" />
          )}
          <span className="truncate">{formatRequestDirection(req, activeBranchId)}</span>
        </span>
        <span
          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${statusInfo.className}`}
        >
          {statusInfo.label}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-xs font-black text-slate-900 dark:text-white">
          {req.product_name ?? 'صنف غير مسمى'}
        </p>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="truncate font-mono" dir="ltr">
            {partLabel}
          </span>
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono font-black text-slate-800 dark:bg-slate-800 dark:text-amber-300">
            الكمية: {req.requested_quantity}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1 border-t border-slate-100 pt-1 dark:border-slate-800">
        <span className="inline-flex items-center gap-1 text-[9px] text-slate-400">
          {req.status === 'pending' ? (
            <Clock size={10} />
          ) : req.status === 'approved' || req.status === 'completed' ? (
            <CheckCircle2 size={10} className="text-emerald-500" />
          ) : (
            <XCircle size={10} className="text-rose-500" />
          )}
          {new Date(req.created_at).toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>

        {canReview && (
          <button
            type="button"
            onClick={() => {
              onReview(req);
            }}
            className="rounded-md bg-amber-600 px-2 py-0.5 text-[10px] font-black text-white shadow-sm transition-colors hover:bg-amber-700"
          >
            مراجعة واعتماد
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * BranchTransferHeaderBar
 * ----------------------------------------------------------------------------
 * Professional live display bar at the top of the Advanced Product Search modal.
 * Connects directly to the existing `stock_transfer_requests` system (zero duplication)
 * so sales staff can monitor incoming & outgoing branch requests in real time and
 * approve/dispatch or create new branch requests without leaving the sales invoice.
 */
/* eslint-disable max-lines-per-function, complexity -- header bar composes live summary strip and expandable cards drawer */
export const BranchTransferHeaderBar: React.FC<BranchTransferHeaderBarProps> = ({
  activeBranchId,
  onOpenNewRequest,
  onReviewIncoming,
}) => {
  const {
    data: requests = [],
    isLoading,
    isFetching,
    refetch,
  } = useStockTransferRequests('all', activeBranchId);
  const [filterTab, setFilterTab] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const { incomingPending, outgoingPending, visibleRequests } = useMemo(() => {
    const incoming = requests.filter(r =>
      activeBranchId !== null ? r.source_branch_id === activeBranchId : true
    );
    const outgoing = requests.filter(r =>
      activeBranchId !== null ? r.requester_branch_id === activeBranchId : false
    );

    const inPending = incoming.filter(r => r.status === 'pending');
    const outPending = outgoing.filter(r => r.status === 'pending');

    const baseList =
      filterTab === 'incoming' ? incoming : filterTab === 'outgoing' ? outgoing : requests;

    const sorted = [...baseList].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return {
      incomingPending: inPending,
      outgoingPending: outPending,
      visibleRequests: sorted.slice(0, 12),
    };
  }, [requests, activeBranchId, filterTab]);

  const handleOpenReview = (req: StockTransferRequest): void => {
    if (req.batch_id !== null && req.batch_id !== undefined && req.batch_id !== '') {
      const sameBatch = incomingPending.filter(r => r.batch_id === req.batch_id);
      onReviewIncoming(sameBatch.length > 0 ? sameBatch : [req]);
      return;
    }
    onReviewIncoming([req]);
  };

  const hasUrgentIncoming = incomingPending.length > 0;
  const topRequest = visibleRequests.at(0);

  return (
    <div className="border-b border-amber-200/80 bg-gradient-to-l from-[#432918] via-[#51311c] to-[#3a2214] text-white shadow-sm dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-black tracking-tight text-amber-300">
            <ArrowRightLeft size={14} className={hasUrgentIncoming ? 'animate-pulse' : ''} />
            <span>طلبات الفروع</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setFilterTab('incoming');
              setIsExpanded(true);
            }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-all ${
              hasUrgentIncoming
                ? 'border-amber-400/70 bg-amber-500/25 text-amber-100 hover:bg-amber-500/35'
                : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15'
            }`}
          >
            <Bell size={11} className={hasUrgentIncoming ? 'animate-bounce text-amber-300' : ''} />
            <span>{activeBranchId !== null ? 'واردة قيد الانتظار:' : 'طلبات معلّقة:'}</span>
            <span className="rounded-full bg-amber-500 px-1.5 font-mono text-[10px] font-black text-white">
              {incomingPending.length}
            </span>
          </button>

          {activeBranchId !== null && (
            <button
              type="button"
              onClick={() => {
                setFilterTab('outgoing');
                setIsExpanded(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-white/90 transition-colors hover:bg-white/15"
            >
              <ArrowUpRight size={11} className="text-sky-300" />
              <span>صادرة:</span>
              <span className="rounded-full bg-sky-500/80 px-1.5 font-mono text-[10px] font-black text-white">
                {outgoingPending.length}
              </span>
            </button>
          )}

          {!isExpanded && topRequest !== undefined && (
            <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-0.5 text-[11px] lg:inline-flex">
              <span className="font-bold text-amber-200">
                {formatRequestDirection(topRequest, activeBranchId)}
              </span>
              <span className="max-w-[180px] truncate font-semibold text-white">
                {topRequest.product_name ?? 'صنف'}
              </span>
              <span className="font-mono font-black text-amber-300">
                ×{topRequest.requested_quantity}
              </span>
              {topRequest.status === 'pending' &&
                (activeBranchId === null || topRequest.source_branch_id === activeBranchId) && (
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenReview(topRequest);
                    }}
                    className="rounded bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white transition-colors hover:bg-amber-400"
                  >
                    اعتماد
                  </button>
                )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              void refetch();
            }}
            className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/10 p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            title="تحديث طلبات الفروع"
            aria-label="تحديث طلبات الفروع"
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={onOpenNewRequest}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-400/60 bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-100 transition-colors hover:bg-amber-500/35"
            title="إنشاء طلب مناقلة جديد من فرع آخر"
          >
            <Plus size={12} />
            <span>طلب من فرع</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsExpanded(prev => !prev);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-bold text-white/90 transition-colors hover:bg-white/20"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'طي شريط طلبات الفروع' : 'توسيع شريط طلبات الفروع'}
          >
            <span>{isExpanded ? 'إخفاء' : `عرض (${String(requests.length)})`}</span>
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-white/10 bg-black/20 px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'all', label: `الكل (${String(requests.length)})` },
                  {
                    id: 'incoming',
                    label: `واردة لفرعك (${String(incomingPending.length)} معلّق)`,
                  },
                  ...(activeBranchId !== null
                    ? [
                        {
                          id: 'outgoing' as const,
                          label: `صادرة من فرعك (${String(outgoingPending.length)} معلّق)`,
                        },
                      ]
                    : []),
                ] as const
              ).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setFilterTab(tab.id);
                  }}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    filterTab === tab.id
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-white/10 text-white/75 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {isLoading && (
              <span className="animate-pulse text-[10px] text-amber-200">جاري التحديث...</span>
            )}
          </div>

          {visibleRequests.length === 0 ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 py-3 text-xs text-white/70">
              <Building2 size={14} className="text-amber-300/80" />
              <span>لا توجد طلبات مناقلة بين الفروع في هذا القسم حالياً</span>
            </div>
          ) : (
            <div className="custom-scrollbar flex gap-2 overflow-x-auto pb-1">
              {visibleRequests.map(req => (
                <BranchTransferRequestCard
                  key={req.id}
                  req={req}
                  activeBranchId={activeBranchId}
                  onReview={handleOpenReview}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
