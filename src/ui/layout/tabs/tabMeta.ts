/* eslint-disable complexity, max-lines-per-function */
/**
 * Workspace Tab Meta & Resolvers — تعريف مسميات وأيقونات التبويبات بحسب مسار الصفحة.
 * موحّدة بالكامل مع تسميات الواجهة الحديثة (الشريط الجانبي) والواجهة الكلاسيكية (شريط الأوامر).
 *
 * @module ui/layout/tabs/tabMeta
 */

import {
  LayoutDashboard,
  ShoppingBag,
  ShoppingCart,
  Store,
  Package,
  BrainCircuit,
  Receipt,
  FileText,
  Users,
  Truck,
  Building2,
  Calculator,
  BarChart3,
  MessageSquare,
  Settings,
  Car,
  ReceiptText,
  Scale,
  Shield,
  Palette,
  Layers,
  Headphones,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '../../../core/routes/paths';

export interface TabMetaInfo {
  title: string;
  labelKey?: string;
  iconKey: string;
  IconComponent: LucideIcon;
}

export const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  ShoppingBag,
  ShoppingCart,
  Store,
  Package,
  BrainCircuit,
  Receipt,
  FileText,
  Users,
  Truck,
  Building2,
  Calculator,
  BarChart3,
  MessageSquare,
  Settings,
  Car,
  ReceiptText,
  Scale,
  Shield,
  Palette,
  Layers,
  Headphones,
};

type Translator = (key: string) => string;

const resolveTabTitle = (
  translate: Translator | undefined,
  labelKey: string,
  fallback: string
): string => {
  if (!translate) return fallback;
  const translated = translate(labelKey).trim();
  return translated.length > 0 && translated !== labelKey ? translated : fallback;
};

/**
 * استخراج بيانات العنوان والأيقونة بحسب مسار الصفحة
 * يدعم تمرير دالة الترجمة `t` لتوحيد التبويبات مع اللغة النشطة (عربي/إنجليزي) والواجهتين الحديثة والكلاسيكية.
 */
export function getTabMeta(pathname: string, translate?: Translator): TabMetaInfo {
  const cleanPath = pathname.split('?')[0].split('#')[0];

  if (cleanPath === '/' || cleanPath === ROUTES.DASHBOARD.ROOT) {
    return {
      title: resolveTabTitle(translate, 'overview', 'الرئيسية'),
      labelKey: 'overview',
      iconKey: 'LayoutDashboard',
      IconComponent: LayoutDashboard,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.POS) {
    return {
      title: resolveTabTitle(translate, 'pos', 'نقطة البيع'),
      labelKey: 'pos',
      iconKey: 'Store',
      IconComponent: Store,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.SALES) {
    return {
      title: resolveTabTitle(translate, 'invoices', 'المبيعات'),
      labelKey: 'invoices',
      iconKey: 'ShoppingBag',
      IconComponent: ShoppingBag,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.PURCHASES) {
    return {
      title: resolveTabTitle(translate, 'purchases', 'المشتريات'),
      labelKey: 'purchases',
      iconKey: 'ShoppingCart',
      IconComponent: ShoppingCart,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.BONDS) {
    return {
      title: resolveTabTitle(translate, 'receipts', 'السندات المالية'),
      labelKey: 'receipts',
      iconKey: 'FileText',
      IconComponent: FileText,
    };
  }

  if (cleanPath.startsWith(ROUTES.DASHBOARD.DEBTS)) {
    return {
      title: resolveTabTitle(translate, 'debts', 'الديون والتحصيل'),
      labelKey: 'debts',
      iconKey: 'Scale',
      IconComponent: Scale,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.CUSTOMER_SERVICE) {
    return {
      title: resolveTabTitle(translate, 'customer_service', 'خدمة العملاء والواتساب'),
      labelKey: 'customer_service',
      iconKey: 'Headphones',
      IconComponent: Headphones,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.CLIENTS || cleanPath === '/parties') {
    return {
      title: resolveTabTitle(translate, 'customers', 'العملاء'),
      labelKey: 'customers',
      iconKey: 'Users',
      IconComponent: Users,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.SUPPLIERS) {
    return {
      title: resolveTabTitle(translate, 'suppliers', 'الموردون'),
      labelKey: 'suppliers',
      iconKey: 'Truck',
      IconComponent: Truck,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.EMPLOYEES) {
    return {
      title: resolveTabTitle(translate, 'employees', 'الموظفون'),
      labelKey: 'employees',
      iconKey: 'Users',
      IconComponent: Users,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.INVENTORY_INTELLIGENCE) {
    return {
      title: resolveTabTitle(translate, 'inventory_intelligence', 'ذكاء المخزون'),
      labelKey: 'inventory_intelligence',
      iconKey: 'BrainCircuit',
      IconComponent: BrainCircuit,
    };
  }

  if (cleanPath.startsWith(ROUTES.DASHBOARD.INVENTORY)) {
    if (cleanPath.includes('audit')) {
      return {
        title: resolveTabTitle(translate, 'audit_stock_title', 'جرد المخزون'),
        labelKey: 'audit_stock_title',
        iconKey: 'Layers',
        IconComponent: Layers,
      };
    }
    return {
      title: resolveTabTitle(translate, 'products', 'المخزون'),
      labelKey: 'products',
      iconKey: 'Package',
      IconComponent: Package,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.EXPENSES) {
    return {
      title: resolveTabTitle(translate, 'expenses', 'المصروفات'),
      labelKey: 'expenses',
      iconKey: 'ReceiptText',
      IconComponent: ReceiptText,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.ACCOUNTING) {
    return {
      title: resolveTabTitle(translate, 'accounting', 'المحاسبة'),
      labelKey: 'accounting',
      iconKey: 'Calculator',
      IconComponent: Calculator,
    };
  }

  if (cleanPath.startsWith(ROUTES.DASHBOARD.COMMISSIONS)) {
    return {
      title: resolveTabTitle(translate, 'commission_dashboard', 'العمولات'),
      labelKey: 'commission_dashboard',
      iconKey: 'Calculator',
      IconComponent: Calculator,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.REPORTS) {
    return {
      title: resolveTabTitle(translate, 'reports', 'التقارير'),
      labelKey: 'reports',
      iconKey: 'BarChart3',
      IconComponent: BarChart3,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.CHAT) {
    return {
      title: resolveTabTitle(translate, 'internal_chat', 'المحادثات والتواصل'),
      labelKey: 'internal_chat',
      iconKey: 'MessageSquare',
      IconComponent: MessageSquare,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.APPEARANCE) {
    return {
      title: resolveTabTitle(translate, 'menu_appearance', 'المظهر والسمات'),
      labelKey: 'menu_appearance',
      iconKey: 'Palette',
      IconComponent: Palette,
    };
  }

  if (cleanPath.startsWith(ROUTES.DASHBOARD.SETTINGS)) {
    return {
      title: resolveTabTitle(translate, 'settings', 'الإعدادات'),
      labelKey: 'settings',
      iconKey: 'Settings',
      IconComponent: Settings,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.VIN) {
    return {
      title: resolveTabTitle(translate, 'vin_intelligence', 'ذكاء الشاصي (VIN)'),
      labelKey: 'vin_intelligence',
      iconKey: 'Car',
      IconComponent: Car,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.DAILY_RECONCILIATION) {
    return {
      title: resolveTabTitle(translate, 'daily_reconciliation', 'المطابقة اليومية'),
      labelKey: 'daily_reconciliation',
      iconKey: 'Scale',
      IconComponent: Scale,
    };
  }

  if (cleanPath === ROUTES.DASHBOARD.SUPPLIER_PORTAL) {
    return {
      title: resolveTabTitle(translate, 'supplier_portal', 'بوابة الموردين'),
      labelKey: 'supplier_portal',
      iconKey: 'Building2',
      IconComponent: Building2,
    };
  }

  if (cleanPath.startsWith(ROUTES.ADMIN.ROOT)) {
    return {
      title: resolveTabTitle(translate, 'admin_hub_title', 'لوحة الإدارة'),
      labelKey: 'admin_hub_title',
      iconKey: 'Shield',
      IconComponent: Shield,
    };
  }

  const parts = cleanPath.split('/').filter(Boolean);
  const fallbackTitle = parts.length > 0 ? parts[parts.length - 1] : 'شاشة';
  return { title: fallbackTitle, iconKey: 'Layers', IconComponent: Layers };
}

/**
 * قائمة الشاشات السريعة لزر الإضافة (+) في شريط التبويبات — موحّدة مع التسميات الرسمية
 */
export const QUICK_LAUNCH_ITEMS = [
  { path: ROUTES.DASHBOARD.SALES, labelKey: 'invoices', title: 'المبيعات', iconKey: 'ShoppingBag' },
  { path: ROUTES.DASHBOARD.PURCHASES, labelKey: 'purchases', title: 'المشتريات', iconKey: 'ShoppingCart' },
  { path: ROUTES.DASHBOARD.POS, labelKey: 'pos', title: 'نقطة البيع', iconKey: 'Store' },
  { path: ROUTES.DASHBOARD.BONDS, labelKey: 'receipts', title: 'السندات المالية', iconKey: 'FileText' },
  { path: ROUTES.DASHBOARD.CLIENTS, labelKey: 'customers', title: 'العملاء', iconKey: 'Users' },
  { path: ROUTES.DASHBOARD.SUPPLIERS, labelKey: 'suppliers', title: 'الموردون', iconKey: 'Truck' },
  { path: ROUTES.DASHBOARD.EMPLOYEES, labelKey: 'employees', title: 'الموظفون', iconKey: 'Users' },
  { path: ROUTES.DASHBOARD.INVENTORY, labelKey: 'products', title: 'المخزون', iconKey: 'Package' },
  { path: ROUTES.DASHBOARD.ACCOUNTING, labelKey: 'accounting', title: 'المحاسبة', iconKey: 'Calculator' },
  { path: ROUTES.DASHBOARD.EXPENSES, labelKey: 'expenses', title: 'المصروفات', iconKey: 'ReceiptText' },
  { path: ROUTES.DASHBOARD.REPORTS, labelKey: 'reports', title: 'التقارير', iconKey: 'BarChart3' },
  { path: ROUTES.DASHBOARD.CHAT, labelKey: 'internal_chat', title: 'المحادثات والتواصل', iconKey: 'MessageSquare' },
  { path: ROUTES.DASHBOARD.CUSTOMER_SERVICE, labelKey: 'customer_service', title: 'خدمة العملاء والواتساب', iconKey: 'Headphones' },
];
