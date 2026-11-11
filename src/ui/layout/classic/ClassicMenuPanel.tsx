import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../../core/utils';
import type { UiLayout } from '../../../lib/themeStore';
import { isLayoutAction, isLayoutActionChecked } from './ribbonModel';
import type { ClassicMenu, ClassicMenuEntry } from './ribbonModel';

interface ClassicMenuPanelProps {
  menu: ClassicMenu;
  currentLayout: UiLayout;
  theme: 'light' | 'dark';
  ribbonCollapsed: boolean;
  onSelect: (entry: ClassicMenuEntry) => void;
}

interface ClassicMenuRowProps {
  entry: ClassicMenuEntry & { label: string };
  checked: boolean;
  theme: 'light' | 'dark';
  withSeparator: boolean;
  onSelect: (entry: ClassicMenuEntry) => void;
}

/** صف واحد في اللوحة: علامة اختيار + التسمية + رمز الوضع الحالي. */
const ClassicMenuRow: React.FC<ClassicMenuRowProps> = ({
  entry,
  checked,
  theme,
  withSeparator,
  onSelect,
}) => {
  const isRadio = isLayoutAction(entry.action);

  return (
    <>
      {withSeparator && <div role="separator" className="classic-menu-separator" />}
      <button
        type="button"
        role={isRadio ? 'menuitemradio' : 'menuitem'}
        aria-checked={isRadio ? checked : undefined}
        className="classic-menu-item"
        onClick={() => {
          onSelect(entry);
        }}
      >
        <Check
          size={12}
          className={cn('classic-menu-check', checked ? 'opacity-100' : 'opacity-0')}
          aria-hidden="true"
        />
        <span className="truncate">{entry.label}</span>
        {entry.action === 'toggle-theme' && (
          <span aria-hidden="true" className="ms-auto text-[11px]">
            {theme === 'light' ? '☀' : '☾'}
          </span>
        )}
      </button>
    </>
  );
};

/**
 * لوحة القائمة المنسدلة لمجموعة واحدة (ملف/عرض/التقارير).
 * فاصل واحد يفصل الانتقالات (مسارات) عن أوامر العرض (الشكل/الوضع).
 */
export const ClassicMenuPanel: React.FC<ClassicMenuPanelProps> = ({
  menu,
  currentLayout,
  theme,
  ribbonCollapsed,
  onSelect,
}) => {
  const firstCommandIndex = menu.entries.findIndex(entry => entry.action !== undefined);

  return (
    <div role="menu" aria-label={menu.label} className="classic-menu-panel">
      {menu.entries.map((entry, index) => (
        <ClassicMenuRow
          key={entry.id}
          entry={entry}
          theme={theme}
          withSeparator={index === firstCommandIndex && firstCommandIndex > 0}
          checked={
            isLayoutActionChecked(entry.action, currentLayout) ||
            (entry.action === 'toggle-ribbon' && ribbonCollapsed)
          }
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

export default ClassicMenuPanel;
