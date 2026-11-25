import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Bell,
  Box,
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  Plus,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-react';
import {
  useRespondToTransferRequest,
  useStockTransferRequests,
  type StockTransferRequest,
} from '../../../inventory/hooks/useStockTransferRequests';

interface BranchTransferHeaderBarProps {
  activeBranchId: string | null;
  totalProductsCount: number;
  onOpenNewRequest: () => void;
  onReviewIncoming: (requests: StockTransferRequest[]) => void;
  onCloseModal: () => void;
}

/**
 * Checks whether an ISO timestamp falls on the user's current local calendar day.
 */
function isTodayLocalDate(isoString: string, now: Date = new Date()): boolean {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatRequestDirection(req: StockTransferRequest, activeBranchId: string | null): string {
  const from = req.requester_branch_name ?? 'فرع';
  const to = req.source_branch_name ?? 'فرع';
  if (activeBranchId === null) return `من ${from} ← إلى ${to}`;
  return req.source_branch_id === activeBranchId ? `من: ${from}` : `إلى: ${to}`;
}

interface ActiveTransferItemRowProps {
  req: StockTransferRequest;
  activeBranchId: string | null;
  isCancelling: boolean;
  onReview: (req: StockTransferRequest) => void;
  onCancelOutgoing: (requestId: string) => void;
}

/* eslint-disable max-lines-per-function, complexity -- compact transfer card for today's active pending requests */
const ActiveTransferItemCard: React.FC<ActiveTransferItemRowProps> = ({
  req,
  activeBranchId,
  isCancelling,
  onReview,
  onCancelOutgoing,
}) => {
  const isIncoming = activeBranchId === null || req.source_branch_id === activeBranchId;
  const isOutgoing = activeBranchId !== null && req.requester_branch_id === activeBranchId;
  const partLabel =
    req.product_part_number !== null &&
    req.product_part_number !== undefined &&
    req.product_part_number !== ''
      ? req.product_part_number
      : (req.product_sku ?? '---');

  return (
    <div className="flex min-w-[240px] max-w-[280px] shrink-0 flex-col justify-between gap-1.5 rounded-lg border border-amber-300/60 bg-white p-2 text-right text-slate-900 shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between gap-1.5">
        <span className="inline-flex items-center gap-1 truncate text-[10px] font-extrabold text-slate-600 dark:text-slate-300">
          {isIncoming ? (
            <ArrowDownLeft size={12} className="shrink-0 text-amber-600" />
          ) : (
            <ArrowUpRight size={12} className="shrink-0 text-sky-600" />
          )}
          <span className="truncate">{formatRequestDirection(req, activeBranchId)}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          <Clock size={9} />
          {new Date(req.created_at).toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
          })}
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

      <div className="flex items-center justify-end gap-1.5 border-t border-slate-100 pt-1.5 dark:border-slate-800">
        {isIncoming && (
          <button
            type="button"
            onClick={() => {
              onReview(req);
            }}
            className="flex-1 rounded-md bg-amber-600 px-2 py-1 text-[10px] font-black text-white shadow-sm transition-colors hover:bg-amber-700"
          >
            مراجعة واعتماد / رفض
          </button>
        )}
        {isOutgoing && (
          <button
            type="button"
            disabled={isCancelling}
            onClick={() => {
              onCancelOutgoing(req.id);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-300"
          >
            <XCircle size={11} />
            <span>إلغاء الطلب</span>
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * BranchTransferHeaderBar
 * ----------------------------------------------------------------------------
 * Unified ultra-compact top bar for ProductSelectionModal (replaces redundant modal header).
 * Displays ONLY today's active `pending` branch transfer requests — once a request is
 * approved/received, rejected, or cancelled, it disappears immediately.
 * Expands as a floating overlay so it NEVER pushes or shifts the product table!
 */
/* eslint-disable max-lines-per-function, complexity -- unified slim fullscreen header with floating today-only transfer overlay */
export const BranchTransferHeaderBar: React.FC<BranchTransferHeaderBarProps> = ({
  activeBranchId,
  totalProductsCount,
  onOpenNewRequest,
  onReviewIncoming,
  onCloseModal,
}) => {
  const {
    data: allRequests = [],
    isLoading,
    isFetching,
    refetch,
  } = useStockTransferRequests('all', activeBranchId);
  const { mutate: respondToRequest, isPending: isCancelling } = useRespondToTransferRequest();

  const [filterTab, setFilterTab] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Strictly keep ONLY today's active pending requests — approved/received/rejected/cancelled vanish immediately
  const { todayPending, incomingPending, outgoingPending, visibleRequests } = useMemo(() => {
    const activeToday = allRequests.filter(
      r => r.status === 'pending' && isTodayLocalDate(r.created_at)
    );

    const incoming = activeToday.filter(r =>
      activeBranchId !== null ? r.source_branch_id === activeBranchId : true
    );
    const outgoing = activeToday.filter(r =>
      activeBranchId !== null ? r.requester_branch_id === activeBranchId : false
    );

    const baseList =
      filterTab === 'incoming' ? incoming : filterTab === 'outgoing' ? outgoing : activeToday;

    const sorted = [...baseList].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return {
      todayPending: activeToday,
      incomingPending: incoming,
      outgoingPending: outgoing,
      visibleRequests: sorted,
    };
  }, [allRequests, activeBranchId, filterTab]);

  const handleOpenReview = (req: StockTransferRequest): void => {
    setIsExpanded(false);
    if (req.batch_id !== null && req.batch_id !== undefined && req.batch_id !== '') {
      const sameBatch = incomingPending.filter(r => r.batch_id === req.batch_id);
      onReviewIncoming(sameBatch.length > 0 ? sameBatch : [req]);
      return;
    }
    onReviewIncoming([req]);
  };

  const handleCancelOutgoing = (requestId: string): void => {
    respondToRequest({ requestId, action: 'cancel' });
  };

  const hasUrgentIncoming = incomingPending.length > 0;
  const topIncoming = incomingPending.at(0);

  return (
    <div className="relative z-30 shrink-0 border-b border-amber-900/40 bg-gradient-to-l from-[#432918] via-[#4e2f1b] to-[#382113] text-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
        {/* Right side: compact title + live today's pending branch transfer pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 border-l border-white/15 pl-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/25 text-amber-300">
              <Box size={14} />
            </div>
            <span className="text-xs font-black tracking-tight text-white">مستكشف الأصناف</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-200">
              {String(totalProductsCount)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setFilterTab('incoming');
              setIsExpanded(prev => !prev || filterTab !== 'incoming');
            }}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-all ${
              hasUrgentIncoming
                ? 'border-amber-400/80 bg-amber-500/30 text-amber-100 hover:bg-amber-500/40'
                : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15'
            }`}
            title="طلبات المناقلة الواردة اليوم قيد الانتظار"
          >
            <Bell size={10} className={hasUrgentIncoming ? 'animate-bounce text-amber-300' : ''} />
            <span>{activeBranchId !== null ? 'طلبات اليوم الواردة:' : 'طلبات اليوم المعلّقة:'}</span>
            <span className="rounded-full bg-amber-500 px-1.5 font-mono text-[10px] font-black text-white">
              {String(incomingPending.length)}
            </span>
          </button>

          {activeBranchId !== null && (
            <button
              type="button"
              onClick={() => {
                setFilterTab('outgoing');
                setIsExpanded(prev => !prev || filterTab !== 'outgoing');
              }}
              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/90 transition-colors hover:bg-white/15"
              title="طلبات المناقلة الصادرة اليوم قيد الانتظار"
            >
              <ArrowUpRight size={10} className="text-sky-300" />
              <span>صادرة اليوم:</span>
              <span className="rounded-full bg-sky-500/80 px-1.5 font-mono text-[10px] font-black text-white">
                {String(outgoingPending.length)}
              </span>
            </button>
          )}

          {/* Inline single-line preview of latest incoming pending request */}
          {!isExpanded && topIncoming !== undefined && (
            <div className="hidden items-center gap-1.5 rounded-md border border-amber-400/30 bg-black/25 px-2 py-0.5 text-[10px] xl:inline-flex">
              <ArrowRightLeft size={10} className="text-amber-300" />
              <span className="font-bold text-amber-200">
                {formatRequestDirection(topIncoming, activeBranchId)}
              </span>
              <span className="max-w-[160px] truncate font-semibold text-white">
                {topIncoming.product_name ?? 'صنف'}
              </span>
              <span className="font-mono font-black text-amber-300">
                ×{String(topIncoming.requested_quantity)}
              </span>
              <button
                type="button"
                onClick={() => {
                  handleOpenReview(topIncoming);
                }}
                className="rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-black text-white transition-colors hover:bg-amber-400"
              >
                اعتماد
              </button>
            </div>
          )}
        </div>

        {/* Left side: refresh, new transfer request, toggle overlay, close modal */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              void refetch();
            }}
            className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/10 p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            title="تحديث طلبات اليوم"
            aria-label="تحديث طلبات الفروع"
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={onOpenNewRequest}
            className="inline-flex items-center gap-1 rounded-md border border-amber-400/60 bg-amber-500/25 px-2 py-1 text-[10px] font-bold text-amber-100 transition-colors hover:bg-amber-500/40"
            title="إنشاء طلب مناقلة جديد من فرع آخر"
          >
            <Plus size={11} />
            <span>طلب من فرع</span>
          </button>

          {todayPending.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setIsExpanded(prev => !prev);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-bold text-white/90 transition-colors hover:bg-white/20"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'طي شريط طلبات الفروع' : 'توسيع شريط طلبات الفروع'}
            >
              <span>{isExpanded ? 'إخفاء' : `عرض (${String(todayPending.length)})`}</span>
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}

          <button
            type="button"
            onClick={onCloseModal}
            className="mr-1 inline-flex items-center justify-center rounded-md border border-white/15 bg-white/10 p-1 text-white/85 transition-colors hover:bg-rose-500/80 hover:text-white"
            title="إغلاق (Esc)"
            aria-label="إغلاق مستكشف الأصناف"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Floating Overlay Drawer — NEVER pushes or shrinks the table height! */}
      {isExpanded && (
        <div className="absolute left-2 right-2 top-full z-50 mt-1 rounded-xl border border-amber-500/40 bg-[#3a2214]/95 p-2.5 shadow-2xl backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'all', label: `نشطة اليوم (${String(todayPending.length)})` },
                  { id: 'incoming', label: `واردة (${String(incomingPending.length)})` },
                  ...(activeBranchId !== null
                    ? [
                        {
                          id: 'outgoing' as const,
                          label: `صادرة (${String(outgoingPending.length)})`,
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
                  className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors ${
                    filterTab === tab.id
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-white/10 text-white/75 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {isLoading && (
                <span className="animate-pulse text-[10px] text-amber-200">جاري التحديث...</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsExpanded(false);
                }}
                className="rounded p-0.5 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="إغلاق القائمة"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {visibleRequests.length === 0 ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 py-3 text-xs text-white/75">
              <Building2 size={14} className="text-amber-300/80" />
              <span>لا توجد طلبات معلّقة لليوم — الطلبات المعتمدة أو المرفوضة تختفي تلقائياً</span>
            </div>
          ) : (
            <div className="custom-scrollbar flex gap-2 overflow-x-auto pb-1">
              {visibleRequests.map(req => (
                <ActiveTransferItemCard
                  key={req.id}
                  req={req}
                  activeBranchId={activeBranchId}
                  isCancelling={isCancelling}
                  onReview={handleOpenReview}
                  onCancelOutgoing={handleCancelOutgoing}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
