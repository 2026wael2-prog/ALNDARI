import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../auth/store';
import { useFeedbackStore } from '../../feedback/store';
import { assertPermission } from '../../../core/hooks/usePermission';
import { intelligenceService } from '../services/intelligenceService';
import type { EngineConfig, RecommendationStatus } from '../types';
import { DEFAULT_ENGINE_CONFIG } from '../types';

export function useInventoryIntelligence() {
  const { user } = useAuthStore();
  const companyId = user?.company_id ?? '';

  return useQuery({
    queryKey: ['inventory_intelligence', 'v2', companyId],
    queryFn: () => intelligenceService.loadAndRunAnalysis(companyId),
    enabled: Boolean(companyId),
    staleTime: 5 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    retry: 0,
    refetchOnWindowFocus: false,
  });
}

export function useIntelligenceConfig() {
  const { user } = useAuthStore();
  const companyId = user?.company_id ?? '';

  return useQuery({
    queryKey: ['inventory_intelligence_config', companyId],
    queryFn: () => intelligenceService.getConfig(companyId),
    enabled: Boolean(companyId),
    initialData: DEFAULT_ENGINE_CONFIG,
  });
}

export function useRecommendationHistory() {
  const { user } = useAuthStore();
  const companyId = user?.company_id ?? '';

  return useQuery({
    queryKey: ['inventory_intelligence_history', companyId],
    queryFn: () => intelligenceService.getRecommendationHistory(companyId),
    enabled: Boolean(companyId),
  });
}

export function useIntelligenceRuns() {
  const { user } = useAuthStore();
  const companyId = user?.company_id ?? '';

  return useQuery({
    queryKey: ['inventory_intelligence_runs', companyId],
    queryFn: () => intelligenceService.getRunHistory(companyId),
    enabled: Boolean(companyId),
  });
}

export function useIntelligenceMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();

  const decideRecommendation = useMutation({
    mutationFn: async (params: {
      recType: 'transfer' | 'purchase' | 'excess_review';
      productId: string;
      productName?: string;
      fromBranchId?: string | null;
      toBranchId?: string | null;
      supplierId?: string | null;
      recommendedQty: number;
      approvedQty?: number | null;
      urgency: string;
      confidenceScore: number;
      reason: string;
      status: RecommendationStatus;
      decisionReason?: string;
      calculationBreakdown?: Record<string, unknown>;
    }) => {
      if (!user?.company_id || !user?.id) throw new Error('جلسة العمل منتهية');
      await assertPermission('inventory:update', 'اعتماد توصيات ذكاء المخزون');
      return intelligenceService.decideRecommendation({
        ...params,
        companyId: user.company_id,
        userId: user.id,
      });
    },
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory_intelligence_history'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory_intelligence'] });
      const msg =
        vars.status === 'approved'
          ? 'تم اعتماد التوصية وتسجيلها في سجل القرارات'
          : vars.status === 'modified'
            ? 'تم تعديل الكمية واعتماد التوصية'
            : vars.status === 'rejected'
              ? 'تم رفض التوصية مع تسجيل السبب'
              : 'تم تأجيل التوصية';
      showToast(msg, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message || 'تعذر حفظ القرار', 'error');
    },
  });

  const saveConfig = useMutation({
    mutationFn: async (config: EngineConfig) => {
      if (!user?.company_id || !user?.id) throw new Error('جلسة العمل منتهية');
      await assertPermission('settings:update', 'تعديل سياسات ذكاء المخزون');
      return intelligenceService.saveConfig(user.company_id, user.id, config);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory_intelligence_config'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory_intelligence'] });
      showToast('تم حفظ إعدادات المحرك وإعادة احتساب التوقعات', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message || 'تعذر حفظ الإعدادات', 'error');
    },
  });

  const reviewAlternative = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      if (!user?.id) throw new Error('جلسة العمل منتهية');
      await assertPermission('inventory:update', 'مراجعة البدائل المتوافقة');
      return intelligenceService.reviewAlternative(id, user.id, status);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory_intelligence'] });
      showToast('تم تحديث حالة البديل بنجاح', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message || 'تعذر تحديث البديل', 'error');
    },
  });

  return {
    decideRecommendation: decideRecommendation.mutateAsync,
    isDeciding: decideRecommendation.isPending,
    saveConfig: saveConfig.mutateAsync,
    isSavingConfig: saveConfig.isPending,
    reviewAlternative: reviewAlternative.mutateAsync,
    isReviewingAlternative: reviewAlternative.isPending,
  };
}
