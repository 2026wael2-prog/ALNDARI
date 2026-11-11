/* eslint-disable max-lines-per-function, complexity, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/explicit-function-return-type, jsx-a11y/label-has-associated-control, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import React, { useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  XCircle,
  X,
  Building2,
  Calendar,
  AlertTriangle,
  Loader2,
  Tag,
  Hash,
  CheckCircle2,
} from 'lucide-react';
import type { StockTransferRequest } from '../../hooks/useStockTransferRequests';
import { useRespondToTransferBatch } from '../../hooks/useStockTransferRequests';

interface IncomingTransferApprovalModalProps {
  requests: StockTransferRequest[] | null;
  isOpen: boolean;
  onClose: () => void;
}

export const IncomingTransferApprovalModal: React.FC<IncomingTransferApprovalModalProps> = ({
  requests,
  isOpen,
  onClose,
}) => {
  const [approvedQuantities, setApprovedQuantities] = useState<Record<string, number>>({});
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const { mutate: respondBatch, isPending } = useRespondToTransferBatch();

  const activeRequests = requests ?? [];

  // ضبط الكميات المعتمدة الأولية لتطابق الكميات المطلوبة
  useEffect(() => {
    if (requests && requests.length > 0) {
      const initial: Record<string, number> = {};
      for (const req of requests) {
        initial[req.id] = req.requested_quantity;
      }
      setApprovedQuantities(initial);
      setReviewNotes('');
      setIsRejecting(false);
    }
  }, [requests]);

  if (!isOpen || activeRequests.length === 0) return null;

  const firstReq = activeRequests[0];
  const requesterBranchName = firstReq?.requester_branch_name ?? 'فرع شقيق';
  const batchId = firstReq?.batch_id ?? undefined;
  const requestIds = activeRequests.map(r => r.id);

  const handleUpdateApprovedQty = (reqId: string, val: number) => {
    setApprovedQuantities(prev => ({
      ...prev,
      [reqId]: Math.max(1, isNaN(val) ? 1 : val),
    }));
  };

  const handleApproveAndDispatch = (): void => {
    const itemsApproved = activeRequests.map(req => ({
      requestId: req.id,
      approvedQuantity: approvedQuantities[req.id] ?? req.requested_quantity,
    }));

    respondBatch(
      {
        batchId,
        requestIds,
        action: 'approve',
        itemsApproved,
        reviewNotes: reviewNotes.trim() ? reviewNotes.trim() : undefined,
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  const handleReject = (): void => {
    respondBatch(
      {
        batchId,
        requestIds,
        action: 'reject',
        reviewNotes: reviewNotes.trim()
          ? reviewNotes.trim()
          : 'اعتذار عن عدم توفر الكمية المطلوبة حالياً',
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  const totalRequested = activeRequests.reduce((sum, r) => sum + r.requested_quantity, 0);
  const totalApproved = activeRequests.reduce(
    (sum, r) => sum + (approvedQuantities[r.id] ?? r.requested_quantity),
    0
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* خلفية معتمة بزجاج ناعم */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* بطاقة النافذة المنبثقة التفاعلية */}
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900">
        
        {/* الترويسة بلون مميز لطلبات المناقلة العاجلة */}
        <div className="flex items-center justify-between border-b border-amber-200/80 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent p-4 dark:border-amber-800/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
              <ArrowRightLeft size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  طلب مناقلة بضاعة عاجل ({activeRequests.length} أصناف)
                </h3>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                  وارد جديد
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                فرع آخر يطلب تزويده ببضاعة من مستودعك — يرجى تحديد الكميات المعتمدة للإرسال
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* جسم النافذة */}
        <div className="flex flex-1 flex-col overflow-y-auto p-5 text-right space-y-4">
          
          {/* بيانات الفرع الطالب وتاريخ الطلب */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50">
            <div>
              <span className="text-[11px] text-slate-400">الفرع الطالب:</span>
              <div className="mt-0.5 flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <Building2 size={13} className="text-blue-600" />
                <span>{requesterBranchName}</span>
              </div>
            </div>
            <div>
              <span className="text-[11px] text-slate-400">تاريخ ووقت الطلب:</span>
              <div className="mt-0.5 flex items-center gap-1.5 font-mono font-medium text-slate-600 dark:text-slate-300">
                <Calendar size={13} className="text-slate-400" />
                <span>
                  {firstReq?.created_at
                    ? new Date(firstReq.created_at).toLocaleTimeString('ar-YE', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* جدول كافة المنتجات المطلوبة مع رقم القطعة والشركة الصانعة */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                قائمة المنتجات المطلوبة ({activeRequests.length})
              </span>
              <span className="text-[11px] text-slate-500">
                إجمالي المطلوب: <span className="font-mono font-bold text-blue-600">{totalRequested}</span> | المعتمد للشحن: <span className="font-mono font-bold text-emerald-600">{totalApproved}</span> قطعة
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-72 overflow-y-auto">
              {activeRequests.map((req, idx) => {
                const currentApproved = approvedQuantities[req.id] ?? req.requested_quantity;
                const isDifferent = currentApproved !== req.requested_quantity;

                return (
                  <div key={req.id} className="p-3.5 transition hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      
                      {/* تفاصيل المنتج */}
                      <div className="flex items-start gap-2.5">
                        <span className="font-mono text-xs font-bold text-slate-400 mt-1">
                          #{idx + 1}
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                            {req.product_name ?? 'منتج غير محدد'}
                          </h4>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                            {req.product_part_number && (
                              <span className="flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 font-mono font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                <Hash size={10} className="text-slate-400" />
                                <span>{req.product_part_number}</span>
                              </span>
                            )}
                            {req.product_brand && (
                              <span className="flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                <Tag size={10} className="text-amber-500" />
                                <span>{req.product_brand}</span>
                              </span>
                            )}
                            <span className="font-mono text-slate-400">
                              كود: {req.product_sku ?? '-'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* الكمية المطلوبة والمعتمدة */}
                      <div className="flex items-center gap-3">
                        <div className="text-left">
                          <span className="text-[10px] text-slate-400 block">المطلوب:</span>
                          <span className="font-mono text-xs font-black text-blue-700 dark:text-blue-300">
                            {req.requested_quantity} حبة
                          </span>
                        </div>

                        {!isRejecting && (
                          <div className="text-left">
                            <span className="text-[10px] text-slate-400 block font-bold">المرسل:</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="1"
                                value={currentApproved}
                                onChange={e => {
                                  const val = parseInt(e.target.value, 10);
                                  handleUpdateApprovedQty(req.id, val);
                                }}
                                className="h-8 w-16 rounded-lg border border-slate-300 bg-white text-center font-mono text-xs font-black text-slate-900 shadow-inner focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                              />
                              <span className="text-[10px] font-bold text-slate-500">حبة</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* تنبيه تعديل الكمية */}
                    {isDifferent && !isRejecting && (
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                        <AlertTriangle size={11} />
                        <span>تم تعديل الكمية المعتمدة لهذا الصنف عن الكمية المطلوبة</span>
                      </div>
                    )}

                    {/* ملاحظات الصنف إن وجدت */}
                    {Boolean(req.notes) && (
                      <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-bold">ملاحظة: </span>
                        <span>{req.notes}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* تحديد الملاحظات أو الرفض */}
          {!isRejecting ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                ملاحظات الإرسال والشحن (اسم السائق، رقم الإرسالية، إلخ):
              </label>
              <input
                type="text"
                value={reviewNotes}
                onChange={e => {
                  setReviewNotes(e.target.value);
                }}
                placeholder="مثلاً: تم تجهيز الشحنة مع السائق محمد / جاهزة للاستلام..."
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          ) : (
            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900/50 dark:bg-rose-950/20">
              <label className="block text-xs font-bold text-rose-800 dark:text-rose-200">
                سبب الرفض والاعتذار:
              </label>
              <textarea
                value={reviewNotes}
                onChange={e => {
                  setReviewNotes(e.target.value);
                }}
                rows={2}
                placeholder="اكتب سبب عدم إمكانية إرسال البضاعة حالياً..."
                className="w-full rounded-lg border border-rose-300 bg-white p-2 text-xs text-slate-900 focus:border-rose-500 focus:outline-none dark:border-rose-800 dark:bg-slate-900 dark:text-white"
              />
            </div>
          )}
        </div>

        {/* أزرار الإجراءات في أسفل النافذة */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/60">
          {!isRejecting ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsRejecting(true);
                }}
                disabled={isPending}
                className="flex h-10 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                <XCircle size={15} />
                <span>رفض الطلب</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPending}
                  className="h-10 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  إغلاق لاحقاً
                </button>
                <button
                  type="button"
                  onClick={handleApproveAndDispatch}
                  disabled={isPending || totalApproved <= 0}
                  className="flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>جاري الاعتماد والشحن...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>موافقة وشحن الأصناف المحددة ({activeRequests.length} أصناف)</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsRejecting(false);
                }}
                disabled={isPending}
                className="h-10 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                رجوع
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isPending}
                className="flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-5 text-xs font-bold text-white shadow-md hover:bg-rose-700 active:scale-95 disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>جاري تسجيل الرفض...</span>
                  </>
                ) : (
                  <>
                    <XCircle size={16} />
                    <span>تأكيد رفض طلب المناقلة</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default IncomingTransferApprovalModal;
