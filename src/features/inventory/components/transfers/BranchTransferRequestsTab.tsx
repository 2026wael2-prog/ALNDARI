/* eslint-disable max-lines-per-function, complexity, @typescript-eslint/explicit-function-return-type */
import React, { useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  Package,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Send,
  Inbox,
  SendHorizontal,
  Tag,
  Hash,
} from 'lucide-react';
import {
  useStockTransferRequests,
  type StockTransferRequest,
} from '../../hooks/useStockTransferRequests';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';
import TableSkeleton from '@/ui/base/TableSkeleton';
import EmptyState from '@/ui/base/EmptyState';
import { IncomingTransferApprovalModal } from './IncomingTransferApprovalModal';

interface BranchTransferRequestsTabProps {
  onOpenCreateRequestModal: () => void;
}

export const BranchTransferRequestsTab: React.FC<BranchTransferRequestsTabProps> = ({
  onOpenCreateRequestModal,
}) => {
  const { branchId } = useBranchFilter();
  const [filterType, setFilterType] = useState<'all' | 'incoming' | 'outgoing'>(
    branchId ? 'incoming' : 'all'
  );
  const [selectedRequestsForAction, setSelectedRequestsForAction] = useState<StockTransferRequest[] | null>(null);

  const { data: requests, isLoading } = useStockTransferRequests('all', branchId);

  if (isLoading) {
    return <TableSkeleton rows={5} cols={6} />;
  }

  const allList = requests ?? [];
  const filteredList = allList.filter(r => {
    if (!branchId) return true;
    if (filterType === 'incoming') {
      return r.source_branch_id === branchId;
    }
    if (filterType === 'outgoing') {
      return r.requester_branch_id === branchId;
    }
    return true;
  });

  const pendingIncomingCount = allList.filter(
    r => (!branchId || r.source_branch_id === branchId) && r.status === 'pending'
  ).length;

  const handleOpenAction = (req: StockTransferRequest) => {
    const matchingBatch = req.batch_id !== null && req.batch_id !== undefined && req.batch_id.length > 0
      ? allList.filter(r => r.batch_id === req.batch_id && r.status === 'pending')
      : [req];
    setSelectedRequestsForAction(matchingBatch.length > 0 ? matchingBatch : [req]);
  };

  return (
    <div className="space-y-4">
      {/* شريط التحكم والفلترة وزر طلب مناقلة جديد */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        
        {/* أزرار الفلترة: وارد / صادر / الكل */}
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => {
              setFilterType('incoming');
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              filterType === 'incoming'
                ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Inbox size={14} />
            <span>طلبات واردة لفرعنا</span>
            {pendingIncomingCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 font-mono text-[10px] font-black text-white">
                {pendingIncomingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setFilterType('outgoing');
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              filterType === 'outgoing'
                ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <SendHorizontal size={14} />
            <span>طلبات صادرة من فرعنا</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFilterType('all');
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              filterType === 'all'
                ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span>الكل ({allList.length})</span>
          </button>
        </div>

        {/* زر طلب مناقلة جديد من فرع آخر */}
        <button
          type="button"
          onClick={onOpenCreateRequestModal}
          className="flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-xs font-bold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700 active:scale-95"
        >
          <Plus size={16} />
          <span>طلب بضاعة من فرع آخر</span>
        </button>
      </div>

      {/* قائمة الطلبات */}
      {filteredList.length === 0 ? (
        <EmptyState
          icon={ArrowRightLeft}
          title={
            filterType === 'incoming'
              ? 'لا توجد طلبات مناقلة واردة حالياً'
              : 'لا توجد طلبات مناقلة مسجلة'
          }
          description="يمكنك إنشاء طلب مناقلة جديد بالضغط على الزر أعلاه وطلب أصناف من أي فرع آخر."
          action={
            <button
              onClick={onOpenCreateRequestModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-95"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              <span>إنشاء طلب مناقلة الآن</span>
            </button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="py-3 pr-4">#</th>
                  <th className="py-3">المنتج والصنف</th>
                  <th className="py-3">رقم القطعة (Part No)</th>
                  <th className="py-3">الشركة الصانعة (Brand)</th>
                  <th className="py-3">الفرع الطالب</th>
                  <th className="py-3">الفرع المصدر</th>
                  <th className="py-3 text-center">الكمية</th>
                  <th className="py-3">تاريخ الطلب</th>
                  <th className="py-3 text-center">الحالة</th>
                  <th className="py-3 pl-4 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredList.map((req, index) => {
                  const isIncoming = req.source_branch_id === branchId;
                  const isPending = req.status === 'pending';
                  const isCompleted = req.status === 'completed' || req.status === 'approved';

                  return (
                    <tr
                      key={req.id}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 pr-4 font-mono text-[11px] text-slate-400">
                        {index + 1}
                      </td>

                      <td className="py-3 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <Package size={15} className="text-blue-600 shrink-0" />
                          <div>
                            <div>{req.product_name ?? 'منتج'}</div>
                            <span className="font-mono text-[10px] font-normal text-slate-400">
                              كود: {req.product_sku ?? '-'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3">
                        {req.product_part_number !== null && req.product_part_number !== undefined && req.product_part_number !== '' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                            <Hash size={10} className="text-slate-400" />
                            <span>{req.product_part_number}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3">
                        {req.product_brand !== null && req.product_brand !== undefined && req.product_brand !== '' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            <Tag size={10} className="text-amber-500" />
                            <span>{req.product_brand}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3">
                        <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                          <Building2 size={13} className="text-blue-500" />
                          {req.requester_branch_name ?? '-'}
                        </span>
                      </td>

                      <td className="py-3">
                        <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                          <Building2 size={13} className="text-emerald-500" />
                          {req.source_branch_name ?? '-'}
                        </span>
                      </td>

                      <td className="py-3 text-center font-mono font-black text-slate-900 dark:text-white">
                        {req.requested_quantity}
                      </td>

                      <td className="py-3 font-mono text-[11px] text-slate-500">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} className="text-slate-400" />
                          <span>{new Date(req.created_at).toLocaleDateString('ar-YE')}</span>
                        </div>
                      </td>

                      <td className="py-3 text-center">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                            <Clock size={11} />
                            قيد الانتظار
                          </span>
                        ) : isCompleted ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                            <CheckCircle2 size={11} />
                            تم الإرسال
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-bold text-rose-800 dark:bg-rose-900/60 dark:text-rose-300">
                            <XCircle size={11} />
                            مرفوض
                          </span>
                        )}
                      </td>

                      <td className="py-3 pl-4 text-center">
                        {isIncoming && isPending ? (
                          <button
                            type="button"
                            onClick={() => {
                              handleOpenAction(req);
                            }}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
                          >
                            <Send size={12} />
                            <span>مراجعة وإرسال</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* نافذة الموافقة والإرسال التفاعلية */}
      <IncomingTransferApprovalModal
        requests={selectedRequestsForAction}
        isOpen={Boolean(selectedRequestsForAction && selectedRequestsForAction.length > 0)}
        onClose={() => {
          setSelectedRequestsForAction(null);
        }}
      />
    </div>
  );
};

export default BranchTransferRequestsTab;
