/* eslint-disable max-lines-per-function, @typescript-eslint/strict-boolean-expressions */
import React, { useEffect, useMemo, useState } from 'react';
import {
  History,
  X,
  Trash2,
  ArrowRight,
  Calendar,
  User,
  Package,
  Hash,
  CloudOff,
  Cloud,
  Search,
  RefreshCw,
  Send,
  CheckCircle2,
  Ban,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRequisitionsStore } from '../../store/requisitionsStore';
import type { RequisitionRecord, RequisitionStatus } from '../../types/requisitions';
import { requisitionsApi, resolveRequisitionErrorMessage } from '../../api/requisitionsApi';
import { filledRequisitionItems } from '../../utils/requisitionsValidation';
import { useAuthStore } from '@/features/auth/store';
import { usePermission } from '@/core/hooks/usePermission';

interface RequisitionsHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_LABELS: Record<RequisitionStatus, string> = {
  draft: 'مسودة',
  sent: 'أُرسل للمورد',
  received: 'تم التوريد',
  cancelled: 'ملغي',
};

const STATUS_CLASSES: Record<RequisitionStatus, string> = {
  draft: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  received: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  cancelled: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export const RequisitionsHistoryModal: React.FC<RequisitionsHistoryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const localDrafts = useRequisitionsStore(state => state.localDrafts);
  const items = useRequisitionsStore(state => state.items);
  const hasUnsavedChanges = useRequisitionsStore(state => state.hasUnsavedChanges);
  const activeServerBackedId = useRequisitionsStore(state => state.serverBackedId);
  const loadIntoGrid = useRequisitionsStore(state => state.loadIntoGrid);
  const deleteLocalDraft = useRequisitionsStore(state => state.deleteLocalDraft);
  const setServerStatus = useRequisitionsStore(state => state.setServerStatus);
  const companyId = useAuthStore(state => state.user?.company_id ?? '');
  const { hasPermission: canIssuePurchaseRequest } = usePermission('purchases:create');

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequisitionStatus | 'all'>('all');
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const {
    data: serverRecords = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['sales-requisitions', companyId],
    queryFn: () => requisitionsApi.listRequisitions(companyId),
    enabled: isOpen && companyId !== '',
    staleTime: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ recordId, status }: { recordId: string; status: RequisitionStatus }) =>
      requisitionsApi.setRequisitionStatus(recordId, status),
    onMutate: () => {
      setStatusError(null);
    },
    onSuccess: (_data, variables) => {
      if (variables.recordId === activeServerBackedId) {
        setServerStatus(variables.status);
      }
      void queryClient.invalidateQueries({ queryKey: ['sales-requisitions', companyId] });
    },
    onError: error => {
      setStatusError(resolveRequisitionErrorMessage(error));
    },
  });

  const records = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...localDrafts, ...serverRecords]
      .filter(record => {
        if (statusFilter !== 'all' && record.status !== statusFilter) return false;
        if (!q) return true;
        return (
          record.title.toLowerCase().includes(q) ||
          (record.number && record.number.toLowerCase().includes(q)) ||
          (record.supplier?.name && record.supplier.name.toLowerCase().includes(q)) ||
          record.items.some(
            item =>
              item.name.toLowerCase().includes(q) || item.partNumber.toLowerCase().includes(q)
          )
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [localDrafts, serverRecords, query, statusFilter]);

  if (!isOpen) return null;

  const handleOpen = (record: RequisitionRecord): void => {
    const filledCount = filledRequisitionItems(items).length;
    if (
      hasUnsavedChanges &&
      filledCount > 0 &&
      !window.confirm(
        'يوجد تعديلات غير محفوظة في الجدول الحالي. هل تريد استبدال الجدول بهذا الطلب؟'
      )
    ) {
      return;
    }

    loadIntoGrid(
      {
        title: record.title,
        supplier: record.supplier,
        notes: record.notes,
        items: record.items,
      },
      {
        number: record.number,
        recordId: record.id,
        recordOrigin: record.origin,
        status: record.status,
      }
    );
    onClose();
  };

  const handleStatusChange = (record: RequisitionRecord, nextStatus: RequisitionStatus): void => {
    if (
      nextStatus === 'cancelled' &&
      !window.confirm(`هل أنت متأكد من إلغاء الطلب ${record.number ?? record.title}؟ لا يمكن التراجع بعد الإلغاء.`)
    ) {
      return;
    }
    statusMutation.mutate({ recordId: record.id, status: nextStatus });
  };

  return (
    <div
      className="backdrop-blur-xs fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-3xl flex-col rounded-t-2xl border border-slate-200 bg-white p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-xl sm:p-5"
        dir="rtl"
      >
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
          <div className="flex items-center gap-2 text-black dark:text-slate-100">
            <History size={18} className="text-blue-600" />
            <h3 className="text-sm font-extrabold">سجل طلبات المطلوبات وإدارة الحالات</h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                void refetch();
              }}
              disabled={isFetching}
              className="rounded p-1.5 text-slate-600 hover:bg-slate-100 hover:text-black dark:text-slate-300 dark:hover:bg-slate-800"
              title="تحديث السجل من الخادم"
            >
              <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="إغلاق"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Search & Status Filters */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={13}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ابحث بالرقم، العنوان، المورد، أو اسم/رقم القطعة..."
              className="h-8 w-full rounded-lg border border-slate-300 bg-slate-50 pl-3 pr-8 text-xs font-bold text-black outline-none focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {(['all', 'draft', 'sent', 'received', 'cancelled'] as const).map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition-colors ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {st === 'all' ? 'الكل' : STATUS_LABELS[st]}
              </button>
            ))}
          </div>
        </div>

        {statusError && (
          <p className="mb-3 rounded-lg border border-rose-300 bg-rose-50 p-2 text-xs font-bold text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {statusError}
          </p>
        )}

        {localDrafts.length > 0 && (
          <p className="mb-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 p-2 text-[11px] font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <CloudOff size={13} className="mt-0.5 shrink-0" />
            <span>
              {localDrafts.length} طلب محفوظ على هذا الجهاز فقط (لم يقبله الخادم بعد). الطلبات ذات
              الرقم الرسمي محفوظة على الخادم.
            </span>
          </p>
        )}

        {isError && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50/70 p-2 text-[11px] font-bold text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <span>تعذّر جلب الطلبات من الخادم — تُعرض المسودات المحلية فقط.</span>
            <button
              type="button"
              onClick={() => {
                void refetch();
              }}
              className="rounded bg-rose-600 px-2 py-0.5 text-white hover:bg-rose-700"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {isLoading && (
          <p className="mb-3 text-center text-xs font-bold text-slate-500">
            جارٍ تحميل الطلبات من الخادم...
          </p>
        )}

        <div className="custom-scrollbar flex-1 overflow-y-auto">
          {records.length === 0 ? (
            <div className="py-12 text-center text-xs font-bold text-slate-500">
              لا توجد طلبات مطابقة للعرض حالياً.
            </div>
          ) : (
            <div className="space-y-2">
              {records.map(record => {
                const isMutatingThis =
                  statusMutation.isPending && statusMutation.variables?.recordId === record.id;

                return (
                  <div
                    key={record.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 transition-colors hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-black dark:text-white">
                          {record.title}
                        </span>
                        <span
                          className={
                            'rounded px-1.5 py-0.5 text-[10px] font-extrabold ' +
                            STATUS_CLASSES[record.status]
                          }
                        >
                          {STATUS_LABELS[record.status]}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-1 font-mono">
                          {record.origin === 'server' ? (
                            <Cloud size={12} className="text-emerald-600" />
                          ) : (
                            <CloudOff size={12} className="text-amber-600" />
                          )}
                          <Hash size={12} />
                          {record.number ?? 'بدون رقم (محلي)'}
                        </span>
                        <span
                          className={
                            'rounded px-1.5 py-0.5 text-[10px] font-extrabold ' +
                            (record.origin === 'server'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300')
                          }
                        >
                          {record.origin === 'server' ? 'على الخادم' : 'على هذا الجهاز'}
                        </span>
                        <span className="flex items-center gap-1 font-mono" dir="ltr">
                          <Calendar size={12} />
                          {formatDateTime(record.updatedAt)}
                        </span>
                        {record.supplier?.name && (
                          <span className="flex items-center gap-1 text-blue-700 dark:text-blue-400">
                            <User size={12} />
                            {record.supplier.name}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Package size={12} />
                          {record.itemCount} صنف | كمية {record.totalQuantity}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Lifecycle status transition actions for server records */}
                      {record.origin === 'server' && canIssuePurchaseRequest && (
                        <>
                          {record.status === 'draft' && (
                            <button
                              type="button"
                              disabled={isMutatingThis}
                              onClick={() => handleStatusChange(record, 'sent')}
                              className="flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-extrabold text-blue-800 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
                              title="تحديث الحالة إلى أُرسل للمورد"
                            >
                              <Send size={12} />
                              <span>أُرسل</span>
                            </button>
                          )}
                          {(record.status === 'draft' || record.status === 'sent') && (
                            <>
                              <button
                                type="button"
                                disabled={isMutatingThis}
                                onClick={() => handleStatusChange(record, 'received')}
                                className="flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-extrabold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                                title="تأكيد استلام وتوريد الطلب"
                              >
                                <CheckCircle2 size={12} />
                                <span>تم التوريد</span>
                              </button>
                              <button
                                type="button"
                                disabled={isMutatingThis}
                                onClick={() => handleStatusChange(record, 'cancelled')}
                                className="rounded-md p-1.5 text-rose-600 hover:bg-rose-100 disabled:opacity-50 dark:hover:bg-rose-950"
                                title="إلغاء الطلب"
                              >
                                <Ban size={13} />
                              </button>
                            </>
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          handleOpen(record);
                        }}
                        className="shadow-2xs flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        <ArrowRight size={13} />
                        <span>فتح في الجدول</span>
                      </button>

                      {record.origin === 'local' && (
                        <button
                          type="button"
                          onClick={() => {
                            deleteLocalDraft(record.id);
                          }}
                          className="rounded-md p-1.5 text-rose-500 hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950"
                          title="حذف المسودة المحلية"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-1.5 text-xs font-extrabold text-black hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
