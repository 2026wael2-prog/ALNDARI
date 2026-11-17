import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  ShoppingCart,
  ReceiptText,
  PackageOpen,
  Users,
  Truck,
  Plus,
  ArrowUpLeft,
} from 'lucide-react';
import { ROUTES } from '../../../core/routes/paths';
import { cn } from '../../../core/utils';
import { prefetchRoute } from '../../../core/utils/routePrefetcher';

interface QuickActionsProps {
  className?: string;
}

interface CoreModuleCard {
  id: string;
  title: string;
  subtitle: string;
  path: string;
  createPath: string;
  createLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accentBg: string;
  accentText: string;
  accentBorder: string;
}

const CORE_MODULES: readonly CoreModuleCard[] = [
  {
    id: 'sales',
    title: 'فواتير البيع',
    subtitle: 'المبيعات، الفواتير، المرتجعات',
    path: ROUTES.DASHBOARD.SALES,
    createPath: `${ROUTES.DASHBOARD.SALES}?tab=create`,
    createLabel: 'فاتورة بيع',
    icon: ShoppingBag,
    accentBg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    accentText: 'text-emerald-600 dark:text-emerald-400',
    accentBorder: 'border-emerald-200/70 dark:border-emerald-800/40',
  },
  {
    id: 'purchases',
    title: 'فواتير الشراء',
    subtitle: 'المشتريات، الاستيراد، المرتجع',
    path: ROUTES.DASHBOARD.PURCHASES,
    createPath: `${ROUTES.DASHBOARD.PURCHASES}?tab=create`,
    createLabel: 'فاتورة شراء',
    icon: ShoppingCart,
    accentBg: 'bg-teal-500/10 dark:bg-teal-500/15',
    accentText: 'text-teal-600 dark:text-teal-400',
    accentBorder: 'border-teal-200/70 dark:border-teal-800/40',
  },
  {
    id: 'bonds',
    title: 'السندات المالية',
    subtitle: 'قبض، صرف، تحويل نقدي',
    path: ROUTES.DASHBOARD.BONDS,
    createPath: `${ROUTES.DASHBOARD.BONDS}?action=new`,
    createLabel: 'سند جديد',
    icon: ReceiptText,
    accentBg: 'bg-amber-500/10 dark:bg-amber-500/15',
    accentText: 'text-amber-600 dark:text-amber-400',
    accentBorder: 'border-amber-200/70 dark:border-amber-800/40',
  },
  {
    id: 'inventory',
    title: 'المنتجات والمخزون',
    subtitle: 'الأصناف، الأرصدة، الجرد',
    path: ROUTES.DASHBOARD.INVENTORY,
    createPath: `${ROUTES.DASHBOARD.INVENTORY}?action=new`,
    createLabel: 'منتج جديد',
    icon: PackageOpen,
    accentBg: 'bg-orange-500/10 dark:bg-orange-500/15',
    accentText: 'text-orange-600 dark:text-orange-400',
    accentBorder: 'border-orange-200/70 dark:border-orange-800/40',
  },
  {
    id: 'clients',
    title: 'العملاء',
    subtitle: 'الحسابات، كشوفات الذمم',
    path: ROUTES.DASHBOARD.CLIENTS,
    createPath: `${ROUTES.DASHBOARD.CLIENTS}?action=new`,
    createLabel: 'عميل جديد',
    icon: Users,
    accentBg: 'bg-sky-500/10 dark:bg-sky-500/15',
    accentText: 'text-sky-600 dark:text-sky-400',
    accentBorder: 'border-sky-200/70 dark:border-sky-800/40',
  },
  {
    id: 'suppliers',
    title: 'الموردين',
    subtitle: 'الموردون، الفواتير المستحقة',
    path: ROUTES.DASHBOARD.SUPPLIERS,
    createPath: `${ROUTES.DASHBOARD.SUPPLIERS}?action=new`,
    createLabel: 'مورد جديد',
    icon: Truck,
    accentBg: 'bg-indigo-500/10 dark:bg-indigo-500/15',
    accentText: 'text-indigo-600 dark:text-indigo-400',
    accentBorder: 'border-indigo-200/70 dark:border-indigo-800/40',
  },
];

/**
 * Compact 6-module Operational Hub on the Dashboard providing one-click access
 * to primary ERP pages as well as direct "+ New" deep-linked creation flows.
 */
export const QuickActions: React.FC<QuickActionsProps> = ({ className }) => {
  const navigate = useNavigate();

  const handleGo = (target: string, baseRoute: string) => {
    prefetchRoute(baseRoute);
    React.startTransition(() => {
      navigate(target);
    });
  };

  return (
    <section
      aria-label="مركز الوصول السريع للعمليات"
      className={cn(
        'rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3.5 shadow-sm',
        className
      )}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-black tracking-tight text-[var(--app-text)]">
            بوابة العمليات السريعة
          </h2>
          <p className="text-[10px] font-semibold text-[var(--app-text-secondary)]">
            وصول فوري للصفحات الأساسية وإنشاء السجلات الجديدة
          </p>
        </div>
        <span className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-0.5 text-[10px] font-black text-[var(--app-text-secondary)]">
          6 وحدات
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CORE_MODULES.map(module => {
          const IconComponent = module.icon;
          return (
            <div
              key={module.id}
              onMouseEnter={() => prefetchRoute(module.path)}
              className="group flex flex-col justify-between gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)]/60 p-2.5 transition-all duration-200 hover:border-[var(--accent)]/40 hover:bg-[var(--app-surface-hover)]"
            >
              <button
                type="button"
                onClick={() => handleGo(module.path, module.path)}
                className="flex w-full items-start gap-2.5 text-start"
              >
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105',
                    module.accentBg,
                    module.accentBorder,
                    module.accentText
                  )}
                >
                  <IconComponent size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-black text-[var(--app-text)]">
                      {module.title}
                    </span>
                    <ArrowUpLeft
                      size={12}
                      className="shrink-0 text-[var(--app-text-secondary)] opacity-60 transition-transform group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
                    />
                  </div>
                  <p className="truncate text-[10px] font-medium text-[var(--app-text-secondary)]">
                    {module.subtitle}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleGo(module.createPath, module.path)}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[10px] font-bold text-[var(--app-text)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent)] hover:text-white"
              >
                <Plus size={12} />
                <span>{module.createLabel}</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default QuickActions;
