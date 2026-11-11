/* eslint-disable max-lines-per-function, complexity, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Building2,
  X,
  ArrowRight,
  Sparkles,
  Tag,
  Hash,
} from 'lucide-react';
import type { StockTransferRequest } from '../../hooks/useStockTransferRequests';

interface TransferDispatchedNotificationModalProps {
  requests: StockTransferRequest[] | null;
  isOpen: boolean;
  onClose: () => void;
  onViewTransfers?: () => void;
}

export const TransferDispatchedNotificationModal: React.FC<TransferDispatchedNotificationModalProps> = ({
  requests,
  isOpen,
  onClose,
  onViewTransfers,
}) => {
  const activeRequests = requests ?? [];
  if (!isOpen || activeRequests.length === 0) return null;

  const firstReq = activeRequests[0];
  const isApproved = firstReq?.status === 'completed' || firstReq?.status === 'approved';
  const sourceBranchName = firstReq?.source_branch_name ?? 'الفرع المصدر';
  const totalQuantity = activeRequests.reduce((sum, r) => sum + r.requested_quantity, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900">
        
        {/* الترويسة بلون الحالة */}
        <div
          className={`flex items-center justify-between border-b p-4 ${
            isApproved
              ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/40'
              : 'border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md ${
                isApproved ? 'bg-emerald-600 shadow-emerald-600/30' : 'bg-rose-600 shadow-rose-600/30'
              }`}
            >
              {isApproved ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {isApproved ? `تم اعتماد وشحن المناقلة (${String(activeRequests.length)} أصناف)` : 'تحديث على طلب المناقلة'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isApproved
                  ? 'تمت الموافقة من الفرع المصدر وشحن البضاعة لمستودعك'
                  : 'اعتذر الفرع المصدر عن تلبية الطلب'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* محتوى الإشعار والتفاصيل */}
        <div className="flex flex-1 flex-col overflow-y-auto space-y-3 p-5 text-right">
          
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40">
            <span className="text-[11px] text-slate-400">الفرع المصدر المشحن منه:</span>
            <span className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
              <Building2 size={13} className="text-blue-600" />
              {sourceBranchName}
            </span>
          </div>

          {/* قائمة الأصناف المشحونة مع رقم القطعة والمصنع */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-2 text-[11px] dark:border-slate-800 dark:bg-slate-900">
              <span className="font-bold text-slate-700 dark:text-slate-200">الأصناف المشحونة</span>
              <span className="text-slate-500">
                الإجمالي: <span className="font-mono font-bold text-emerald-600">{totalQuantity}</span> حبة
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-56 overflow-y-auto">
              {activeRequests.map((req, idx) => (
                <div key={req.id} className="p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-slate-400 font-bold mt-0.5">#{idx + 1}</span>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {req.product_name ?? 'صنف'}
                        </div>
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
                          <span className="font-mono text-slate-400">كود: {req.product_sku ?? '-'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-left shrink-0">
                      <span className="font-mono text-xs font-black text-emerald-700 dark:text-emerald-300">
                        {req.requested_quantity} حبة
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ملاحظات المراجعة والشحن */}
          {Boolean(firstReq?.review_notes) && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              <span className="font-bold text-slate-700 dark:text-slate-200">ملاحظات الفرع المشحن: </span>
              <span>{firstReq?.review_notes}</span>
            </div>
          )}

          {isApproved && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200">
              <Sparkles size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                تم تسجيل حركة المناقلة وتحديث رصيد المخزون في مستودع فرعك مباشرة.
              </span>
            </div>
          )}
        </div>

        {/* أزرار الإجراءات */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          {onViewTransfers && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onViewTransfers();
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              <span>معاينة سجل المناقلات</span>
              <ArrowRight size={14} className="rtl:rotate-180" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mr-auto h-9 rounded-xl bg-slate-900 px-5 text-xs font-bold text-white shadow hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            حسناً، فهمت
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransferDispatchedNotificationModal;
