import { describe, expect, it } from 'vitest';
import { THEME_PRESETS } from './index';

describe('Classic Al-Mizan Pro (الميزان برو — محلات النظاري) Theme Identity', () => {
  const preset = THEME_PRESETS.find(p => p.id === 'al-mizan-pro');

  it('exists and is properly registered in THEME_PRESETS', () => {
    expect(preset).toBeDefined();
    expect(preset?.name).toContain('الميزان برو');
    expect(preset?.category).toBe('classic');
    expect(preset?.corners).toBe('square');
    expect(preset?.layout).toBe('classic');
  });

  it('contains the exact user palette tokens in its light mode', () => {
    expect(preset?.light).toBeDefined();
    if (!preset?.light) return;
    const light = preset.light;

    // 1. اللون الرئيسي والألوان الكلاسيكية
    expect(light['--brand-500']).toBe('#2472c8');
    expect(light['--accent']).toBe('#2472c8');
    // 2. خلفية البرنامج (رمادي ويندوز الفاتح --ctl)
    expect(light['--app-bg']).toBe('#f0f0f0');
    // 3. خلفية النوافذ والأسطح (--white)
    expect(light['--app-surface']).toBe('#ffffff');
    expect(light['--app-input-bg']).toBe('#ffffff');
    // 4. حدود الحقول والبطاقات (--line / --field)
    expect(light['--app-border']).toBe('#cdcdcd');
    expect(light['--app-border-strong']).toBe('#abadb3');
    // 5. صفوف التموج الخضراء المميزة في شبكة المحاسبة (--zebra)
    expect(light['--app-zebra']).toBe('#98fb98');
    // 6. رأس الجدول المكتبي (--head2)
    expect(light['--table-header-bg']).toBe('#e6e6e6');
    // 7. تحديد الصف المختار (--sel)
    expect(light['--table-selected-row']).toBe('#cce0f7');
    // 8. القشرة الكلاسيكية وشريط العنوان
    expect(light['--classic-chrome']).toBe('#c6dcf2');
    expect(light['--classic-chrome-2']).toBe('#ffffff');
    expect(light['--classic-chrome-border']).toBe('#b9b9b9');
    expect(light['--classic-hover']).toBe('#eaf3fc');
    expect(light['--classic-active']).toBe('#cce0f7');
  });

  it('defines coherent dark mode values', () => {
    expect(preset?.dark).toBeDefined();
    if (!preset?.dark) return;
    const dark = preset.dark;
    expect(dark['--brand-500']).toBe('#388bfd');
    expect(dark['--app-bg']).toBe('#0e1622');
    expect(dark['--app-surface']).toBe('#162130');
    expect(dark['--app-border']).toBe('#26374d');
    expect(dark['--app-zebra']).toBe('#162a20');
    expect(dark['--classic-chrome']).toBe('#1b2a3d');
  });
});

