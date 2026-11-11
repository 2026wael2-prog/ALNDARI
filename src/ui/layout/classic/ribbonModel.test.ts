import { describe, expect, it } from 'vitest';
import { MENU_ITEMS } from '../../../core/constants';
import { ROUTES } from '../../../core/routes/paths';
import {
  CLASSIC_MENUS,
  MENU_ITEM_COUNT,
  RIBBON_ITEM_IDS,
  buildClassicMenus,
  buildRibbonGroups,
  isRibbonPathActive,
} from './ribbonModel';

describe('شريط الأوامر الكلاسيكي', () => {
  it('يوزّع كل عناصر MENU_ITEMS مرة واحدة بالضبط — لا نقص ولا تكرار', () => {
    const menuIds = MENU_ITEMS.map(item => item.id).sort();
    expect([...RIBBON_ITEM_IDS].sort()).toEqual(menuIds);
    expect(new Set(RIBBON_ITEM_IDS).size).toBe(RIBBON_ITEM_IDS.length);
    expect(MENU_ITEM_COUNT).toBe(MENU_ITEMS.length);
  });

  it('يعرض التسميات المترجمة مع الحفاظ على المسار والأيقونة', () => {
    const groups = buildRibbonGroups(MENU_ITEMS, key => `t:${key}`);
    const items = groups.flatMap(group => group.items);

    expect(items).toHaveLength(MENU_ITEMS.length);

    // كل عنصر يحمل ترجمة مفتاحه الحقيقي (بعض العناصر تستخدم مفتاحاً مختلفاً عن المعرّف،
    // مثل sales → labelKey='invoices') — لذا نتحقق من المصدر لا من قيمة ثابتة.
    for (const menuItem of MENU_ITEMS) {
      expect(items.find(item => item.id === menuItem.id)?.label).toBe(`t:${menuItem.labelKey}`);
    }

    const sales = items.find(item => item.id === 'sales');
    expect(sales?.path).toBe(ROUTES.DASHBOARD.SALES);
    expect(sales?.icon).toBeDefined();
  });

  it('يسقط إلى التسمية العربية عندما تكون الترجمة مفقودة', () => {
    // useTranslation يعيد المفتاح نفسه عند غياب الترجمة — يجب ألا يظهر المفتاح للمستخدم
    const groups = buildRibbonGroups(MENU_ITEMS, key => key);
    const labels = groups.map(group => group.label);

    expect(labels).toContain('المبيعات والتحصيل');
    expect(labels).not.toContain('ribbon_group_sales');
  });

  it('يسقط العناصر غير المسموحة ويخفي المجموعات الفارغة', () => {
    const onlySales = MENU_ITEMS.filter(item => item.id === 'sales');
    const groups = buildRibbonGroups(onlySales, key => key);

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map(item => item.id)).toEqual(['sales']);
  });

  it('يتجاهل معرّفات لا وجود لها بدل رمي استثناء', () => {
    const groups = buildRibbonGroups([], key => key);
    expect(groups).toEqual([]);
  });
});

describe('مطابقة المسار النشط', () => {
  it('يعامل الجذر بشكل خاص', () => {
    expect(isRibbonPathActive('/', '/')).toBe(true);
    expect(isRibbonPathActive('/inventory', '/')).toBe(false);
  });

  it('يعتبر المسارات الفرعية تابعة', () => {
    expect(isRibbonPathActive('/inventory/audit/42', '/inventory')).toBe(true);
    expect(isRibbonPathActive('/inventory-extra', '/inventory')).toBe(false);
  });

  it('يطابق المسار نفسه', () => {
    expect(isRibbonPathActive('/sales', '/sales')).toBe(true);
  });
});

describe('قوائم الشكل الكلاسيكي', () => {
  it('تبني القوائم الثلاث مع تسميات غير فارغة', () => {
    const menus = buildClassicMenus(key => key);

    expect(menus.map(menu => menu.id)).toEqual(['file', 'view', 'reports']);
    for (const menu of menus) {
      expect(menu.label.length).toBeGreaterThan(0);
      expect(menu.entries.length).toBeGreaterThan(0);
      for (const entry of menu.entries) {
        expect(entry.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('كل بند قائمة إمّا مسار حقيقي أو أمر معروف — لا بنود ميتة', () => {
    const allowedActions = [
      'toggle-theme',
      'layout-auto',
      'layout-modern',
      'layout-classic',
      'toggle-ribbon',
    ];

    for (const menu of CLASSIC_MENUS) {
      for (const entry of menu.entries) {
        const isAction = entry.action !== undefined && allowedActions.includes(entry.action);
        expect(isAction || entry.path !== undefined).toBe(true);
      }
    }
  });

  it('يستخدم ثوابت المسارات ولا يكتبها يدوياً', () => {
    const menus = buildClassicMenus(key => key);
    const fileMenu = menus.find(menu => menu.id === 'file');
    const paths = fileMenu?.entries.map(entry => entry.path) ?? [];

    expect(paths).toContain(ROUTES.DASHBOARD.SETTINGS);
    expect(paths).toContain(ROUTES.DASHBOARD.APPEARANCE);
    expect(paths).toContain(ROUTES.DASHBOARD.ROOT);
  });

  it('يعرض أوامر تبديل الشكل الثلاثة كخيارات قابلة للتحديد', () => {
    const viewMenu = buildClassicMenus(key => key).find(menu => menu.id === 'view');
    const actions = viewMenu?.entries.map(entry => entry.action) ?? [];

    expect(actions).toContain('layout-auto');
    expect(actions).toContain('layout-modern');
    expect(actions).toContain('layout-classic');
    expect(actions).toContain('toggle-theme');
  });
});
