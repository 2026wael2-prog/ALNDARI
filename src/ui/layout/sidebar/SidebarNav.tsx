import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MenuItem } from '../../../core/types';
import { useTranslation } from '../../../lib/hooks/useTranslation';
import { cn } from '../../../core/utils';
import { prefetchRoute } from '../../../core/utils/routePrefetcher';
import { useVisibleMenuItems } from '../useVisibleMenuItems';
import { ITEM_THEMES, defaultTheme } from './sidebarThemes';

interface SidebarNavProps {
  isCollapsed: boolean;
}

interface SidebarSection {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  ids: readonly string[];
}

const SIDEBAR_SECTIONS: readonly SidebarSection[] = [
  {
    id: 'core',
    labelKey: 'sidebar_section_core',
    fallbackLabel: 'العمليات الأساسية',
    ids: ['dashboard', 'sales', 'purchases', 'bonds', 'inventory', 'clients', 'suppliers', 'pos'],
  },
  {
    id: 'finance',
    labelKey: 'sidebar_section_finance',
    fallbackLabel: 'المالية والتحصيل',
    ids: ['debts', 'expenses', 'accounting', 'daily_reconciliation', 'reports'],
  },
  {
    id: 'tools',
    labelKey: 'sidebar_section_tools',
    fallbackLabel: 'الأدوات والإدارة',
    ids: ['chat', 'customer_service', 'supplier_portal', 'vin', 'commissions', 'employees', 'settings'],
  },
];

const SidebarNav: React.FC<SidebarNavProps> = ({ isCollapsed }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const filteredItems = useVisibleMenuItems();

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
      const translated = t(section.labelKey);
      const label =
        translated && translated !== section.labelKey ? translated : section.fallbackLabel;
      return { id: section.id, label, items };
    });

    const unassigned = filteredItems.filter(item => !assigned.has(item.id));
    if (unassigned.length > 0) {
      sections[sections.length - 1].items.push(...unassigned);
    }

    return sections.filter(section => section.items.length > 0);
  }, [filteredItems, t]);

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
            : 'border-transparent text-slate-800 hover:bg-slate-100/70 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-800/50 dark:hover:text-white',
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
                : 'text-slate-900 group-hover:text-slate-950 dark:text-slate-100 dark:group-hover:text-white'
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
            <div className="px-2.5 pb-0.5 text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
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
