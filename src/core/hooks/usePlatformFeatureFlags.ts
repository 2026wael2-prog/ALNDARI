import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { DEFAULT_FEATURE_FLAGS, type PlatformFeatureFlags } from '../config/platformDefaults';

// إعادة تصدير النوع للتوافق مع المستهلكين الحاليين (FeatureFlagGate وغيرها)
export type { PlatformFeatureFlags };

/**
 * usePlatformFeatureFlags — جلب مفاتيح الميزات العامة من قاعدة البيانات.
 * يعود بالقيم الافتراضية (كل شيء مفعل) عند فشل الجلب.
 * staleTime: 5 دقائق، وتحديث خلفي هادئ كل 5 دقائق دون إعادة جلب مزعجة عند كل تبديل نافذة.
 */
export const usePlatformFeatureFlags = () => {
  return useQuery({
    queryKey: ['platform_feature_flags'],
    queryFn: async (): Promise<PlatformFeatureFlags> => {
      const { data, error } = await supabase
        .from('system_platform_configs')
        .select('value')
        .eq('key', 'feature_flags')
        .maybeSingle();

      if (error || !data) {
        return DEFAULT_FEATURE_FLAGS;
      }

      const value = data.value;
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return DEFAULT_FEATURE_FLAGS;
      }

      return {
        ...DEFAULT_FEATURE_FLAGS,
        ...(value as unknown as Partial<PlatformFeatureFlags>),
      };
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
};

/**
 * useIsFeatureEnabled — فحص سريع لميزة واحدة.
 * يعيد true عند فشل الجلب (fail-open) حتى لا يُعطَّل شيء بالخطأ.
 */
export const useIsFeatureEnabled = (flag: keyof PlatformFeatureFlags): boolean => {
  const { data: flags } = usePlatformFeatureFlags();
  return flags?.[flag] ?? true;
};
