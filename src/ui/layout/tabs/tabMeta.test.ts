import { describe, it, expect } from 'vitest';
import { getTabMeta, QUICK_LAUNCH_ITEMS } from './tabMeta';
import { ROUTES } from '../../../core/routes/paths';
import { MENU_ITEMS } from '../../../core/constants';
import ar from '../../../lib/locales/ar.json';

describe('tabMeta — توحيد المصطلحات بين الواجهتين', () => {
  it('returns unified root meta for home', () => {
    const meta = getTabMeta('/');
    expect(meta.title).toBe('الرئيسية');
    expect(meta.iconKey).toBe('LayoutDashboard');
  });

  it('returns unified titles for sales, purchases, and pos', () => {
    expect(getTabMeta(ROUTES.DASHBOARD.SALES).title).toBe('المبيعات');
    expect(getTabMeta(ROUTES.DASHBOARD.PURCHASES).title).toBe('المشتريات');
    expect(getTabMeta(ROUTES.DASHBOARD.POS).title).toBe('نقطة البيع');
  });

  it('returns unified titles for bonds, accounting, and inventory intelligence', () => {
    expect(getTabMeta(ROUTES.DASHBOARD.BONDS).title).toBe('السندات المالية');
    expect(getTabMeta(ROUTES.DASHBOARD.ACCOUNTING).title).toBe('المحاسبة');
    expect(getTabMeta(ROUTES.DASHBOARD.INVENTORY_INTELLIGENCE).title).toBe('ذكاء المخزون');
  });

  it('strips query parameters when determining tab meta', () => {
    const meta = getTabMeta('/inventory?filter=low_stock&category=oil');
    expect(meta.title).toBe('المخزون');
    expect(meta.iconKey).toBe('Package');
  });

  it('matches EVERY MENU_ITEMS canonical Arabic label identically across Modern, Classic, and Tabs', () => {
    const dict = ar as Record<string, string>;
    for (const item of MENU_ITEMS) {
      const canonicalLabel = dict[item.labelKey];
      expect(canonicalLabel).toBeTruthy();
      expect(getTabMeta(item.path).title).toBe(canonicalLabel);
    }
  });

  it('provides quick launch items including purchases with valid titles and paths', () => {
    expect(QUICK_LAUNCH_ITEMS.length).toBeGreaterThan(5);
    expect(QUICK_LAUNCH_ITEMS.some(item => item.path === ROUTES.DASHBOARD.PURCHASES)).toBe(true);
    QUICK_LAUNCH_ITEMS.forEach(item => {
      expect(item.title).toBeTruthy();
      expect(item.path).toBeTruthy();
      expect(item.iconKey).toBeTruthy();
    });
  });
});
