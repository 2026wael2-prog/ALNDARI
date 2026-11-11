import React, { useCallback, useRef } from 'react';
import ClassicMenuPanel from './ClassicMenuPanel';
import { useDismissOnOutside } from './useDismissOnOutside';
import { useOpenMenu } from './useOpenMenu';
import type { UiLayout } from '../../../lib/themeStore';
import type { ClassicMenu, ClassicMenuAction, ClassicMenuEntry } from './ribbonModel';

interface ClassicMenuBarProps {
  menus: ClassicMenu[];
  currentLayout: UiLayout;
  theme: 'light' | 'dark';
  ribbonCollapsed: boolean;
  onNavigate: (path: string) => void;
  onAction: (action: ClassicMenuAction) => void;
}

interface ClassicMenuTriggerProps {
  menu: ClassicMenu;
  isOpen: boolean;
  onToggle: () => void;
  onHoverWhileOpen: () => void;
}

const ClassicMenuTrigger: React.FC<ClassicMenuTriggerProps> = ({
  menu,
  isOpen,
  onToggle,
  onHoverWhileOpen,
}) => (
  <button
    type="button"
    role="menuitem"
    aria-haspopup="menu"
    aria-expanded={isOpen}
    className="classic-menu-btn"
    onClick={onToggle}
    onMouseEnter={onHoverWhileOpen}
  >
    {menu.label}
  </button>
);

interface ClassicMenuListProps extends Omit<ClassicMenuBarProps, 'onAction' | 'onNavigate'> {
  openMenuId: string | null;
  onToggle: (id: string) => void;
  onHover: (id: string) => void;
  onSelect: (entry: ClassicMenuEntry) => void;
}

const ClassicMenuList: React.FC<ClassicMenuListProps> = ({
  menus,
  currentLayout,
  theme,
  ribbonCollapsed,
  openMenuId,
  onToggle,
  onHover,
  onSelect,
}) => (
  <>
    {menus.map(menu => {
      const isOpen = openMenuId === menu.id;
      return (
        <div key={menu.id} role="none" className="relative">
          <ClassicMenuTrigger
            menu={menu}
            isOpen={isOpen}
            onToggle={() => {
              onToggle(menu.id);
            }}
            onHoverWhileOpen={() => {
              onHover(menu.id);
            }}
          />
          {isOpen && (
            <ClassicMenuPanel
              menu={menu}
              currentLayout={currentLayout}
              theme={theme}
              ribbonCollapsed={ribbonCollapsed}
              onSelect={onSelect}
            />
          )}
        </div>
      );
    })}
  </>
);

/** شريط القوائم الكلاسيكي (ملف / عرض / التقارير) — لوحة واحدة مفتوحة في كل لحظة. */
const ClassicMenuBar: React.FC<ClassicMenuBarProps> = ({ onNavigate, onAction, ...rest }) => {
  const { openMenuId, toggleMenu, hoverMenu, closeMenu } = useOpenMenu();
  const containerRef = useRef<HTMLDivElement>(null);

  useDismissOnOutside(containerRef, openMenuId !== null, closeMenu);

  const handleSelect = useCallback(
    (entry: ClassicMenuEntry): void => {
      closeMenu();
      if (entry.path !== undefined) {
        onNavigate(entry.path);
        return;
      }
      if (entry.action !== undefined) onAction(entry.action);
    },
    [closeMenu, onAction, onNavigate]
  );

  return (
    <div
      ref={containerRef}
      role="menubar"
      aria-label="قوائم النظام"
      className="classic-menubar no-print flex items-center gap-0.5 px-1"
    >
      <ClassicMenuList
        {...rest}
        openMenuId={openMenuId}
        onToggle={toggleMenu}
        onHover={hoverMenu}
        onSelect={handleSelect}
      />
    </div>
  );
};

export default ClassicMenuBar;
