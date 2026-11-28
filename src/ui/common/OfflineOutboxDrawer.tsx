import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  RefreshCw,
  RotateCcw,
  Server,
  X,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { useConnectionStore } from '@/core/store/connectionStore';
import { edgeClient, type EdgeOutboxRow } from '@/core/offline/edgeClient';
import { cn } from '@/core/utils';

interface OfflineOutboxDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const ENTITY_LABELS: Record<EdgeOutboxRow['entity_type'], string> = {
  sales_invoice: 'فاتورة مبيعات',
  bond: 'سند مالي',
  requisition: 'طلب مطلوبات',
};

const STATUS_BADGES: Record<
  EdgeOutboxRow['status'],
  { label: string; className: string }
> = {
  pending: {
    label: 'بانتظار الإنترنت',
    className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  },
  syncing: {
    label: 'جاري المزامنة',
    className: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  },
  synced: {
    label: 'تم الترحيل',
    className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  },
  failed_needs_review: {
    label: 'يحتاج مراجعة',
    className: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  },
};

export const OfflineOutboxDrawer: React.FC<OfflineOutboxDrawerProps> = ({ isOpen, onClose }) => {
  const {
    connectionMode,
    edgeAvailable,
    edgeUrl,
    edgeBranchCode,
    pendingOutboxCount,
    failedOutboxCount,
    lastMirrorSyncAt,
  } = useConnectionStore();

  const [rows, setRows] = useState<EdgeOutboxRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadOutbox = useCallback(async () => {
    if (!edgeAvailable) {
      setRows([]);
      return;
    }
    setIsLoading(true);
    try {
      const res = await edgeClient.listOutbox(60);
      setRows(res.rows);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'تعذر قراءة الطابور المحلي');
    } finally {
      setIsLoading(false);
    }
  }, [edgeAvailable]);

  useEffect(() => {
    if (isOpen) {
      void loadOutbox();
    }
  }, [isOpen, loadOutbox]);

  if (!isOpen) return null;

  const handleSyncNow = async () => {
    setIsSyncingNow(true);
    setFeedback(null);
    try {
      const res = await edgeClient.triggerSyncNow();
      await loadOutbox();
      if (res.skipped) {
        setFeedback(`تم تخطي المزامنة: ${res.reason || 'غير متاح حالياً'}`);
      } else if (res.error) {
        setFeedback(`تعذر إكمال المزامنة: ${res.error}`);
      } else {
        setFeedback(
          `تمت المزامنة: ${res.outboxResult?.synced ?? 0} عملية مرفوعة، ${res.outboxResult?.failed ?? 0} متعثرة`
        );
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'فشل الاتصال بالخادم');
    } finally {
      setIsSyncingNow(false);
    }
  };

  const handleRetry = async (id: string) => {
    await edgeClient.retryOutboxItem(id);
    await loadOutbox();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[86dvh] w-full max-w-2xl flex-col rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-xl sm:p-5"
        dir="rtl"
      >
        <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Server size={18} className="text-blue-600" />
            <div>
              <h3 className="text-sm font-extrabold text-black dark:text-white">
                حالة الاتصال وخادم فرع {edgeBranchCode || 'B1'} المحلي
              </h3>
              <p className="font-mono text-[11px] font-bold text-slate-500" dir="ltr">
                {edgeUrl}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* Status Summary Grid */}
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950">
            <span className="block text-[10px] font-bold text-slate-500">وضع التشغيل</span>
            <span className="mt-1 flex items-center gap-1 font-extrabold text-black dark:text-white">
              {connectionMode === 'local_failover' ? (
                <>
                  <CloudOff size={13} className="text-amber-600" /> وضع محلي أوفلاين
                </>
              ) : connectionMode === 'syncing' ? (
                <>
                  <RefreshCw size={13} className="animate-spin text-blue-600" /> جاري المزامنة
                </>
              ) : (
                <>
                  <Cloud size={13} className="text-emerald-600" /> سحابي مباشر
                </>
              )}
            </span>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950">
            <span className="block text-[10px] font-bold text-slate-500">الخادم المحلي</span>
            <span
              className={cn(
                'mt-1 block font-extrabold',
                edgeAvailable ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'
              )}
            >
              {edgeAvailable ? 'متصل وجاهز' : 'غير مشغّل'}
            </span>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950">
            <span className="block text-[10px] font-bold text-slate-500">عمليات بالانتظار</span>
            <span className="mt-1 block font-mono text-sm font-extrabold text-amber-700 dark:text-amber-400">
              {pendingOutboxCount}
            </span>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950">
            <span className="block text-[10px] font-bold text-slate-500">تحتاج مراجعة</span>
            <span className="mt-1 block font-mono text-sm font-extrabold text-rose-700 dark:text-rose-400">
              {failedOutboxCount}
            </span>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950">
          <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
            <Clock size={13} className="text-blue-600" />
            <span>آخر مزامنة مرآة:</span>
            <span className="font-mono" dir="ltr">
              {lastMirrorSyncAt ? new Date(lastMirrorSyncAt).toLocaleString('en-GB') : '---'}
            </span>
          </span>
          <button
            type="button"
            disabled={!edgeAvailable || isSyncingNow}
            onClick={() => {
              void handleSyncNow();
            }}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isSyncingNow ? 'animate-spin' : ''} />
            <span>{isSyncingNow ? 'جارٍ المزامنة...' : 'مزامنة الآن'}</span>
          </button>
        </div>

        {feedback && (
          <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            {feedback}
          </div>
        )}

        <div className="custom-scrollbar flex-1 overflow-y-auto space-y-2">
          {!edgeAvailable ? (
            <div className="py-10 text-center text-xs font-bold text-slate-500">
              الخادم المحلي لفرع {edgeBranchCode || 'B1'} غير متصل على هذا الجهاز حالياً. عند تشغيله في المحل
              تظهر هنا جميع العمليات المسجلة أوفلاين وحالة ترحيلها لـ Supabase.
            </div>
          ) : isLoading ? (
            <div className="py-10 text-center text-xs font-bold text-slate-500">
              جارٍ تحميل سجل الطابور المحلي...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-xs font-bold text-slate-500">
              <CheckCircle2 size={24} className="text-emerald-600" />
              <span>طابور العمليات فارغ — جميع العمليات متزامنة مع السحابة بالكامل.</span>
            </div>
          ) : (
            rows.map(row => {
              const badge = STATUS_BADGES[row.status];
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-800 dark:bg-slate-950"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-black dark:text-white">
                        {ENTITY_LABELS[row.entity_type] || row.entity_type}
                      </span>
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-extrabold', badge.className)}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      <span>مرجع محلي: {row.offline_ref}</span>
                      {row.official_ref && (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          ← رقم رسمي: {row.official_ref}
                        </span>
                      )}
                    </div>
                    {row.error_message && (
                      <div className="flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-400">
                        <AlertTriangle size={12} />
                        <span>{row.error_message}</span>
                      </div>
                    )}
                  </div>

                  {(row.status === 'failed_needs_review' || row.status === 'syncing') && (
                    <button
                      type="button"
                      onClick={() => {
                        void handleRetry(row.id);
                      }}
                      className="flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-[11px] font-extrabold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
                    >
                      <RotateCcw size={12} />
                      <span>إعادة المحاولة</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
