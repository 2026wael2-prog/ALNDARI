import { MENU_ITEMS } from '../../../core/constants';
import { ROUTES } from '../../../core/routes/paths';
import type { MenuItem } from '../../../core/types';
import type { LucideIcon } from 'lucide-react';
import type { UiLayout } from '../../../lib/themeStore';

/**
 * نموذج الشريط الكلاسيكي (Ribbon) وقوائمه — منطق نقي بلا React، قابل للاختبار.
 * المصدر الوحيد للحقيقة هو MENU_ITEMS: لا مسارات مُختلقة ولا عناصر مكرّرة،
 * وأي عنصر غير موجود أو غير مسموح به يُسقَط تلقائياً.
 */

export interface RibbonGroupSpec {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  itemIds: readonly string[];
}

/** عنصر شريط جاهز للعرض (تسمية مترجمة + مسار + أيقونة). */
export interface RibbonItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface RibbonGroup {
  id: string;
  label: string;
  items: RibbonItem[];
}

export const RIBBON_GROUPS: readonly RibbonGroupSpec[] = [
  {
    id: 'main',
    labelKey: 'ribbon_group_main',
    fallbackLabel: 'الرئيسية',
    itemIds: ['dashboard', 'chat'],
  },
  {
    id: 'sales',
    labelKey: 'ribbon_group_sales',
    fallbackLabel: 'المبيعات والتحصيل',
    itemIds: ['sales', 'pos', 'bonds', 'debts', 'customer_service'],
  },
  {
    id: 'stock',
    labelKey: 'ribbon_group_stock',
    fallbackLabel: 'المشتريات والمخزون',
    itemIds: ['purchases', 'inventory', 'suppliers'],
  },
  {
    id: 'finance',
    labelKey: 'ribbon_group_finance',
    fallbackLabel: 'المالية والمصروفات',
    itemIds: ['expenses', 'accounting', 'commissions', 'daily_reconciliation'],
  },
  {
    id: 'parties',
    labelKey: 'ribbon_group_parties',
    fallbackLabel: 'الأطراف والتحليل',
    itemIds: ['clients', 'employees', 'reports'],
  },
  {
    id: 'admin',
    labelKey: 'ribbon_group_admin',
    fallbackLabel: 'الإدارة والنظام',
    itemIds: ['settings', 'vin', 'supplier_portal'],
  },
];

/**
 * `t()` في هذا المشروع يعيد المفتاح نفسه عند غياب الترجمة، لذا نتحقق من
 * التطابق قبل اعتماد الترجمة — وإلا سقطنا إلى التسمية العربية الصريحة.
 */
const resolveLabel = (
  translate: (key: string) => string,
  key: string,
  fallback: string
): string => {
  const translated = translate(key).trim();
  return translated.length > 0 && translated !== key ? translated : fallback;
};

export const buildRibbonGroups = (
  items: readonly MenuItem[],
  translate: (key: string) => string
): RibbonGroup[] => {
  const byId = new Map(items.map(item => [item.id, item]));

  return RIBBON_GROUPS.map(spec => ({
    id: spec.id,
    label: resolveLabel(translate, spec.labelKey, spec.fallbackLabel),
    items: spec.itemIds.reduce<RibbonItem[]>((acc, id) => {
      const found = byId.get(id);
      if (found) {
        acc.push({
          id: found.id,
          label: translate(found.labelKey),
          path: found.path,
          icon: found.icon,
        });
      }
      return acc;
    }, []),
  })).filter(group => group.items.length > 0);
};

/** كل معرّفات MENU_ITEMS كما هي موزّعة في الشريط (يُستخدم في اختبارات التغطية). */
export const RIBBON_ITEM_IDS: readonly string[] = RIBBON_GROUPS.reduce<string[]>(
  (acc, group) => acc.concat(group.itemIds),
  []
);

export const LAYOUT_ACTIONS: readonly ClassicMenuAction[] = [
  'layout-auto',
  'layout-modern',
  'layout-classic',
];

/** هل هذا الأمر أحد خيارات شكل الواجهة (يُعرض كـ menuitemradio)؟ */
export const isLayoutAction = (action: ClassicMenuAction | undefined): boolean =>
  action !== undefined && LAYOUT_ACTIONS.includes(action);

/** هل الخيار مطابق للشكل الحالي؟ (يُستخدم لعرض علامة التحديد) */
export const isLayoutActionChecked = (
  action: ClassicMenuAction | undefined,
  currentLayout: UiLayout
): boolean => {
  switch (action) {
    case 'layout-auto':
      return currentLayout === 'auto';
    case 'layout-modern':
      return currentLayout === 'modern';
    case 'layout-classic':
      return currentLayout === 'classic';
    default:
      return false;
  }
};

/** مطابقة المسار النشط لعنصر الشريط (يدعم المسارات الفرعية دون '/' الجذر). */
export const isRibbonPathActive = (activePath: string, targetPath: string): boolean => {
  if (targetPath === '/') return activePath === '/';
  return activePath === targetPath || activePath.startsWith(`${targetPath}/`);
};

/** العنصر المطابق للمسار الحالي (لتسمية الصفحة في شريط العنوان). */
export const findMenuItemForPath = (pathname: string): MenuItem | undefined =>
  MENU_ITEMS.find(item => isRibbonPathActive(pathname, item.path));

export type ClassicMenuAction =
  | 'toggle-theme'
  | 'layout-auto'
  | 'layout-modern'
  | 'layout-classic'
  | 'toggle-ribbon';

export interface ClassicMenuEntry {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  path?: string;
  action?: ClassicMenuAction;
}

export interface ClassicMenuSpec {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  entries: readonly ClassicMenuEntry[];
}

export interface ClassicMenu {
  id: string;
  label: string;
  entries: Array<ClassicMenuEntry & { label: string }>;
}

export const CLASSIC_MENUS: readonly ClassicMenuSpec[] = [
  {
    id: 'file',
    labelKey: 'menu_file',
    fallbackLabel: 'ملف',
    entries: [
      {
        id: 'dashboard',
        labelKey: 'menu_dashboard',
        fallbackLabel: 'لوحة التحكم',
        path: ROUTES.DASHBOARD.ROOT,
      },
      {
        id: 'appearance',
        labelKey: 'menu_appearance',
        fallbackLabel: 'المظهر والثيمات',
        path: ROUTES.DASHBOARD.APPEARANCE,
      },
      {
        id: 'settings',
        labelKey: 'settings',
        fallbackLabel: 'الإعدادات',
        path: ROUTES.DASHBOARD.SETTINGS,
      },
    ],
  },
  {
    id: 'view',
    labelKey: 'menu_view',
    fallbackLabel: 'عرض',
    entries: [
      {
        id: 'toggle-theme',
        labelKey: 'menu_toggle_theme',
        fallbackLabel: 'تبديل الوضع الليلي/النهاري',
        action: 'toggle-theme',
      },
      {
        id: 'layout-auto',
        labelKey: 'menu_layout_auto',
        fallbackLabel: 'شكل الواجهة: تلقائي (يتبع الثيم)',
        action: 'layout-auto',
      },
      {
        id: 'layout-modern',
        labelKey: 'menu_layout_modern',
        fallbackLabel: 'شكل الواجهة: حديث (شريط جانبي)',
        action: 'layout-modern',
      },
      {
        id: 'layout-classic',
        labelKey: 'menu_layout_classic',
        fallbackLabel: 'شكل الواجهة: كلاسيكي (قوائم وشريط أوامر)',
        action: 'layout-classic',
      },
      {
        id: 'toggle-ribbon',
        labelKey: 'menu_toggle_ribbon',
        fallbackLabel: 'طي/بسط شريط الأوامر',
        action: 'toggle-ribbon',
      },
    ],
  },
  {
    id: 'reports',
    labelKey: 'menu_reports',
    fallbackLabel: 'التقارير',
    entries: [
      {
        id: 'reports',
        labelKey: 'reports',
        fallbackLabel: 'التقارير',
        path: ROUTES.DASHBOARD.REPORTS,
      },
      {
        id: 'daily-reconciliation',
        labelKey: 'daily_reconciliation',
        fallbackLabel: 'المطابقة اليومية',
        path: ROUTES.DASHBOARD.DAILY_RECONCILIATION,
      },
      {
        id: 'commissions-reports',
        labelKey: 'commission_reports',
        fallbackLabel: 'تقارير العمولات',
        path: ROUTES.DASHBOARD.COMMISSIONS_REPORTS,
      },
    ],
  },
];

export const buildClassicMenus = (translate: (key: string) => string): ClassicMenu[] =>
  CLASSIC_MENUS.map(spec => ({
    id: spec.id,
    label: resolveLabel(translate, spec.labelKey, spec.fallbackLabel),
    entries: spec.entries.map(entry => ({
      ...entry,
      label: resolveLabel(translate, entry.labelKey, entry.fallbackLabel),
    })),
  }));

/** عدد عناصر MENU_ITEMS المتاحة فعلياً في هذا الإصدار (للتوثيق والاختبارات). */
export const MENU_ITEM_COUNT = MENU_ITEMS.length;
