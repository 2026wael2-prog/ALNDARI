/* eslint-disable max-lines-per-function, complexity, @typescript-eslint/strict-boolean-expressions */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';
import { useStockTransferRequests, type StockTransferRequest } from '../../hooks/useStockTransferRequests';
import { useBranchTransferSubscription } from '../../hooks/useBranchTransferSubscription';
import { useSoundStore } from '@/features/notifications/store';
import { IncomingTransferApprovalModal } from './IncomingTransferApprovalModal';
import { TransferDispatchedNotificationModal } from './TransferDispatchedNotificationModal';

export const BranchTransferAlertRunner: React.FC = () => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;
  const { branchId } = useBranchFilter();

  const [activeIncomingRequests, setActiveIncomingRequests] = useState<StockTransferRequest[] | null>(null);
  const [activeDispatchedRequests, setActiveDispatchedRequests] = useState<StockTransferRequest[] | null>(null);

  // تتبع المعرفات التي تم تنبيه المستخدم بها لمنع التكرار المزعج في نفس الجلسة
  const notifiedIncomingIdsRef = useRef<Set<string>>(new Set());
  const notifiedDispatchedIdsRef = useRef<Set<string>>(new Set());

  // جلب الطلبات الواردة المعلقة لفرع المستخدم الحالي
  const { data: requests, refetch } = useStockTransferRequests('all', branchId);

  const handleRealtimeUpdate = useCallback(() => {
    void refetch();
  }, [refetch]);

  // الاشتراك اللحظي في Supabase Realtime عبر هوك الطبقة الخدمية
  useBranchTransferSubscription(companyId, branchId, handleRealtimeUpdate);

  // 1. التحقق من الطلبات الواردة المعلقة وتنبيه الفرع المصدر فوراً بحزمة الأصناف
  useEffect(() => {
    if (!branchId || !requests || requests.length === 0) return;

    // البحث عن أحدث طلب وارد معلق موجه لهذا الفرع ولم يسبق إظهار نافذته
    const pendingIncoming = requests.find(
      r => r.source_branch_id === branchId && r.status === 'pending' && !notifiedIncomingIdsRef.current.has(r.id)
    );

    if (pendingIncoming && !activeIncomingRequests) {
      let group: StockTransferRequest[] = [];
      if (pendingIncoming.batch_id) {
        group = requests.filter(
          r => r.batch_id === pendingIncoming.batch_id && r.status === 'pending'
        );
      } else {
        const reqTime = new Date(pendingIncoming.created_at).getTime();
        group = requests.filter(
          r =>
            r.requester_branch_id === pendingIncoming.requester_branch_id &&
            r.source_branch_id === branchId &&
            r.status === 'pending' &&
            Math.abs(new Date(r.created_at).getTime() - reqTime) < 60000
        );
      }

      if (group.length === 0) group = [pendingIncoming];

      for (const item of group) {
        notifiedIncomingIdsRef.current.add(item.id);
      }
      setActiveIncomingRequests(group);
      void useSoundStore.getState().playNotificationSound('urgent', true);
    }

    // البحث عن أحدث طلب مكتمل أو معالج للفرع الطالب لإشعاره
    const justResolved = requests.find(
      r =>
        r.requester_branch_id === branchId &&
        (r.status === 'completed' || r.status === 'rejected') &&
        !notifiedDispatchedIdsRef.current.has(r.id)
    );

    if (justResolved && !activeDispatchedRequests) {
      const updatedAt = new Date(justResolved.updated_at).getTime();
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      if (updatedAt > tenMinutesAgo) {
        let group: StockTransferRequest[] = [];
        if (justResolved.batch_id) {
          group = requests.filter(
            r => r.batch_id === justResolved.batch_id && (r.status === 'completed' || r.status === 'rejected')
          );
        } else {
          group = [justResolved];
        }

        if (group.length === 0) group = [justResolved];

        for (const item of group) {
          notifiedDispatchedIdsRef.current.add(item.id);
        }
        setActiveDispatchedRequests(group);
        void useSoundStore.getState().playNotificationSound('high', true);
      }
    }
  }, [requests, branchId, activeIncomingRequests, activeDispatchedRequests]);

  // 2. مؤقت فحص دوري كل 25 ثانية (Smart Fallback Polling) لضمان عدم تفويت أي طلب
  useEffect(() => {
    if (!companyId || !branchId) return;

    const timer = setInterval(() => {
      void refetch();
    }, 25000);

    return () => {
      clearInterval(timer);
    };
  }, [companyId, branchId, refetch]);

  return (
    <>
      {/* النافذة المنبثقة للفرع المطلوب منه: مراجعة والموافقة وتحديد الكميات لكافة الأصناف */}
      <IncomingTransferApprovalModal
        requests={activeIncomingRequests}
        isOpen={Boolean(activeIncomingRequests && activeIncomingRequests.length > 0)}
        onClose={() => {
          setActiveIncomingRequests(null);
        }}
      />

      {/* النافذة المنبثقة للفرع الطالب: إشعار بأن الأصناف تم شحنها واعتمادها بنجاح */}
      <TransferDispatchedNotificationModal
        requests={activeDispatchedRequests}
        isOpen={Boolean(activeDispatchedRequests && activeDispatchedRequests.length > 0)}
        onClose={() => {
          setActiveDispatchedRequests(null);
        }}
        onViewTransfers={() => {
          window.location.hash = '#/inventory';
        }}
      />
    </>
  );
};

export default BranchTransferAlertRunner;
