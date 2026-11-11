import { describe, expect, it } from 'vitest';
import { THEME_PRESETS } from './index';

describe('Classic Golden ERP (الميزان دوت نت) Theme Identity', () => {
  const preset = THEME_PRESETS.find(p => p.id === 'classic-golden-erp');

  it('exists and is properly registered in THEME_PRESETS', () => {
    expect(preset).toBeDefined();
    expect(preset?.name).toContain('الميزان الذهبي ERP');
    expect(preset?.category).toBe('classic');
    expect(preset?.corners).toBe('square');
    expect(preset?.layout).toBe('classic');
  });

  it('contains the exact 15 approved palette colors in its light mode', () => {
    expect(preset?.light).toBeDefined();
    if (!preset?.light) return;
    const light = preset.light;

    // 1. اللون الرئيسي البرتقالي الذهبي
    expect(light['--brand-500']).toBe('#E99A00');
    // 2. البرتقالي الداكن
    expect(light['--brand-600']).toBe('#D99000');
    // 3. الذهبي الفاتح
    expect(light['--secondary-gold']).toBe('#F2B52B');
    // 4. الأصفر الذهبي
    expect(light['--accent-gold-yellow']).toBe('#F5C04A');
    // 5. خلفية البرنامج
    expect(light['--app-bg']).toBe('#E8E8E8');
    // 6. خلفية النوافذ
    expect(light['--app-surface']).toBe('#F4F4F4');
    // 7. خلفية حقول الإدخال
    expect(light['--app-input-bg']).toBe('#FFFFFF');
    // 8. الأخضر الأساسي للجداول
    expect(light['--table-header-bg']).toBe('#80C77B');
    // 9. الأخضر الفاتح
    expect(light['--table-selected-row']).toBe('#A0D995');
    // 10. الصفوف البديلة
    expect(light['--app-zebra']).toBe('#EAEAEA');
    // 11. حدود الجداول
    expect(light['--app-grid']).toBe('#C8C8C8');
    // 12. النص الأساسي
    expect(light['--app-text']).toBe('#292929');
    // 13. النص الثانوي
    expect(light['--app-text-secondary']).toBe('#777777');
    // 14. الأزرق للعناصر التفاعلية
    expect(light['--interactive-blue']).toBe('#164F85');
    expect(light['--accent']).toBe('#164F85');
    // 15. لون الحقول المعدلة
    expect(light['--field-modified-bg']).toBe('#F4C58A');
  });

  it('defines coherent dark mode values', () => {
    expect(preset?.dark).toBeDefined();
    if (!preset?.dark) return;
    const dark = preset.dark;
    expect(dark['--brand-500']).toBe('#E99A00');
    expect(dark['--brand-600']).toBe('#D99000');
    expect(dark['--app-bg']).toBeDefined();
    expect(dark['--app-surface']).toBeDefined();
    expect(dark['--app-text']).toBeDefined();
  });
});
