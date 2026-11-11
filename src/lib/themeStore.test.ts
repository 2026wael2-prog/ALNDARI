import { beforeEach, describe, expect, it } from 'vitest';
import { useThemeStore } from './themeStore';

const root = (): HTMLElement => document.documentElement;
const readVar = (prop: string): string => root().style.getPropertyValue(prop);

describe('themeStore — application of preset CSS variables', () => {
  beforeEach(() => {
    root().removeAttribute('style');
    delete root().dataset.corners;
    delete root().dataset.preset;
    root().classList.remove('dark');
  });

  it('applies the night palette and the slate bridge when the mode is dark', () => {
    useThemeStore.getState().setPreset('al-mizan-classic');
    useThemeStore.getState().setMode('dark');

    expect(root().classList.contains('dark')).toBe(true);
    expect(readVar('--app-bg')).toBe('#17140f');
    expect(readVar('--app-card')).toBe('#2a241c');
    expect(readVar('--app-surface-hover')).toBe('#3a3226');
    expect(readVar('--app-border-subtle')).toBe('#332c23');
    expect(readVar('--app-border')).toBe('#3d362c');
    expect(readVar('--app-border-strong')).toBe('#82705a');
    // الجسر الليلي: البطاقة والحدود والفواصل تُرسم من مقياس slate الدافئ
    expect(readVar('--slate-800')).toBe('42 36 28');
    expect(readVar('--slate-700')).toBe('61 54 44');
    expect(readVar('--slate-950')).toBe('23 20 15');

    // استعادة الوضع النهاري كي لا تتأثر بقية الاختبارات بحالة المتجر
    useThemeStore.getState().setMode('light');
  });

  it('applies the Al-Mizan classic palette, brand layer and square corners', () => {
    useThemeStore.getState().setPreset('al-mizan-classic');

    expect(readVar('--app-bg')).toBe('#f2f0ec');
    expect(readVar('--app-grid')).toBe('#e0dcd3');
    expect(readVar('--app-zebra')).toBe('#fbfaf7');
    expect(readVar('--brand-500')).toBe('#f58220');
    expect(readVar('--brand-ink')).toBe('#1b1b19');
    expect(readVar('--app-card')).toBe('#ffffff');
    // درجات الحدود الثلاث تُطبَّق فعلياً على DOM (لا في كائن الثيم فقط)
    expect(readVar('--app-border-subtle')).toBe('#f0eee9');
    expect(readVar('--app-border')).toBe('#e6e2da');
    expect(readVar('--app-border-strong')).toBe('#948c7d');
    expect(root().dataset.corners).toBe('square');
  });

  it('applies the classic chrome token layer so the shell owns its own colors', () => {
    useThemeStore.getState().setPreset('al-mizan-classic');

    expect(readVar('--classic-chrome')).toBe('#f7f6f3');
    expect(readVar('--classic-chrome-2')).toBe('#fbfaf8');
    expect(readVar('--classic-active')).toBe('#fce4c8');
    expect(readVar('--classic-icon-fg')).toBe('#9a4a08');
    expect(readVar('--classic-panel-shadow')).not.toBe('');
  });

  it('clears optional tokens when switching to a preset that does not define them', () => {
    useThemeStore.getState().setPreset('al-mizan-classic');
    expect(readVar('--brand-500')).not.toBe('');
    expect(readVar('--classic-chrome')).not.toBe('');
    expect(root().dataset.corners).toBe('square');

    useThemeStore.getState().setPreset('clean-white');

    // لا تسرّب من الثيم السابق
    expect(readVar('--brand-500')).toBe('');
    expect(readVar('--brand-ink')).toBe('');
    expect(readVar('--app-zebra')).toBe('');
    // توكنات القشرة تُمسح أيضاً ⇒ تعود الافتراضات المشتقة من CSS
    expect(readVar('--classic-chrome')).toBe('');
    expect(readVar('--classic-active')).toBe('');
    expect(readVar('--classic-panel-shadow')).toBe('');
    // درجات الحدود لا تتسرّب للثيمات التي لا تعرّفها (تسقط إلى --app-border)
    expect(readVar('--app-border-subtle')).toBe('');
    expect(readVar('--app-border-strong')).toBe('');

    // سقوط تلقائي: البطاقة = السطح ، الشبكة = الحدود
    expect(readVar('--app-card')).toBe(readVar('--app-surface'));
    expect(readVar('--app-grid')).toBe(readVar('--app-border'));
    expect(root().dataset.corners).toBe('rounded');
  });

  it('fills --app-card even when the preset omits it (P0-2 regression guard)', () => {
    useThemeStore.getState().setPreset('clean-white');

    expect(readVar('--app-surface')).not.toBe('');
    expect(readVar('--app-card')).toBe(readVar('--app-surface'));
  });
});

describe('themeStore — uiLayout preference', () => {
  it('defaults to auto so the active preset decides the shell', () => {
    expect(useThemeStore.getState().uiLayout).toBe('auto');
  });

  it('persists the explicit shell choice in localStorage', () => {
    useThemeStore.getState().setUiLayout('classic');
    expect(useThemeStore.getState().uiLayout).toBe('classic');

    const raw = window.localStorage.getItem('al-zahra-appearance-storage');
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw ?? '{}') as { state?: { uiLayout?: string } };
    expect(persisted.state?.uiLayout).toBe('classic');

    useThemeStore.getState().setUiLayout('auto');
  });
});
