/* eslint-disable max-lines-per-function, complexity */
import React, { useState, useMemo } from 'react';
import {
  ArrowLeftRight,
  Plus,
  Maximize2,
  Minimize2,
  Sparkles,
  History as HistoryIcon,
  LayoutDashboard,
  GitPullRequest,
  Building2,
} from 'lucide-react';
import NewTransferModal from './NewTransferModal';
import { useTransfers, useWarehouses } from '../hooks/useInventoryManagement';
import { useStockTransferRequests } from '../hooks/useStockTransferRequests';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';
import TableSkeleton from '../../../ui/base/TableSkeleton';
import FullscreenContainer from '../../../ui/base/FullscreenContainer';
import MicroHeader from '@/ui/base/MicroHeader';
import { cn } from '../../../core/utils';
import TransferStats from './transfers/TransferStats';
import TransferHistoryView from './TransferHistoryView';
import TransferSuggestionsView from './TransferSuggestionsView';
import BranchTransferRequestsTab from './transfers/BranchTransferRequestsTab';
import CreateBranchTransferRequestModal from './transfers/CreateBranchTransferRequestModal';

type SubTab = 'requests' | 'history' | 'suggestions' | 'overview';

interface TransferRecord {
  created_at?: string;
  item_count?: number | string;
}

const TransfersView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('requests');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  const { branchId, branchName } = useBranchFilter();
  const { data: transfers, isLoading: isTransfersLoading } = useTransfers();
  const { data: warehouses } = useWarehouses();
  const { data: branchRequests } = useStockTransferRequests('all', branchId);

  // حساب عدد الطلبات الواردة المعلقة لهذا الفرع
  const pendingIncomingCount = useMemo(() => {
    return (branchRequests ?? []).filter(
      r => r.source_branch_id === branchId && r.status === 'pending'
    ).length;
  }, [branchRequests, branchId]);

  const stats = useMemo(() => {
    const transfersArray = transfers !== undefined ? (transfers as unknown as TransferRecord[]) : [];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return {
      total: transfersArray.length,
      thisMonth: transfersArray.filter(t => {
        const createdAt = t.created_at;
        if (typeof createdAt !== 'string') return false;
        const d = new Date(createdAt);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }).length,
      totalItems: transfersArray.reduce((sum: number, t) => {
        const count = typeof t.item_count === 'number' ? t.item_count : Number(t.item_count);
        return sum + (Number.isFinite(count) ? count : 0);
      }, 0),
      warehouseCount: Array.isArray(warehouses) ? warehouses.length : 0,
    };
  }, [transfers, warehouses]);

  if (isTransfersLoading) return <TableSkeleton rows={5} cols={6} />;

  return (
    <FullscreenContainer
      isMaximized={isMaximized}
      onToggleMaximize={() => {
        setIsMaximized(prev => !prev);
      }}
    >
      <div
        className={cn(
          'space-y-4 flex flex-col h-full',
          isMaximized && 'bg-[var(--app-bg)] p-4 md:p-8'
        )}
      >
        {/* الترويسة الموحدة المطابقة للهوية البصرية للتطبيق */}
        <MicroHeader
          icon={ArrowLeftRight}
          title={`إدارة المناقلات وتحويلات المخزون (${branchName ?? 'الفرع الرئيسي'})`}
        />

        {/* بطاقات الإحصائيات العصرية */}
        <TransferStats stats={stats} />

        {/* شريط التبويبات المطور المتناسق مع الهوية البصرية */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/70 p-2 rounded-2xl shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              {
                id: 'requests',
                label: 'طلبات الفروع المتبادلة',
                icon: GitPullRequest,
                badge: pendingIncomingCount > 0 ? pendingIncomingCount : undefined,
              },
              { id: 'history', label: 'سجل المناقلات المنفذة', icon: HistoryIcon },
              { id: 'suggestions', label: 'اقتراحات التوازن الذكي', icon: Sparkles },
              { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveSubTab(tab.id as SubTab);
                }}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200',
                  activeSubTab === tab.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                )}
              >
                <tab.icon size={15} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 font-mono text-[10px] font-black text-white animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* أزرار الإجراءات السريعة في أعلى الصفحة */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsRequestModalOpen(true);
              }}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 shadow-sm transition hover:bg-blue-100 active:scale-95 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300"
            >
              <Building2 size={15} />
              <span>طلب بضاعة من فرع</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsModalOpen(true);
              }}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 text-xs font-bold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700 active:scale-95"
            >
              <Plus size={16} />
              <span>مناقلة مستودعية مباشرة</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsMaximized(prev => !prev);
              }}
              title={isMaximized ? 'تصغير الشاشة' : 'ملء الشاشة'}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400"
            >
              {isMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>

        {/* محتوى التبويب النشط */}
        <div className="flex-1 overflow-hidden">
          {activeSubTab === 'requests' && (
            <div className="h-full animate-in fade-in duration-300">
              <BranchTransferRequestsTab
                onOpenCreateRequestModal={() => {
                  setIsRequestModalOpen(true);
                }}
              />
            </div>
          )}

          {activeSubTab === 'history' && (
            <div className="h-full animate-in fade-in duration-300">
              <TransferHistoryView />
            </div>
          )}

          {activeSubTab === 'suggestions' && (
            <div className="h-full animate-in fade-in duration-300">
              <TransferSuggestionsView />
            </div>
          )}

          {activeSubTab === 'overview' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-inner dark:bg-blue-950/60 dark:text-blue-400">
                  <ArrowLeftRight size={32} />
                </div>
                <div className="mx-auto mt-4 max-w-lg">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    نظام المناقلات والتوزيع الذكي بين الفروع
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    يتيح لك النظام طلب بضائع من أي فرع شقيق، حيث تظهر رسالة تفاعلية فورية لدى الفرع الآخر للموافقة والشحن المباشر، مع تحديث المخزون المحاسبي والفعلي في كلا الفرعين فور الاعتماد.
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRequestModalOpen(true);
                    }}
                    className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-md hover:bg-blue-700 active:scale-95"
                  >
                    <Building2 size={16} />
                    <span>طلب مناقلة من فرع آخر الآن</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(true);
                    }}
                    className="flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Plus size={16} />
                    <span>مناقلة مستودعية مباشرة</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* نافذة المناقلة المباشرة بين المستودعات */}
        <NewTransferModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
          }}
        />

        {/* نافذة إنشاء طلب مناقلة بضاعة من فرع آخر */}
        <CreateBranchTransferRequestModal
          isOpen={isRequestModalOpen}
          onClose={() => {
            setIsRequestModalOpen(false);
          }}
        />
      </div>
    </FullscreenContainer>
  );
};

export default TransfersView;
