# ADR-025: Al-Mizan classic identity layer (M0/M1/M2)

## Status

Accepted (2026-11-03) — milestone M0 + M1 of the Al-Mizan classic UI initiative.
M2 (ribbon/menu shell) and beyond remain pending an explicit scope decision.

## Context

The product needs a second visual identity — a warm-orange/charcoal, ribbon-and-grid
"desktop accounting software" look inspired by Al-Mizan — without abandoning the
existing modern layout or rewriting ~224 hard-coded `bg-blue-600` occurrences and
~2 175 `rounded-*` utilities.

Findings from the audit (`docs/DESIGN-THEME-AUDIT-2026-11-03.md`) that shaped this
decision:

1. `--app-card` was **referenced in 6 files but never defined** (`scroll-x-hint-card`
   renders a transparent cover). A real P0 token bug.
2. `applyPresetCSSVars` wrote every key straight onto `<html>` and **never cleared
   them**, so any new optional token would leak from one preset into the next.
3. `--radius` is effectively dead (14 usages vs 1 070 `rounded-xl` / 1 105 `rounded-lg`),
   so "square corners" cannot be achieved by changing `--radius`.
4. 21 shipped presets (including the default `clean-white`, 3.68:1) have accents below
   WCAG AA on white.

## Decision

1. **Add a token layer, not a component rewrite (M0).**
   - `index.css` `:root` gains `--brand-500/600/700`, `--brand-ink`, `--app-grid`,
     `--app-zebra`, `--app-card`.
   - `--brand-600` aliases `--accent`; `--brand-500/700` are `color-mix()` derivations.
     Any accent change (manual picker or preset) recolours the brand layer for free.
   - `ThemeCSSVars` gains optional `--app-grid`, `--app-zebra`, `--app-card`,
     `--brand-500`, `--brand-ink`; `ThemePreset` gains `corners?: 'rounded' | 'square'`.
2. **Leak-proofing is mandatory.** `applyPresetCSSVars` clears `OPTIONAL_VARS` before
   every apply and fills fallbacks (`--app-card ← --app-surface`,
   `--app-grid ← --app-border`) through a single `writeVars` helper.
3. **Square corners are a CSS override, not a codemod.** `html[data-corners='square']
   :is(.rounded-*)` sets `border-radius: 2px`. Specificity `(0,2,1)` beats
   `hover:rounded-*` `(0,2,0)` per the cascade, so it needs **no `!important`** and is
   opt-in per preset via `corners`.
4. **Ship `al-mizan-classic` as a dual-mode preset (M1)** so it appears in the gallery
   in both light and dark and never depends on generic dark derivation.
   Light `#F2F1EE` / `#F58220` / `#1F1F1F`; dark `#0F172A` / `#1E293B` / `#FB923C`
   (see the M2.5 palette table for the tuned values).
5. **AA gate scoped to the brand layer, legacy debt frozen.** `presets.test.ts`
   enforces ≥ 4.5:1 for every non-exempt light accent, and freezes the 21 existing
   violations in `LEGACY_AA_DEBT` with two guards: the list must stay stale-free
   (fixing a preset forces its removal) and no brand-layer preset may ever be exempt.

## Considered alternatives

| Alternative | Why rejected |
| --- | --- |
| Codemod `bg-blue-600` → `bg-brand` across 224 sites (M5 as prerequisite) | Large blast radius during a visual change; the token layer delivers the same benefit incrementally. |
| Rewrite 2 175 `rounded-*` utilities to `rounded-[var(--radius)]` | High risk, no visual gain; CSS override is 6 lines and reversible. |
| White text on `#F58220` ribbon (as Al-Mizan does) | 2.59:1 fails WCAG AA; charcoal `#1F1F1F` gives ≈7.0:1 at the same vibrancy. |
| Fix all 21 legacy accents now | Silently restyles existing users' themes; belongs in its own reviewed change. |
| Make `al-mizan-classic` the default preset | Would override every existing user's persisted choice on upgrade. |

## Consequences

**Positive**

- The identity is reachable with two files of CSS + one preset; components untouched.
- `--app-card` is now defined ⇒ the transparent-card bug is closed for all themes.
- Token leakage between presets is structurally prevented (`OPTIONAL_VARS`).
- New themes cannot regress AA without failing CI.

**Negative / accepted**

- `color-mix()` requires evergreen browsers (already used in this stylesheet).
- `data-corners` is set by `applyPresetCSSVars`; a preset applied before hydration
  keeps the CSS default (`rounded`) until the store initialises — no flash risk because
  `rounded` is the default appearance.
- 21 legacy presets remain sub-AA until a dedicated accessibility pass.

## Verification

`npm run type-check` · `npx vitest run src/features/appearance/presets/presets.test.ts`
· `npx vitest run src/lib/themeStore.test.ts` · `npm test` · `npm run lint`
· `npm run check:fonts` · `npm run check:encoding`

Behavioural proof of the M0 leak fix lives in `src/lib/themeStore.test.ts`
(applies Al-Mizan → switches to `clean-white` → asserts no `--brand-*` / `--app-zebra`
leftover, `--app-card`/`--app-grid` fallbacks, and `data-corners` reset to `rounded`).

---

## M2 — Classic shell (title bar + menu bar + ribbon)

**Decided:** the classic identity is not only a palette; it is a *shell*. M2 adds an
optional wide-screen shell and a persisted preference that selects it.

### Model

| Layer | Type | Values | Default |
| --- | --- | --- | --- |
| Preset (suggestion) | `ThemePreset.layout` | `'modern' \| 'classic'` | undefined ⇒ `modern` |
| User (override) | `themeStore.uiLayout` | `'auto' \| 'modern' \| 'classic'` | `'auto'` |

`resolveShellVariant(uiLayout, presetLayout, isWideScreen)` (pure, exported from
`src/ui/layout/useLayoutVariant.ts`) merges the two and **always returns `modern`
below the `lg` breakpoint (1024px)** — phones and portrait iPads keep the sidebar/Drawer
+ bottom-navigation experience from ADR-014, and the ribbon (6 groups, ~19 items) gets a
width it can actually lay out.

### Components (`src/ui/layout/classic/`)

| File | Responsibility |
| --- | --- |
| `ribbonModel.ts` | Pure model: `RIBBON_GROUPS` (6 groups), `CLASSIC_MENUS` (file/view/reports), `buildRibbonGroups`, `buildClassicMenus`, `isRibbonPathActive`, `findMenuItemForPath`, `isLayoutAction*`. No React. |
| `useClassicChrome.ts` | State: layout preference, theme, ribbon collapse (persisted under `STORAGE_KEYS.CLASSIC_RIBBON_COLLAPSED`), command dispatch. |
| `useOpenMenu.ts` / `useDismissOnOutside.ts` | One open menu at a time; dismiss on outside click or `Escape`. |
| `ClassicTitleBar.tsx` + `ClassicQuickSearch.tsx` | Brand mark (`--brand-500`/`--brand-ink`), page title, quick search → `/inventory?search=` (same behaviour as the modern header), `HeaderActions` reused as-is. |
| `ClassicMenuBar.tsx` + `ClassicMenuPanel.tsx` | `ملف / عرض / التقارير` with correct ARIA (`menubar`/`menuitem`/`menuitemradio`) and layout options shown as radios. |
| `ClassicRibbon.tsx` | Grouped icon buttons in Office order, `aria-current="page"` on the active route. |
| `ClassicChrome.tsx` | Composition only. |

### Invariants (enforced by tests)

1. **No invented navigation.** `RIBBON_ITEM_IDS` must equal `MENU_ITEMS.map(id)` exactly —
   one placement per item, no duplicates, no orphans (`ribbonModel.test.ts`).
2. **No dead menu entries.** Every `CLASSIC_MENUS` entry carries either a `ROUTES.*` path
   or a known action id.
3. **Permissions are honoured.** The ribbon is built from `useVisibleMenuItems()`
   (the same `useAllPermissions()` filter the sidebar uses), and empty groups disappear.
4. **Narrow screens never get the ribbon.** `resolveShellVariant(..., isWideScreen = false)`
   returns `'modern'` for every input (phones, tablets in portrait, split-screen windows).

### Styling

Chrome styling lives in one `@layer components` block in `src/index.css`
(`.classic-titlebar`, `.classic-menubar`, `.classic-menu-panel`, `.classic-ribbon*`,
`.classic-brand-mark`). It uses only existing tokens (`--app-*`, `--brand-500/600/ink`),
adds no `!important`, keeps every font ≥ 10px, and pins `border-radius: 2px` so the
chrome stays square even if the user pairs the classic shell with a rounded preset.
Focus rings use `outline: 2px solid var(--accent)` instead of relying on removed outlines.

### Verification (M2)

`npm run type-check` · `npx vitest run src/ui/layout` (ribbon model + shell variant +
`ClassicRibbon`/`ClassicMenuBar` render tests) · `npx vitest run src/lib/themeStore.test.ts`
· `npx eslint src/ui/layout/classic src/ui/layout/useLayoutVariant.ts`
· `npm run check:fonts` · `npm run check:encoding` · `npm run check:layers`
· `npm run check:classes` · `npm run check:lint-total` · `npm run build`

**Result (2026-11-03):** full suite 151 files / 1139 tests green; `tsc --noEmit` 0 errors;
`eslint` clean on all `classic/*` files and `useLayoutVariant.ts`; `check:lint-total`
reports no new debt (9610/214 baseline); `build` exit 0 with `.classic-titlebar`,
`.classic-menu-panel`, `.classic-ribbon-item`, `--brand-500` and
`html[data-corners=square]` present in the emitted CSS.

### M2.5 — Palette & chrome theming (light + dark)

The classic identity originally borrowed `--app-*` directly, which made the chrome read
like any other page and left it without depth at night. M2.5 introduces a **dedicated
chrome token layer** so the shell owns its own colours while every other preset keeps
working unchanged.

**Token layer** (`ThemeCSSVars`, exported list `CLASSIC_CHROME_VARS` in
`src/features/appearance/classicTokens.ts`):

| Token | Role |
| --- | --- |
| `--classic-chrome` / `--classic-chrome-2` | Titlebar and menubar/ribbon surfaces (two-step depth) |
| `--classic-chrome-border` | Dividers between chrome bands and ribbon groups |
| `--classic-hover` / `--classic-hover-border` | Pointer affordance for menu button, menu item and ribbon item |
| `--classic-active` / `--classic-active-border` | Selected ribbon item background + outline |
| `--classic-icon` / `--classic-icon-fg` | Quiet icon chip (neutral until hover/selection) |
| `--classic-panel` / `--classic-panel-border` / `--classic-panel-shadow` | Dropdown menu panel |

- Defaults live in `:root` and `.dark` as `color-mix()` derivations of the active theme,
  so **any** preset is usable with the classic shell; `al-mizan-classic` pins explicit
  hex values in both `light` and `dark` for a deterministic Office-like look.
- `CLASSIC_CHROME_VARS` is spread into `OPTIONAL_VARS` in `themeStore`, so switching
  presets clears the inline values and the CSS defaults take over — the same
  leak-proofing rule as `--app-grid`/`--brand-500`.
- Ribbon labels stay at 11px (dense accounting chrome, ≥ 10px floor) while menubar and
  dropdown items moved to 12px, matching the "interactive text ≥ 12px" convention.

**Palette decisions**

| Slot | Light | Dark |
| --- | --- | --- |
| `--app-bg` / `--app-surface` | `#f2f0ec` / `#ffffff` (warm paper on a light desk) | `#17140f` / `#201c16` (warm ink) |
| `--app-card` | `#ffffff` | `#2a241c` (raised panel, one step above the surface) |
| `--app-surface-hover` | `#f6efe3` | `#3a3226` |
| `--app-border-subtle` | `#f0eee9` (1.16:1) | `#332c23` (1.12:1) |
| `--app-border` | `#e6e2da` (1.29:1 — divider, not a control) | `#3d362c` (1.29:1) |
| `--app-border-strong` | `#948c7d` (3.33:1 — controls, WCAG 1.4.11) | `#82705a` (3.23:1) |
| `--app-text` / `--app-text-secondary` | `#1b1b19` / `#5a564f` | `#f4efe6` / `#b9ac99` |
| `--accent` | `#c2410c` (5.2:1 on white) | `#fb923c` (6.8:1 on card) |
| `--brand-500` / `--brand-ink` | `#f58220` / `#1b1b19` | `#f58220` / `#1b1207` (brand orange is mode-invariant) |
| `--app-grid` / `--app-zebra` | `#e0dcd3` / `#fbfaf7` | `#423a30` / `#211d17` |
| `--classic-chrome` / `-2` | `#f7f6f3` / `#fbfaf8` | `#2f2822` / `#26201a` |
| `--classic-hover` / `-border` | `#fdf0e0` / `#b57c3d` (3.2:1 on hover) | `#3b3226` / `#8d7a5f` (3.1:1) |
| `--classic-active` / `-border` | `#fce4c8` / `#c2410c` | `#473923` / `#f07f18` |
| `--classic-icon` / `--classic-icon-fg` | `#f3efe7` / `#9a4a08` | `#3a3227` / `#fdba74` (amber glyph keeps the warm identity) |
| `--classic-panel` / `-border` / `-shadow` | `#ffffff` / `#ddd8cf` / light | `#2b241d` / `#4a3f33` / `rgb(10 7 4 / 65%)` |

**Why the night skin can finally be warm: the slate bridge**

The first night skin was forced onto the steel/slate band for a *structural* reason, not a
taste one: the application does not paint its dark mode with theme tokens — it uses
**1,196 `dark:bg-slate-*` utilities (4,344 slate utilities in total) across 344 files**,
and many of them are translucent (`/30`, `/40`, `/50`) composited over `--app-bg`. Tokens
alone could not retint them, so a warm `--app-bg` was physically mixed with blue-grey slate
and every screen looked muddy — while the cards, whose colour comes from those same
utilities, never matched the Mizan paper identity at all.

M2.5 closes that gap with **palette indirection instead of a 344-file codemod**:

1. `tailwind.config.js` binds the whole `slate` scale (50–950, plus the project's `750` /
   `850`) to CSS variables: `rgb(var(--slate-800, 30 41 59) / <alpha-value>)`. The
   fallback is Tailwind's own hex, so every other preset renders byte-for-byte as before,
   and the `<alpha-value>` slot keeps `dark:bg-slate-800/40` working.
2. `MIZAN_NIGHT_SLATE` (`src/features/appearance/classicTokens.ts`) supplies the warm
   `R G B` triplets, and the preset's `dark` block spreads them. From that moment every
   slate utility — background, border, divide, ring, gradient, placeholder, hover — lands
   in the warm family at once, with **zero component edits**.
3. `MIZAN_NIGHT_SLATE_VARS` is spread into `OPTIONAL_VARS` in `themeStore`, so switching to
   any other preset restores native slate (the same leak-proofing rule as `--classic-*`).
4. Light mode deliberately does **not** override the scale: the already-approved daytime
   skin is untouched, and a test asserts it.

Matching pairs are locked by tests: `--slate-950 ↔ --app-bg`, `--slate-900 ↔ --app-surface`,
`--slate-800 ↔ --app-card`, `--slate-750 ↔ --app-surface-hover`.

**Two defects fixed in the legacy token bridge (`index.css`)**

- `dark:bg-slate-800` / `gray-800` were mapped to `--app-surface-hover` with `!important`.
  Because that is the single most-used card class, **every card was painted in the hover
  tone**, flattening the whole elevation ladder to one step — the core reason the night UI
  read as a generic flat dashboard rather than a paper/panel accounting app. It now maps to
  `--app-card`.
- `dark:bg-slate-900/50` and `/30` were forced **opaque** (also with the hover tone),
  destroying translucent depth. They are now
  `color-mix(in srgb, var(--app-surface) 50%|30%, transparent)`.

**M2.6 — Border tiers and the missing day bridge (why both modes still felt off)**

After the warm night skin landed, both modes were still reported as “الألوان غير مرضية”.
Measuring the actual utilities explained it — the palette was never the whole story:

1. **One border token for three semantic weights.** The legacy override layer mapped
   `border-gray-100`, `border-gray-200`, `border-gray-300`, `dark:border-slate-800`,
   `dark:border-slate-700` **and** `dark:border-slate-600` onto a single `--app-border`
   at ≈ 3.5:1. With **383 light hairlines** and **1,347 night hairlines** in the code base,
   every table and card was outlined at mid-weight: the light UI looked like a grey
   pencil wireframe on white, the night UI like warm graph paper. Fixed with three tiers
   (`--app-border-subtle` ≈ 1.15, `--app-border` ≈ 1.30, `--app-border-strong` ≥ 3.2),
   mapped per utility family in `index.css`. WCAG 1.4.11 (≥ 3:1) now belongs to
   `--app-border-strong` — the tier that actually draws form controls — while the
   decorative divider tier is free to be a hairline. `APP_BORDER_TIER_VARS` is cleared per
   theme switch, and every other preset falls back to its own `--app-border`, so no other
   theme changes visually.
2. **Form fields** were the reason the old heavy token existed: hundreds of inputs paint
   `border-[var(--app-border)]`. A single rule now lifts form controls to the strong tier
   (`input/select/textarea` inside `[data-theme-scope]`) instead of forcing every divider
   to control weight.
3. **`dark:divide-slate-800`** (54 row dividers) equals `--app-card` inside the night scale,
   so dark tables had no row separators at all (1.00:1). Dividers are now raised to the
   divider tier; `divide-gray-100/200` map to subtle/divider.
4. **The day mode had no bridge.** `slate` was only rebound at night, so **311 `bg-slate-50`,
   238 `bg-slate-100`, 87 `bg-slate-200` and 95 `bg-gray-100`** painted steel-blue patches
   (`#f8fafc`, `#f1f5f9`, `#e2e8f0`) on warm paper. `MIZAN_DAY_SLATE` now binds the same 13
   keys to a warm scale aligned to the paper, so both modes are retinted by the same
   mechanism, and the AA floor is preserved (`slate-500` 4.7:1 on white, better than
   native `#64748b`).
5. **Cool remnants outside the token layer**: the scrollbar thumb (`#94a3b8`/`#64748b`),
   `.dark .scroll-x-hint-solid` (`#0f172a`) and the Recharts grid/axis/legend/tooltip
   colours baked inside components (`#334155`, `#94a3b8`, `#cbd5e1`, `#0f172a`) now read
   `--app-*` tokens. Charts are fixed **without touching a component**: SVG presentation
   attributes have lower priority than any CSS rule, so
   `.recharts-cartesian-grid line { stroke: var(--app-grid) }` wins.

**Visual refinements**

- Titlebar: subtle two-stop gradient plus a 3px brand rule (`inset 0 3px 0 var(--brand-500)`)
  — identity without any layout shift or text-contrast cost.
- Ribbon icons are **neutral by default** and only turn solid brand on hover/selection, so
  19 simultaneous orange squares no longer compete for attention; the selected item also
  gets an inset 3px bottom bar in `--accent` (4.2:1 / 4.9:1 against `--classic-active`),
  i.e. selection is not colour-only.
- Dropdown menus gained a separator between navigation entries and view commands, the
  check glyph now uses `--accent`, and the panel shadow is a token (dark mode needs a
  much heavier shadow than light mode).
- 120ms colour transitions, disabled under `prefers-reduced-motion: reduce`.

**Gate** (`src/features/appearance/presets/classicIdentity.test.ts`, 21 tests).

*Identity (11):* token list ⇄ preset sync, both modes defined, AA (≥ 4.5) for text on every
chrome surface, ribbon labels on hover/active, icon glyph on chip, accent on chrome
surfaces; ≥ 3:1 for the active indicator (WCAG 1.4.11), ≥ 3:1 for the **control** border
tier, and a **tier-separation test** — the divider must stay ≤ 1.5:1 and the subtle tier
≤ 1.25:1, with subtle < divider < control strictly ordered, so the "one heavy border token"
regression cannot come back; a layering-direction test (who is brighter than whom, per
mode); and a **warm-family hue guard** — every night surface must stay warm (R > B) inside
hue 15–50 with a spread ≤ 20°, which fails CI if anyone re-introduces a grey/steel night
skin that no longer matches the paper identity.

*Slate bridge (10):* every shade the UI uses is bound; every value is a valid `R G B`
triplet (the only format that survives `/alpha` modifiers); the scale is warm **and**
strictly ordered light → dark; the four matched pairs (`--slate-950 ↔ --app-bg`,
`--slate-900 ↔ --app-surface`, `--slate-800 ↔ --app-card`,
`--slate-750 ↔ --app-surface-hover`); a **real elevation ladder** (page < surface < card <
hover — the bug that made cards look flat); the preset stays in sync with the token map;
**both** modes bind the scale (day scale by day, night scale by night), the day scale is
warm, ordered and keeps `slate-500` ≥ 4:1 on paper / `slate-600` ≥ 7:1 on white; slate text
shades stay AA on the slate card; and no other preset may define `--slate-*`.

`src/lib/themeStore.test.ts` additionally asserts **on the DOM** that the three border
tiers are actually written to `documentElement` and that they are cleared (not leaked) when
switching to a preset that does not define them.

**Result (2026-11-03, M2.6):** full suite **152 files / 1161 tests green (exit 0)**;
`tsc --noEmit` 0 errors; `eslint` clean on every touched file;
`check:lint-total` 9609/214 = baseline (no new debt); `check:encoding` / `check:fonts` /
`check:classes` / `check:layers` pass; `npm run build` exit 0 (26.0s). The emitted CSS
contains the `!important` card mapping (`dark:bg-slate-800 → var(--app-card)`), the restored
transparent regions (`color-mix(… 50%|30%, transparent)`), all 13
`rgb(var(--slate-N, …) / <alpha-value>)` bindings, the three border tiers
(`border-gray-100 → --app-border-subtle`, `-200 → --app-border`,
`-300 → --app-border-strong`), the `divide-*` row-divider mappings, the form-control border
rule, the Recharts grid/axis/legend/tooltip token rules, all 12 `--classic-*` tokens, and
the `.classic-menu-separator` / `.classic-ribbon-label` rules.

A static comparison page for choosing the palette **direction** lives at
`docs/preview/mizan-palette-directions.html` (three directions × light/dark, built from the
same tokens as the preset; verified to render without JS errors).

### Not in M2 (deliberate)

- Ribbon **contextual tabs** (selection-driven) — needs per-screen command registries.
- Ribbon **keyboard accelerators** (Alt+F…) — requires a global shortcut layer.
- Route-level restyle of tables/forms to Excel-like density — that is M3.
- **Remaining neutral families.** `slate` is bridged in **both** modes (4,344 utilities) and
  `gray-800/900/950` flow through the legacy token layer; the ~119 other `dark:*-gray-*`
  utilities (and any `zinc`/`neutral` usage) keep Tailwind's native grey. Bounding the bridge
  to `slate` kept this change reviewable; widening it is a separate, mechanical step (same
  pattern: bind the family in `tailwind.config.js`, add a `MIZAN_DAY_*` / `MIZAN_NIGHT_*` map).
- **Chart series colours** (the ~40 hard-coded `#0f172a` / `#334155` / `#64748b` values inside
  dashboards) are only normalised where they act as *chrome* (grid, axes, legend, tooltip);
  the series palette itself is still the component-level default and would need a chart
  registry to be theme-driven.

