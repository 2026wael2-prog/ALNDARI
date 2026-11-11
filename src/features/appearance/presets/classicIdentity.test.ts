import { describe, expect, it } from 'vitest';
import {
  CLASSIC_CHROME_VARS,
  MIZAN_DAY_SLATE,
  MIZAN_NIGHT_SLATE,
  MIZAN_NIGHT_SLATE_VARS,
} from '../classicTokens';
import { THEME_PRESETS } from './index';
import type { ThemeCSSVars } from '../types';

/**
 * بوابة هوية «الميزان الكلاسيكي»: تتحقق من ألوان القشرة في الوضعين
 * (نهاري/ليلي) بمعايير WCAG، فلا يمكن أن ينحدر التباين بصرياً دون فشل CI.
 */

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
 * قارئات صريحة لتوكنات القشرة (وصول حرفي يمنع detect-object-injection)،
 * والقائمة تُطابق CLASSIC_CHROME_VARS بالترتيب والمحتوى كي لا تنحرف.
 */
const CHROME_READERS: ReadonlyArray<
  readonly [name: string, read: (vars: ThemeCSSVars) => string | undefined]
> = [
  ['--classic-chrome', v => v['--classic-chrome']],
  ['--classic-chrome-2', v => v['--classic-chrome-2']],
  ['--classic-chrome-border', v => v['--classic-chrome-border']],
  ['--classic-hover', v => v['--classic-hover']],
  ['--classic-hover-border', v => v['--classic-hover-border']],
  ['--classic-active', v => v['--classic-active']],
  ['--classic-active-border', v => v['--classic-active-border']],
  ['--classic-icon', v => v['--classic-icon']],
  ['--classic-icon-fg', v => v['--classic-icon-fg']],
  ['--classic-panel', v => v['--classic-panel']],
  ['--classic-panel-border', v => v['--classic-panel-border']],
  ['--classic-panel-shadow', v => v['--classic-panel-shadow']],
];

/** قيم الوضعين للميزان الكلاسيكي (يفشل الاختبار إن غاب أحدهما). */
const modes = (): ReadonlyArray<readonly ['light' | 'dark', ThemeCSSVars]> => {
  const preset = THEME_PRESETS.find(p => p.id === 'al-mizan-classic');
  expect(preset, 'al-mizan-classic preset is missing').toBeDefined();
  expect(preset?.light, 'al-mizan-classic.light is missing').toBeDefined();
  expect(preset?.dark, 'al-mizan-classic.dark is missing').toBeDefined();
  if (preset?.light === undefined || preset.dark === undefined) return [];
  return [
    ['light', preset.light],
    ['dark', preset.dark],
  ] as const;
};

/**
 * قارئ آمن لدرجات الحدود الدلالية (`--app-border-subtle` / `-strong`).
 * وصول حرفي لا `obj[key]` — لمنع detect-object-injection، وللفشل الواضح
 * إن حُذفت إحدى الدرجتين من الثيم.
 */
const borderTier = (
  vars: ThemeCSSVars,
  tier: '--app-border-subtle' | '--app-border-strong'
): string => {
  const raw = tier === '--app-border-subtle' ? vars['--app-border-subtle'] : vars['--app-border-strong'];
  expect(raw, `${tier} is undefined`).toBeDefined();
  return raw ?? '#000000';
};

/** قيمة مضمونة الوجود بعد اختبار التعريف — تفشل بوضوح إن غابت. */
const value = (vars: ThemeCSSVars, name: string): string => {
  const reader = CHROME_READERS.find(([token]) => token === name)?.[1];
  const raw = reader ? reader(vars) : undefined;
  expect(raw, `${name} is undefined`).toBeDefined();
  return raw ?? '#000000';
};

const expectRatio = (fg: string, bg: string, min: number, label: string): void => {
  expect(contrast(fg, bg), `${label} (${fg} on ${bg})`).toBeGreaterThanOrEqual(min);
};

/** درجة اللون (Hue) — لضمان أن أسطح الليل من عائلة واحدة لا خليط عائلات. */
const hueOf = (hex: string): number => {
  const c = hex.replace('#', '');
  const channels = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  const raw =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return Math.round((raw * 60 + 360) % 360);
};

/**
 * قنوات لون من صيغة `#rrggbb`.
 */
const hexChannels = (hex: string): [number, number, number] => {
  const c = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
};

/** يحوّل `R G B` (صيغة متغيرات Tailwind) إلى `#rrggbb` لمقاييس التباين. */
const hexFromTriplet = (raw: string): string => {
  const channels = raw.trim().split(/\s+/).map(Number);
  expect(channels, `not an "R G B" triplet: ${raw}`).toHaveLength(3);
  return `#${channels
    .map(channel => {
      expect(Number.isInteger(channel) && channel >= 0 && channel <= 255, `bad channel: ${raw}`).toBe(
        true
      );
      return channel.toString(16).padStart(2, '0');
    })
    .join('')}`;
};

/** العكس: `#rrggbb` → `R G B` (لمقارنة توكنات --app-* بالمقياس). */
const tripletOf = (hex: string): string => hexChannels(hex).join(' ');

describe('Al-Mizan classic identity colors', () => {
  it('keeps the chrome token list in sync with the presets contract', () => {
    const declared = CHROME_READERS.map(([name]) => name);
    expect(declared).toEqual([...CLASSIC_CHROME_VARS]);
  });

  it('defines every classic chrome token in BOTH modes', () => {
    for (const [mode, vars] of modes()) {
      for (const [name, read] of CHROME_READERS) {
        expect(read(vars) ?? '', `${mode}.${name}`).not.toBe('');
      }
    }
  });

  it('keeps chrome text readable (>= 4.5) on every chrome surface', () => {
    for (const [mode, vars] of modes()) {
      expectRatio(
        vars['--app-text-secondary'],
        value(vars, '--classic-chrome'),
        4.5,
        `${mode}: secondary text on titlebar`
      );
      expectRatio(
        vars['--app-text-secondary'],
        value(vars, '--classic-chrome-2'),
        4.5,
        `${mode}: ribbon group label`
      );
      expectRatio(
        vars['--app-text'],
        value(vars, '--classic-chrome'),
        4.5,
        `${mode}: menu text on titlebar`
      );
      expectRatio(
        vars['--app-text'],
        value(vars, '--classic-panel'),
        4.5,
        `${mode}: menu item on panel`
      );
    }
  });

  it('keeps ribbon labels readable on hover and active backgrounds', () => {
    for (const [mode, vars] of modes()) {
      expectRatio(
        vars['--app-text'],
        value(vars, '--classic-hover'),
        4.5,
        `${mode}: label on hover`
      );
      expectRatio(
        vars['--app-text'],
        value(vars, '--classic-active'),
        4.5,
        `${mode}: label on active`
      );
    }
  });

  it('distinguishes the active item with a non-text indicator (>= 3)', () => {
    for (const [mode, vars] of modes()) {
      const active = value(vars, '--classic-active');
      expectRatio(value(vars, '--classic-active-border'), active, 3, `${mode}: active border`);
      // المؤشر السفلي في index.css يستخدم --accent مباشرة
      expectRatio(vars['--accent'], active, 3, `${mode}: active bottom bar`);
    }
  });

  it('keeps icon glyphs readable on the quiet icon chip (>= 4.5)', () => {
    for (const [mode, vars] of modes()) {
      expectRatio(
        value(vars, '--classic-icon-fg'),
        value(vars, '--classic-icon'),
        4.5,
        `${mode}: icon glyph`
      );
    }
  });

  it('keeps the accent readable on chrome surfaces (>= 4.5)', () => {
    const surfaces = ['--classic-chrome', '--classic-chrome-2', '--classic-panel'] as const;
    for (const [mode, vars] of modes()) {
      for (const surface of surfaces) {
        expectRatio(vars['--accent'], value(vars, surface), 4.5, `${mode}: accent on ${surface}`);
      }
    }
  });

  it('keeps control borders visible (>= 3, WCAG 1.4.11)', () => {
    for (const [mode, vars] of modes()) {
      // WCAG 1.4.11 يخص حدود عناصر التحكّم (الحقول/الأزرار المؤطّرة) — وهي
      // الدرجة strong. أما --app-border فهو فاصل تخطيطي لا يُشترط له 3:1.
      expectRatio(
        borderTier(vars, '--app-border-strong'),
        vars['--app-surface'],
        3,
        `${mode}: control border`
      );
    }
  });

  it('keeps the three border tiers apart (no heavy grid in either mode)', () => {
    for (const [mode, vars] of modes()) {
      const card = vars['--app-card'] ?? vars['--app-surface'];
      const subtle = contrast(borderTier(vars, '--app-border-subtle'), card);
      const divider = contrast(vars['--app-border'], card);
      const control = contrast(borderTier(vars, '--app-border-strong'), card);

      // العيب الذي أفقد الواجهتين راحتهما: كل الحدود كانت بدرجة واحدة ~3.5:1.
      // الفاصل التخطيطي يجب أن يبقى شعرة (≤ 1.5) لا خطاً ثقيلاً.
      expect(divider, `${mode}: divider is too heavy (${divider.toFixed(2)})`).toBeLessThanOrEqual(1.5);
      expect(subtle, `${mode}: subtle tier must stay faint`).toBeLessThanOrEqual(1.25);
      expect(subtle, `${mode}: subtle must be lighter than the divider`).toBeLessThan(divider);
      expect(divider, `${mode}: divider must be lighter than a control border`).toBeLessThan(control);
      expect(control, `${mode}: control tier must stay a control tone`).toBeLessThanOrEqual(4.2);
    }
  });

  it('keeps every night surface in one warm family (no cool remnants)', () => {
    const dark = modes().find(([mode]) => mode === 'dark')?.[1];
    expect(dark, 'al-mizan-classic.dark is missing').toBeDefined();
    if (dark === undefined) return;

    // ليل الميزان دافئ: قناة الأحمر تتقدّم الأزرق في كل سطح (لا رمادي ميت
    // ولا أزرق فولاذي)، وكل الأسطح من عائلة صبغية واحدة بفارق ≤ 20 درجة.
    const surfaces: ReadonlyArray<readonly [string, string]> = [
      ['--app-bg', dark['--app-bg']],
      ['--app-surface', dark['--app-surface']],
      ['--app-card', dark['--app-card'] ?? dark['--app-surface']],
      ['--app-surface-hover', dark['--app-surface-hover']],
      ['--classic-chrome', value(dark, '--classic-chrome')],
      ['--classic-chrome-2', value(dark, '--classic-chrome-2')],
      ['--classic-panel', value(dark, '--classic-panel')],
      ['--classic-hover', value(dark, '--classic-hover')],
      ['--classic-active', value(dark, '--classic-active')],
    ];

    for (const [name, hex] of surfaces) {
      const [r, , b] = hexChannels(hex);
      expect(r, `${name} lost the warm identity (${hex})`).toBeGreaterThan(b);
    }

    const hues = surfaces.map(([, hex]) => hueOf(hex));
    const min = Math.min(...hues);
    const max = Math.max(...hues);

    expect(min, `night hues left the warm band: ${hues.join(', ')}`).toBeGreaterThanOrEqual(15);
    expect(max, `night hues left the warm band: ${hues.join(', ')}`).toBeLessThanOrEqual(50);
    expect(max - min, `night surfaces drifted across hue families: ${hues.join(', ')}`).toBeLessThanOrEqual(20);
  });

  it('keeps layering direction: light surface above bg, dark surface above bg', () => {
    const [lightVars, darkVars] = modes().map(([, vars]) => vars);

    expect(luminance(lightVars['--app-surface'])).toBeGreaterThan(luminance(lightVars['--app-bg']));
    expect(luminance(darkVars['--app-surface'])).toBeGreaterThan(luminance(darkVars['--app-bg']));
    expect(luminance(lightVars['--app-bg'])).toBeGreaterThan(luminance(darkVars['--app-bg']));

    // عمق النافذة: العنوان أخف من الشريط نهاراً، وأغمق منه ليلاً
    expect(luminance(value(lightVars, '--classic-chrome'))).toBeLessThan(
      luminance(value(lightVars, '--classic-chrome-2'))
    );
    expect(luminance(value(darkVars, '--classic-chrome'))).toBeGreaterThan(
      luminance(value(darkVars, '--classic-chrome-2'))
    );
  });
});

/**
 * ── جسر لوحة slate ────────────────────────────────────────────────────────
 * البطاقات والحقول في التطبيق ملوّنة بأصناف حرفية (`dark:bg-slate-800`)
 * لا بتوكنات `--app-*`، لذا لا يكفي تعديل الثيم لتصبح «ميزاناً». هذا الجسر
 * يربط مقياس slate كاملاً بمتغيرات CSS (tailwind.config.js) ويملؤه الثيم
 * ليلاً بمقياس دافئ. الاختبارات التالية تقفل الجسر من كل جهة: الصيغة،
 * الدفء، الترتيب، التطابق مع توكنات --app-*، والتباين.
 */
describe('Mizan night slate bridge', () => {
  /**
   * المقياس بصيغة صريحة: [المفتاح، قارئ من كائن الثيم، القيمة الحرفية].
   * الوصول الحرفي مقصود (لا `obj[key]`) لمنع detect-object-injection،
   * كما في CHROME_READERS أعلاه.
   */
  const SLATE_SCALE: ReadonlyArray<
    readonly [name: string, read: (vars: ThemeCSSVars) => string | undefined, triple: string]
  > = [
    ['--slate-50', v => v['--slate-50'], MIZAN_NIGHT_SLATE['--slate-50']],
    ['--slate-100', v => v['--slate-100'], MIZAN_NIGHT_SLATE['--slate-100']],
    ['--slate-200', v => v['--slate-200'], MIZAN_NIGHT_SLATE['--slate-200']],
    ['--slate-300', v => v['--slate-300'], MIZAN_NIGHT_SLATE['--slate-300']],
    ['--slate-400', v => v['--slate-400'], MIZAN_NIGHT_SLATE['--slate-400']],
    ['--slate-500', v => v['--slate-500'], MIZAN_NIGHT_SLATE['--slate-500']],
    ['--slate-600', v => v['--slate-600'], MIZAN_NIGHT_SLATE['--slate-600']],
    ['--slate-700', v => v['--slate-700'], MIZAN_NIGHT_SLATE['--slate-700']],
    ['--slate-750', v => v['--slate-750'], MIZAN_NIGHT_SLATE['--slate-750']],
    ['--slate-800', v => v['--slate-800'], MIZAN_NIGHT_SLATE['--slate-800']],
    ['--slate-850', v => v['--slate-850'], MIZAN_NIGHT_SLATE['--slate-850']],
    ['--slate-900', v => v['--slate-900'], MIZAN_NIGHT_SLATE['--slate-900']],
    ['--slate-950', v => v['--slate-950'], MIZAN_NIGHT_SLATE['--slate-950']],
  ];

  /**
   * نفس المقياس لكن للوضع النهاري («نهار الميزان») — قارئ صريح لكل درجة
   * لمنع detect-object-injection، ولكشف أي درجة تسقط من الفئة النهارية.
   */
  const DAY_SCALE: ReadonlyArray<
    readonly [name: string, read: (vars: ThemeCSSVars) => string | undefined, triple: string]
  > = [
    ['--slate-50', v => v['--slate-50'], MIZAN_DAY_SLATE['--slate-50']],
    ['--slate-100', v => v['--slate-100'], MIZAN_DAY_SLATE['--slate-100']],
    ['--slate-200', v => v['--slate-200'], MIZAN_DAY_SLATE['--slate-200']],
    ['--slate-300', v => v['--slate-300'], MIZAN_DAY_SLATE['--slate-300']],
    ['--slate-400', v => v['--slate-400'], MIZAN_DAY_SLATE['--slate-400']],
    ['--slate-500', v => v['--slate-500'], MIZAN_DAY_SLATE['--slate-500']],
    ['--slate-600', v => v['--slate-600'], MIZAN_DAY_SLATE['--slate-600']],
    ['--slate-700', v => v['--slate-700'], MIZAN_DAY_SLATE['--slate-700']],
    ['--slate-750', v => v['--slate-750'], MIZAN_DAY_SLATE['--slate-750']],
    ['--slate-800', v => v['--slate-800'], MIZAN_DAY_SLATE['--slate-800']],
    ['--slate-850', v => v['--slate-850'], MIZAN_DAY_SLATE['--slate-850']],
    ['--slate-900', v => v['--slate-900'], MIZAN_DAY_SLATE['--slate-900']],
    ['--slate-950', v => v['--slate-950'], MIZAN_DAY_SLATE['--slate-950']],
  ];

  it('binds every slate shade the UI uses (no undefined variable path)', () => {
    expect(MIZAN_NIGHT_SLATE_VARS).toEqual(SLATE_SCALE.map(([name]) => name));
  });

  it('stores each shade as an "R G B" triplet so /alpha modifiers keep working', () => {
    for (const [name, , triple] of SLATE_SCALE) {
      expect(triple, name).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      hexFromTriplet(triple); // يتحقق من المدى 0..255
    }
  });

  it('keeps the whole scale warm and strictly ordered light → dark', () => {
    let previousLuminance = Number.POSITIVE_INFINITY;
    for (const [name, , triple] of SLATE_SCALE) {
      const hex = hexFromTriplet(triple);
      const [r, , b] = hexChannels(hex);
      expect(r, `${name} went cool (${hex})`).toBeGreaterThan(b);
      const current = luminance(hex);
      expect(current, `${name} breaks the light→dark ordering`).toBeLessThan(previousLuminance);
      previousLuminance = current;
    }
  });

  it('paints page, surface, card and hover with the app tokens they replace', () => {
    const dark = modes().find(([mode]) => mode === 'dark')?.[1];
    expect(dark, 'al-mizan-classic.dark is missing').toBeDefined();
    if (dark === undefined) return;

    // كل درجة من المقياس يجب أن تطابق التوكن الذي يفرضه index.css على صنفها:
    //   dark:bg-slate-950 → --app-bg        dark:bg-slate-800 → --app-card
    //   dark:bg-slate-900 → --app-surface   slate-750 (hover) → --app-surface-hover
    expect(MIZAN_NIGHT_SLATE['--slate-950'], 'bg shade ≠ --app-bg').toBe(
      tripletOf(dark['--app-bg'])
    );
    expect(MIZAN_NIGHT_SLATE['--slate-900'], 'surface shade ≠ --app-surface').toBe(
      tripletOf(dark['--app-surface'])
    );
    expect(MIZAN_NIGHT_SLATE['--slate-800'], 'card shade ≠ --app-card').toBe(
      tripletOf(dark['--app-card'] ?? dark['--app-surface'])
    );
    expect(MIZAN_NIGHT_SLATE['--slate-750'], 'hover shade ≠ --app-surface-hover').toBe(
      tripletOf(dark['--app-surface-hover'])
    );
  });

  it('keeps a real elevation ladder: page < surface < card < hover', () => {
    const dark = modes().find(([mode]) => mode === 'dark')?.[1];
    expect(dark, 'al-mizan-classic.dark is missing').toBeDefined();
    if (dark === undefined) return;

    // لولا هذه الهرمية تبدو البطاقات «مسطحة» وغير مستوحاة من برنامج مكتبي.
    const page = luminance(dark['--app-bg']);
    const surface = luminance(dark['--app-surface']);
    const card = luminance(dark['--app-card'] ?? dark['--app-surface']);
    const hover = luminance(dark['--app-surface-hover']);

    expect(surface, 'surface must sit above the page').toBeGreaterThan(page);
    expect(card, 'cards must sit above the surface').toBeGreaterThan(surface);
    expect(hover, 'hover must sit above the card').toBeGreaterThan(card);
  });

  it('applies the bridge in both modes (day scale by day, night scale by night)', () => {
    const light = modes().find(([mode]) => mode === 'light')?.[1];
    expect(light, 'al-mizan-classic.light is missing').toBeDefined();
    if (light === undefined) return;

    // النهار يربط المقياس أيضاً، لكن بمحاذاة الورق: لوحات slate الباردة
    // (bg-slate-50/100/200) كانت تظهر فولاذية داخل صفحة دافئة.
    for (const [name, read, triple] of DAY_SCALE) {
      expect(read(light), `light day scale lost ${name}`).toBe(triple);
    }
  });

  it('keeps the day scale warm, ordered and readable on paper', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const [name, , triple] of DAY_SCALE) {
      const hex = hexFromTriplet(triple);
      const [r, , b] = hexChannels(hex);
      expect(r, `${name} went cool (${hex})`).toBeGreaterThan(b);
      const current = luminance(hex);
      expect(current, `${name} breaks the light→dark ordering`).toBeLessThan(previous);
      previous = current;
    }

    // shale اليوم نص على الورق: 500 فأغمق يجب أن يبقى مقروءاً (لا أفتح من الأصلي)
    expectRatio(hexFromTriplet(MIZAN_DAY_SLATE['--slate-500']), '#f2f0ec', 4, 'day slate-500');
    expectRatio(hexFromTriplet(MIZAN_DAY_SLATE['--slate-600']), '#ffffff', 7, 'day slate-600');
  });

  it('keeps slate text shades readable on the slate card (WCAG AA)', () => {
    const card = hexFromTriplet(MIZAN_NIGHT_SLATE['--slate-800']);
    expectRatio(hexFromTriplet(MIZAN_NIGHT_SLATE['--slate-200']), card, 4.5, 'dark:text-slate-200');
    expectRatio(hexFromTriplet(MIZAN_NIGHT_SLATE['--slate-300']), card, 4.5, 'dark:text-slate-300');
    expectRatio(hexFromTriplet(MIZAN_NIGHT_SLATE['--slate-400']), card, 4.5, 'dark:text-slate-400');
    // slate-500 نص ثانوي/أيقونات هادئة: يُكتفى بحد المكوّنات غير النصية.
    expectRatio(hexFromTriplet(MIZAN_NIGHT_SLATE['--slate-500']), card, 3, 'dark:text-slate-500');
  });

  it('confines the warm scale to the al-mizan-classic preset alone', () => {
    const others = THEME_PRESETS.filter(preset => preset.id !== 'al-mizan-classic');
    expect(others.length, 'expected other presets to exist').toBeGreaterThan(0);
    for (const preset of others) {
      for (const vars of [preset.light, preset.dark, preset.cssVars]) {
        if (!vars) continue;
        for (const [name, read] of SLATE_SCALE) {
          expect(read(vars), `${preset.id} must not define ${name}`).toBeUndefined();
        }
      }
    }
  });

  it('keeps the preset in sync with the token map', () => {
    const dark = modes().find(([mode]) => mode === 'dark')?.[1];
    expect(dark, 'al-mizan-classic.dark is missing').toBeDefined();
    if (dark === undefined) return;

    for (const [name, read, triple] of SLATE_SCALE) {
      expect(read(dark), `preset.dark lost ${name}`).toBe(triple);
    }
  });
});
