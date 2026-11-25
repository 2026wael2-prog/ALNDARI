import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_PRESETS } from './index';
import { useThemeStore } from '../../../lib/themeStore';

const preset = THEME_PRESETS.find(p => p.id === 'espresso-cream-blue');

describe('espresso-cream-blue theme preset (Brown + Cream + Baby Blue)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    delete document.documentElement.dataset.corners;
    delete document.documentElement.dataset.preset;
    document.documentElement.classList.remove('dark');
  });

  it('is registered in THEME_PRESETS under premium category with Brown/Cream/Baby Blue swatches', () => {
    expect(preset).toBeDefined();
    if (!preset) return;

    expect(preset.category).toBe('premium');
    expect(preset.layout).toBe('modern');
    expect(preset.corners).toBe('rounded');
    expect(preset.colors).toEqual(['#5c3a21', '#f5ebdc', '#9acbeb']);
    expect(preset.light).toBeDefined();
    expect(preset.dark).toBeDefined();
  });

  it('applies Cream canvas, Espresso Brown accent, and Baby Blue table header in light mode', () => {
    useThemeStore.getState().setMode('light');
    useThemeStore.getState().setPreset('espresso-cream-blue');

    const root = document.documentElement;
    expect(root.dataset.preset).toBe('espresso-cream-blue');
    expect(root.dataset.corners).toBe('rounded');
    expect(root.style.getPropertyValue('--app-bg')).toBe('#f7f1e7');
    expect(root.style.getPropertyValue('--app-surface')).toBe('#fffdf9');
    expect(root.style.getPropertyValue('--app-text')).toBe('#1a0f08');
    expect(root.style.getPropertyValue('--app-text-secondary')).toBe('#4a301e');
    expect(root.style.getPropertyValue('--accent')).toBe('#5c3a21');
    expect(root.style.getPropertyValue('--table-header-bg')).toBe('#cfe9fc');
    expect(root.style.getPropertyValue('--table-header-fg')).toBe('#180d07');
  });

  it('applies Deep Espresso dark surface and luminous Baby Blue accent in dark mode', () => {
    useThemeStore.getState().setPreset('espresso-cream-blue');
    useThemeStore.getState().setMode('dark');

    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.getPropertyValue('--app-bg')).toBe('#16100c');
    expect(root.style.getPropertyValue('--app-surface')).toBe('#211812');
    expect(root.style.getPropertyValue('--app-text')).toBe('#fffaf2');
    expect(root.style.getPropertyValue('--app-text-secondary')).toBe('#f0dec8');
    expect(root.style.getPropertyValue('--table-header-bg')).toBe('#1d3446');
    expect(root.style.getPropertyValue('--table-header-fg')).toBe('#e8f6ff');
    expect(root.style.getPropertyValue('--slate-800')).toBe('37 27 20');

    useThemeStore.getState().setMode('light');
  });
});
