import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MENU_ITEMS } from '../../../core/constants';
import { MenuItem } from '../../../core/types';
import { useTranslation } from '../../../lib/hooks/useTranslation';
import { cn } from '../../../core/utils';
import { useAuthStore } from '../../../features/auth/store';
import { useAllPermissions } from '../../../core/hooks/usePermission';
import { prefetchRoute } from '../../../core/utils/routePrefetcher';
import { ITEM_THEMES, defaultTheme } from './sidebarThemes';

interface SidebarNavProps {
  isCollapsed: boolean;
}

interface SidebarSection {
  id: string;
  label: string;
  ids: readonly string[];
}

const SIDEBAR_SECTIONS: readonly SidebarSection[] = [
  {
    id: 'core',
    label: 'العمليات الأساسية',
    ids: ['dashboard', 'sales', 'purchases', 'bonds', 'inventory', 'clients', 'suppliers', 'pos'],
  },
  {
    id: 'finance',
    label: 'المالية والتحصيل',
    ids: ['debts', 'expenses', 'accounting', 'daily_reconciliation', 'reports'],
  },
  {
    id: 'tools',
    label: 'الأدوات والإدارة',
    ids: ['chat', 'customer_service', 'supplier_portal', 'vin', 'commissions', 'employees', 'settings'],
  },
];

const SidebarNav: React.FC<SidebarNavProps> = ({ isCollapsed }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { permissions, isLoading } = useAllPermissions();

  const isOwner = user?.role?.toLowerCase() === 'owner';

  const filteredItems = useMemo(
    () =>
      MENU_ITEMS.filter(item => {
        if (!item.requiredPermission) return true;
        if (isOwner) return true;
        if (isLoading) return false;
        return permissions.includes(item.requiredPermission);
      }),
    [isOwner, isLoading, permissions]
  );

  const groupedSections = useMemo(() => {
    const byId = new Map(filteredItems.map(item => [item.id, item]));
    const assigned = new Set<string>();

    const sections = SIDEBAR_SECTIONS.map(section => {
      const items: MenuItem[] = [];
      for (const id of section.ids) {
        const match = byId.get(id);
        if (match) {
          items.push(match);
          assigned.add(id);
        }
      }
      return { id: section.id, label: section.label, items };
    });

    const unassigned = filteredItems.filter(item => !assigned.has(item.id));
    if (unassigned.length > 0) {
      sections[sections.length - 1].items.push(...unassigned);
    }

    return sections.filter(section => section.items.length > 0);
  }, [filteredItems]);

  const renderItem = (item: MenuItem) => {
    const isActive =
      item.path === '/'
        ? location.pathname === item.path
        : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

    const theme = ITEM_THEMES[item.id] || defaultTheme;
    const IconComponent = item.icon;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          React.startTransition(() => {
            navigate(item.path);
          });
        }}
        onMouseEnter={() => {
          prefetchRoute(item.path);
        }}
        onFocus={() => {
          prefetchRoute(item.path);
        }}
        title={isCollapsed ? t(item.labelKey) : ''}
        aria-label={t(item.labelKey)}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group relative flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-start text-xs font-bold transition-all duration-200',
          isActive
            ? cn(theme.activeItemBg, 'shadow-sm')
            : 'border-transparent text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-100',
          isCollapsed ? 'justify-center px-0' : ''
        )}
      >
        {/* Active Pill Indicator on edge */}
        {isActive && (
          <span
            className={cn(
              'absolute bottom-2 right-0 top-2 w-1 rounded-l-full',
              theme.activeBadge.split(' ')[0] || 'bg-blue-600'
            )}
          />
        )}

        {/* Vibrant Interactive Icon Badge */}
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-xs transition-all duration-200',
            isActive
              ? theme.activeBadge
              : cn(theme.badgeBg, theme.badgeBorder, theme.iconColor, theme.hoverBadge)
          )}
        >
          <IconComponent
            size={isCollapsed ? 18 : 16}
            className={cn(
              'transition-transform duration-200 group-hover:rotate-3 group-active:scale-90',
              isActive ? 'text-white' : ''
            )}
          />
        </div>

        {/* Label */}
        {!isCollapsed && (
          <span
            className={cn(
              'overflow-hidden whitespace-nowrap transition-transform duration-200 group-hover:translate-x-0.5',
              isActive
                ? theme.activeItemText
                : 'text-slate-700 group-hover:text-slate-950 dark:text-slate-300 dark:group-hover:text-white'
            )}
          >
            {t(item.labelKey)}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav className="scrollbar-hide flex-1 space-y-3 overflow-y-auto px-2 py-3">
      {isCollapsed ? (
        <div className="space-y-1.5">{groupedSections.flatMap(s => s.items).map(renderItem)}</div>
      ) : (
        groupedSections.map(section => (
          <div key={section.id} className="space-y-1">
            <div className="px-2.5 pb-0.5 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {section.label}
            </div>
            <div className="space-y-1">{section.items.map(renderItem)}</div>
          </div>
        ))
      )}
    </nav>
  );
};

export default SidebarNav;
