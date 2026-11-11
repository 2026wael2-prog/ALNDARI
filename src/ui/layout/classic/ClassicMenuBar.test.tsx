
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClassicMenuBar from './ClassicMenuBar';
import { buildClassicMenus } from './ribbonModel';

const menus = buildClassicMenus(key => key);

const renderBar = (overrides?: {
  onNavigate?: (path: string) => void;
  onAction?: (action: 'toggle-theme' | 'layout-auto' | 'layout-modern' | 'layout-classic' | 'toggle-ribbon') => void;
  currentLayout?: 'auto' | 'modern' | 'classic';
}) =>
  render(
    <ClassicMenuBar
      menus={menus}
      currentLayout={overrides?.currentLayout ?? 'auto'}
      theme="light"
      ribbonCollapsed={false}
      onNavigate={overrides?.onNavigate ?? (() => undefined)}
      onAction={overrides?.onAction ?? (() => undefined)}
    />
  );

describe('ClassicMenuBar', () => {
  it('يعرض أسماء القوائم الرئيسية', () => {
    renderBar();

    expect(screen.getByRole('menubar', { name: 'قوائم النظام' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'ملف' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'عرض' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'التقارير' })).toBeDefined();
  });

  it('يفتح قائمة ملف وينقل عند اختيار مسار', () => {
    const onNavigate = vi.fn();
    renderBar({ onNavigate });

    fireEvent.click(screen.getByRole('menuitem', { name: 'ملف' }));
    const settings = screen.getByRole('menuitem', { name: 'الإعدادات' });
    fireEvent.click(settings);

    expect(onNavigate).toHaveBeenCalledWith('/settings');
    // تُغلق القائمة بعد الاختيار
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('يرسل أمر تبديل الشكل من قائمة عرض', () => {
    const onAction = vi.fn();
    renderBar({ onAction });

    fireEvent.click(screen.getByRole('menuitem', { name: 'عرض' }));
    fireEvent.click(
      screen.getByRole('menuitemradio', { name: /كلاسيكي \(قوائم وشريط أوامر\)/ })
    );

    expect(onAction).toHaveBeenCalledWith('layout-classic');
  });

  it('يُعلّم خيار الشكل الحالي كـ aria-checked=true', () => {
    renderBar({ currentLayout: 'classic' });

    fireEvent.click(screen.getByRole('menuitem', { name: 'عرض' }));

    expect(
      screen.getByRole('menuitemradio', { name: /كلاسيكي \(قوائم وشريط أوامر\)/ }).getAttribute(
        'aria-checked'
      )
    ).toBe('true');
    expect(
      screen.getByRole('menuitemradio', { name: /تلقائي/ }).getAttribute('aria-checked')
    ).toBe('false');
  });

  it('يغلق القائمة بمفتاح Escape', () => {
    renderBar();

    fireEvent.click(screen.getByRole('menuitem', { name: 'ملف' }));
    expect(screen.getByRole('menu')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
  });
});
