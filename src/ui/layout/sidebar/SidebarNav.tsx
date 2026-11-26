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

const SHORTCUT_HINTS: Record<string, string> = {
  sales: 'Ctrl+ف',
  inventory: 'Ctrl+م',
  clients: 'Ctrl+ك',
  bonds: 'Ctrl+ق',
};

const SidebarNav: React.FC<SidebarNavProps> = ({ isCollapsed }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const filteredItems = useVisibleMenuItems();
  const prefetchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleItemHover = React.useCallback((path: string) => {
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = setTimeout(() => {
      prefetchRoute(path);
    }, 80);
  }, []);

  const handleItemLeave = React.useCallback(() => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  }, []);

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
          navigate(item.path);
        }}
        onMouseEnter={() => handleItemHover(item.path)}
        onMouseLeave={handleItemLeave}
        onFocus={() => prefetchRoute(item.path)}
        title={isCollapsed ? t(item.labelKey) : ''}
        aria-label={t(item.labelKey)}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group relative flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-start text-xs font-bold transition-all duration-150',
          isActive
            ? 'border-[#6b452a] bg-[#432918] text-white shadow-sm'
            : 'border-transparent text-white/90 hover:bg-white/10 hover:text-white',
          isCollapsed ? 'justify-center px-0' : ''
        )}
      >
        {/* Active Pill Indicator on edge */}
        {isActive && (
          <span
            className="absolute bottom-2 right-0 top-2 w-1 rounded-l-full bg-amber-500"
          />
        )}

        {/* Vibrant Interactive Icon Badge */}
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-xs transition-colors duration-75',
            isActive
              ? 'bg-gradient-to-tr from-amber-600 to-amber-700 text-white border-amber-500/50 shadow-md ring-2 ring-amber-400/20'
              : cn(theme.badgeBg, theme.badgeBorder, theme.iconColor, theme.hoverBadge)
          )}
        >
          <IconComponent
            size={isCollapsed ? 18 : 16}
            className={cn(
              'transition-transform duration-75 group-active:scale-95',
              isActive ? 'text-white' : ''
            )}
          />
        </div>

        {/* Label */}
        {!isCollapsed && (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-1 overflow-hidden">
            <span
              className={cn(
                'truncate whitespace-nowrap text-white font-bold',
                isActive ? 'font-extrabold text-white' : 'text-white/95'
              )}
            >
              {t(item.labelKey)}
            </span>
            {SHORTCUT_HINTS[item.id] && (
              <span className="ms-1 hidden shrink-0 rounded border border-white/20 bg-white/10 px-1 py-0.2 font-mono text-[10px] font-bold text-white/80 opacity-70 group-hover:inline-block group-hover:opacity-100">
                {SHORTCUT_HINTS[item.id]}
              </span>
            )}
          </div>
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

export default React.memo(SidebarNav);
