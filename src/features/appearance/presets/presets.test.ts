import { describe, expect, it } from 'vitest';
import { THEME_PRESETS } from './index';
import type { ThemeCSSVars, ThemePreset } from '../types';

type DualModePreset = ThemePreset & { light: ThemeCSSVars; dark: ThemeCSSVars };

const isDualMode = (preset: ThemePreset): preset is DualModePreset =>
  preset.light !== undefined && preset.dark !== undefined;

/**
 * قارئات صريحة للمفاتيح الإلزامية.
 * الوصول الحرفي يمنع قاعدة security/detect-object-injection من إطلاق خطأ
 * مقابل مؤشر ديناميكي.
 */
const REQUIRED_READERS: ReadonlyArray<
  readonly [name: string, read: (vars: ThemeCSSVars) => string | undefined]
> = [
  ['--app-bg', v => v['--app-bg']],
  ['--app-surface', v => v['--app-surface']],
  ['--app-surface-hover', v => v['--app-surface-hover']],
  ['--app-border', v => v['--app-border']],
  ['--app-text', v => v['--app-text']],
  ['--app-text-secondary', v => v['--app-text-secondary']],
  ['--accent', v => v['--accent']],
];

/** WCAG 2.1 relative luminance */
const luminance = (hex: string): number => {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map(i => parseInt(c.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * ديون تباين مُجمَّدة (Legacy AA debt).
 *
 * هذه ثيمات قائمة منذ ما قبل بوابة AA وأكرنتها < 4.5 على الأبيض.
 * القائمة ليست استثناءً أبدياً بل «قفل انحدار»:
 *  • لا يجوز إضافة أي id جديد هنا إطلاقاً.
 *  • عند إصلاح أي ثيم يجب إزالته من هنا، وإلا فشل اختبار «stale-free».
 * إصلاحها دفعة واحدة يغيّر مظهر مستخدمين حاليين ⇒ قرار منتج مستقل (ADR-025).
 */
const LEGACY_AA_DEBT = new Set<string>([
  'emerald-pro',
  'clean-white',
  'warm-sand',
  'desert-cream',
  'champagne-gold',
  'carbon-fiber',
  'rose-beige',
  'royal-purple',
  'royal-emerald',
  'finance-green',
  'finance-teal',
  'emerald-forest',
  'sunset-orange',
  'corporate-slate',
  'modern-teal',
  'modern-cyan',
  'summer-cyan',
  'artist-lavender',
  'health-medical',
  'food-restaurant',
  'garage-dark',
  'crystal-glass',
  'aurora-glass',
]);

/** accent النهاري للثيم (أو null للثيمات الليلية أحادية الوضع). */
const lightAccent = (preset: ThemePreset): string | null => {
  const fromLight = preset.light?.['--accent'];
  if (fromLight !== undefined) return fromLight;
  if (preset.isDark) return null;
  return preset.cssVars['--accent'];
};

describe('theme presets', () => {
  it('has unique ids', () => {
    const ids = THEME_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dual-mode presets define the seven required keys in BOTH modes', () => {
    const dualMode = THEME_PRESETS.filter(isDualMode);
    expect(dualMode.length).toBeGreaterThan(0);

    for (const preset of dualMode) {
      for (const [name, read] of REQUIRED_READERS) {
        expect(read(preset.light) ?? '', `${preset.id}.light.${name}`).not.toBe('');
        expect(read(preset.dark) ?? '', `${preset.id}.dark.${name}`).not.toBe('');
      }
    }
  });

  it('every light accent meets WCAG AA (>= 4.5) against white, except frozen legacy debt', () => {
    for (const preset of THEME_PRESETS) {
      const accent = lightAccent(preset);
      if (accent === null) continue;
      if (LEGACY_AA_DEBT.has(preset.id)) continue;
      expect(contrast(accent, '#ffffff'), `${preset.id} accent ${accent}`).toBeGreaterThanOrEqual(
        4.5
      );
    }
  });

  it('legacy AA debt list is stale-free (entry exists and still violates AA)', () => {
    for (const id of LEGACY_AA_DEBT) {
      const preset = THEME_PRESETS.find(t => t.id === id);
      expect(preset, `stale debt entry (preset removed or renamed): ${id}`).toBeDefined();
      if (preset === undefined) continue;

      const accent = lightAccent(preset);
      if (accent === null) continue;

      // إن نجح هذا الثيم في AA فقد أُصلح ⇒ يجب إزالته من القائمة
      expect(
        contrast(accent, '#ffffff'),
        `preset "${id}" now meets AA — remove it from LEGACY_AA_DEBT`
      ).toBeLessThan(4.5);
    }
  });

  it('never lets a brand-layer preset into the legacy debt list', () => {
    for (const preset of THEME_PRESETS) {
      const brandLight = preset.light?.['--brand-500'];
      const brandDark = preset.dark?.['--brand-500'];
      if (brandLight === undefined && brandDark === undefined) continue;

      expect(
        LEGACY_AA_DEBT.has(preset.id),
        `${preset.id} uses the brand layer and cannot be exempt`
      ).toBe(false);
    }
  });

  it('ships the Al-Mizan classic preset with square corners and an orange brand layer', () => {
    const mizan = THEME_PRESETS.find(p => p.id === 'al-mizan-classic');

    expect(mizan).toBeDefined();
    if (mizan === undefined) return;

    expect(mizan.category).toBe('classic');
    expect(mizan.corners).toBe('square');
    expect(mizan.light?.['--brand-500']).toBe('#f58220');
    expect(mizan.light?.['--app-grid'] ?? '').not.toBe('');
    expect(mizan.dark?.['--app-grid'] ?? '').not.toBe('');
  });

  it('brand ink keeps readable contrast over brand-500 in Al-Mizan', () => {
    const mizan = THEME_PRESETS.find(p => p.id === 'al-mizan-classic');
    expect(mizan).toBeDefined();
    if (mizan === undefined) return;

    for (const mode of ['light', 'dark'] as const) {
      const vars = mode === 'light' ? mizan.light : mizan.dark;
      const surface = vars?.['--brand-500'];
      const ink = vars?.['--brand-ink'];

      expect(surface, `${mode} brand-500`).toBeDefined();
      expect(ink, `${mode} brand-ink`).toBeDefined();
      if (surface === undefined || ink === undefined) continue;

      expect(contrast(surface, ink), `${mode} brand ink`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

