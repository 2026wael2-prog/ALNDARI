import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../../../core/constants';
import { useTranslation } from '../../../lib/hooks/useTranslation';
import { useThemeStore } from '../../../lib/themeStore';
import { useVisibleMenuItems } from '../useVisibleMenuItems';
import { buildClassicMenus, buildRibbonGroups } from './ribbonModel';
import type { ClassicMenu, ClassicMenuAction, RibbonGroup } from './ribbonModel';
import type { UiLayout } from '../../../lib/themeStore';

export interface ClassicChromeModel {
  uiLayout: UiLayout;
  theme: 'light' | 'dark';
  menus: ClassicMenu[];
  ribbonGroups: RibbonGroup[];
  ribbonCollapsed: boolean;
  handleAction: (action: ClassicMenuAction) => void;
}

const readRibbonCollapsed = (): boolean =>
  typeof window !== 'undefined' &&
  window.localStorage.getItem(STORAGE_KEYS.CLASSIC_RIBBON_COLLAPSED) === '1';

/**
 * حالة القشرة الكلاسيكية (تفضيل الشكل، طي الشريط، القوائم والأوامر).
 * منفصلة عن العرض كي يبقى المكوّن مسؤولاً عن التخطيط فقط.
 */
export const useClassicChrome = (): ClassicChromeModel => {
  const { t } = useTranslation();
  const uiLayout = useThemeStore(state => state.uiLayout);
  const theme = useThemeStore(state => state.theme);
  const setUiLayout = useThemeStore(state => state.setUiLayout);
  const toggleTheme = useThemeStore(state => state.toggleTheme);
  const visibleItems = useVisibleMenuItems();
  const [ribbonCollapsed, setRibbonCollapsed] = useState(readRibbonCollapsed);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEYS.CLASSIC_RIBBON_COLLAPSED,
      ribbonCollapsed ? '1' : '0'
    );
  }, [ribbonCollapsed]);

  const handleAction = (action: ClassicMenuAction): void => {
    switch (action) {
      case 'toggle-theme':
        toggleTheme();
        break;
      case 'layout-auto':
        setUiLayout('auto');
        break;
      case 'layout-modern':
        setUiLayout('modern');
        break;
      case 'layout-classic':
        setUiLayout('classic');
        break;
      case 'toggle-ribbon':
        setRibbonCollapsed(previous => !previous);
        break;
    }
  };

  return {
    uiLayout,
    theme,
    menus: buildClassicMenus(t),
    ribbonGroups: buildRibbonGroups(visibleItems, t),
    ribbonCollapsed,
    handleAction,
  };
};
