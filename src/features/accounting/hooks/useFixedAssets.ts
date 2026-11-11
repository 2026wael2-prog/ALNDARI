import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../auth/store';
import { useFeedbackStore } from '../../feedback/store';
import { fixedAssetService, type CreateFixedAssetInput } from '../services/fixedAssetService';
import { assertPermission } from '../../../core/hooks/usePermission';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';

interface DepreciationBatchResult {
  assets_processed?: number;
  total_amount?: number;
  error_count?: number;
  errors?: Array<{ asset_code: string; reason: string }>;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const useFixedAssets = () => {
  const { user } = useAuthStore();
  const { branchId } = useBranchFilter();
  return useQuery({
    queryKey: ['fixed_assets', user?.company_id, branchId],
    queryFn: async () => {
      if (user?.company_id === undefined || user.company_id === '') return [];
      return await fixedAssetService.getAssets(user.company_id, branchId);
    },
    enabled: Boolean(user?.company_id),
  });
};

const notifyDepreciationSummary = (
  showToast: (msg: string, type: 'info' | 'success' | 'warning' | 'error') => void,
  data: DepreciationBatchResult | null
): void => {
  const processed = data?.assets_processed ?? 0;
  const total = data?.total_amount ?? 0;
  const errors = data?.errors;
  const errCount = data?.error_count ?? 0;
  showToast(
    `تم تشغيل الإهلاك الدوري بنجاح لـ ${String(processed)} أصل بإجمالي ${String(total)} ر.س`,
    'success'
  );
  if (errCount > 0 && Array.isArray(errors)) {
    const assetNames = errors.map(e => `${e.asset_code}: ${e.reason}`).join(' ، ');
    showToast(`تعذّر إهلاك ${String(errCount)} أصل: ${assetNames}`, 'warning');
  }
};

// eslint-disable-next-line max-lines-per-function, @typescript-eslint/explicit-function-return-type
export const useFixedAssetMutations = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const { branchId } = useBranchFilter();

  const invalidateAssetsAndReports = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['fixed_assets'] });
    void queryClient.invalidateQueries({ queryKey: ['financials'] });
    void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    void queryClient.invalidateQueries({ queryKey: ['trial_balance'] });
  };

  const createAsset = useMutation({
    mutationFn: async (input: CreateFixedAssetInput): Promise<unknown> => {
      if (user?.company_id === undefined || user.company_id === '') throw new Error('No Company ID');
      await assertPermission('accounting:create', 'تسجيل أصول ثابتة');
      return fixedAssetService.createAsset(user.company_id, {
        ...input,
        branch_id: input.branch_id ?? branchId ?? null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fixed_assets'] });
      showToast('تم تسجيل الأصل الثابت بنجاح', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const postSingleDepreciation = useMutation({
    mutationFn: async ({ assetId, periodDate }: { assetId: string; periodDate?: string }): Promise<unknown> => {
      await assertPermission('accounting:create', 'ترحيل إهلاك الأصول');
      return fixedAssetService.postAssetDepreciation(assetId, periodDate);
    },
    onSuccess: () => {
      invalidateAssetsAndReports();
      showToast('تم احتساب وإثبات قيد إهلاك الأصل بنجاح', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const runAllDepreciation = useMutation({
    mutationFn: async (periodDate?: string | void): Promise<DepreciationBatchResult | null> => {
      if (user?.company_id === undefined || user.company_id === '') throw new Error('No Company ID');
      await assertPermission('accounting:create', 'تشغيل الإهلاك الدوري');
      return await fixedAssetService.runAllAssetsDepreciation(
        user.company_id,
        typeof periodDate === 'string' && periodDate !== '' ? periodDate : undefined
      );
    },
    onSuccess: (data: DepreciationBatchResult | null) => {
      invalidateAssetsAndReports();
      notifyDepreciationSummary(showToast, data);
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  return {
    createAsset: createAsset.mutateAsync,
    isCreating: createAsset.isPending,
    postSingleDepreciation: postSingleDepreciation.mutateAsync,
    isDepreciatingSingle: postSingleDepreciation.isPending,
    runAllDepreciation: runAllDepreciation.mutateAsync,
    isRunningAll: runAllDepreciation.isPending,
  };
};
