import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../auth/store';
import { useFeedbackStore } from '../../feedback/store';
import {
  debtAgentService,
  type AgentTelemetry,
  type AgentActivityItem,
  type AgentQueueItem,
} from '../services/debtAgentService';
import type { DebtFollowupConfigUpdate } from '../types';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';

// eslint-disable-next-line max-lines-per-function, @typescript-eslint/explicit-function-return-type
export const useDebtAgent = () => {
  const companyId = useAuthStore(s => s.user?.company_id);
  const { branchId } = useBranchFilter();
  const queryClient = useQueryClient();
  const { showToast } = useFeedbackStore();

  const telemetryQuery = useQuery<AgentTelemetry>({
    queryKey: ['debts', 'agent', 'telemetry', companyId, branchId],
    queryFn: () => debtAgentService.getTelemetry(companyId ?? '', branchId),
    enabled: Boolean(companyId),
    refetchInterval: 30_000,
  });

  const feedQuery = useQuery<AgentActivityItem[]>({
    queryKey: ['debts', 'agent', 'feed', companyId, branchId],
    queryFn: () => debtAgentService.getActivityFeed(companyId ?? '', 30, branchId),
    enabled: Boolean(companyId),
    refetchInterval: 45_000,
  });

  const queueQuery = useQuery<AgentQueueItem[]>({
    queryKey: ['debts', 'agent', 'queue', companyId, branchId],
    queryFn: () => debtAgentService.getUpcomingQueue(companyId ?? '', branchId),
    enabled: Boolean(companyId),
    refetchInterval: 45_000,
  });

  const toggleAutonomous = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (companyId === undefined || companyId === '') throw new Error('لا توجد جلسة عمل');
      return debtAgentService.toggleAutonomousMode(companyId, enabled);
    },
    onSuccess: data => {
      void queryClient.invalidateQueries({ queryKey: ['debts', 'agent'] });
      void queryClient.invalidateQueries({ queryKey: ['debts', 'followup-config'] });
      showToast(
        data.auto_send_enabled
          ? 'تم تفعيل وضع المتابعة الآلية المستقلة للوكيل بنجاح 🟢'
          : 'تم إيقاف وضع المتابعة الآلية (الوضع اليدوي مفعّل) ⏸️',
        'success'
      );
    },
    onError: (err: Error) => {
      showToast(err.message || 'فشل تعديل حالة الوكيل', 'error');
    },
  });

  const updateGovernance = useMutation({
    mutationFn: async (updates: DebtFollowupConfigUpdate) => {
      if (companyId === undefined || companyId === '') throw new Error('لا توجد جلسة عمل');
      return debtAgentService.updateGovernance(companyId, updates);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['debts', 'agent'] });
      void queryClient.invalidateQueries({ queryKey: ['debts', 'followup-config'] });
      showToast('تم حفظ سياسات وقواعد الوكيل بنجاح ✅', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message || 'فشل تحديث سياسات الوكيل', 'error');
    },
  });

  const drainQueueNow = useMutation({
    mutationFn: async () => {
      if (companyId === undefined || companyId === '') throw new Error('لا توجد جلسة عمل');
      return debtAgentService.triggerDrainQueueNow(companyId);
    },
    onSuccess: res => {
      void queryClient.invalidateQueries({ queryKey: ['debts', 'agent'] });
      showToast(
        `تم تنفيذ جولة الإرسال فوراً (تمت معالجة ${String(res.dispatchedCount)} عملية) 🚀`,
        'success'
      );
    },
    onError: (err: Error) => {
      showToast(err.message || 'تعذر تشغيل جولة الإرسال الفوري', 'error');
    },
  });

  return {
    telemetry: telemetryQuery.data,
    isLoadingTelemetry: telemetryQuery.isLoading,
    feed: feedQuery.data ?? [],
    isLoadingFeed: feedQuery.isLoading,
    queue: queueQuery.data ?? [],
    isLoadingQueue: queueQuery.isLoading,
    toggleAutonomous: toggleAutonomous.mutate,
    isToggling: toggleAutonomous.isPending,
    updateGovernance: updateGovernance.mutate,
    isUpdatingGovernance: updateGovernance.isPending,
    drainQueueNow: drainQueueNow.mutate,
    isDraining: drainQueueNow.isPending,
    refetchAll: (): void => {
      void telemetryQuery.refetch();
      void feedQuery.refetch();
      void queueQuery.refetch();
    },
  };
};

