import { useMemo } from 'react';
import { THEME_PRESETS } from '../../features/appearance/constants';
import { useThemeStore } from '../../lib/themeStore';
import { useBreakpoint } from '../../lib/hooks/useBreakpoint';
import type { UiLayout } from '../../lib/themeStore';

/**
 * شكل الهيكل الفعلي المعروض.
 * - 'modern'  : شريط جانبي + ترويسة (يعمل على كل المقاسات).
 * - 'classic' : قوائم + شريط أوامر — شاشات عريضة فقط (lg = 1024px فأعلى).
 */
export type ShellVariant = 'modern' | 'classic';

/**
 * دالة نقية قابلة للاختبار: تدمج تفضيل المستخدم مع اقتراح الثيم مع مقاس الشاشة.
 * الشكل الكلاسيكي يُقيَّد بالشاشات العريضة كي لا تُفقد تجربة الهاتف/الآيباد الطولي
 * (شريط سفلي + Drawer من ADR-014)، ويلزم الشريط عرضاً لا يوفره 768px.
 */
export const resolveShellVariant = (
  uiLayout: UiLayout,
  presetLayout: ShellVariant | undefined,
  isWideScreen: boolean
): ShellVariant => {
  if (!isWideScreen) return 'modern';
  if (uiLayout === 'auto') return presetLayout ?? 'modern';
  return uiLayout;
};

export const useLayoutVariant = (): ShellVariant => {
  const uiLayout = useThemeStore(state => state.uiLayout);
  const activePresetId = useThemeStore(state => state.activePresetId);
  const isWideScreen = useBreakpoint('lg');

  const presetLayout = useMemo(
    () => THEME_PRESETS.find(preset => preset.id === activePresetId)?.layout,
    [activePresetId]
  );

  return resolveShellVariant(uiLayout, presetLayout, isWideScreen);
};
