import { describe, expect, it } from 'vitest';
import { THEME_PRESETS } from '../../features/appearance/constants';
import { resolveShellVariant } from './useLayoutVariant';

describe('resolveShellVariant', () => {
  it('auto يتبع اقتراح الثيم على سطح المكتب', () => {
    expect(resolveShellVariant('auto', 'classic', true)).toBe('classic');
  });

  it('auto مع ثيم حديث أو بلا اقتراح يعطي الشكل الحديث', () => {
    expect(resolveShellVariant('auto', 'modern', true)).toBe('modern');
    expect(resolveShellVariant('auto', undefined, true)).toBe('modern');
  });

  it('الهاتف يبقى على الشكل الحديث حتى مع تفضيل كلاسيكي صريح', () => {
    expect(resolveShellVariant('classic', 'classic', false)).toBe('modern');
    expect(resolveShellVariant('auto', 'classic', false)).toBe('modern');
  });

  it('لا يظهر الشريط قبل عرض 1024px (آيباد طولي يبقى حديثاً)', () => {
    // lg = 1024px هو الحد المعتمد في useLayoutVariant — أي عرض أدنى يعطي الشكل الحديث
    expect(resolveShellVariant('classic', 'classic', false)).toBe('modern');
    expect(resolveShellVariant('classic', 'classic', true)).toBe('classic');
  });

  it('التفضيل الصريح للمستخدم يتجاوز اقتراح الثيم على سطح المكتب', () => {
    expect(resolveShellVariant('modern', 'classic', true)).toBe('modern');
    expect(resolveShellVariant('classic', 'modern', true)).toBe('classic');
  });
});

describe('اقتراح الشكل في الثيمات', () => {
  it('ثيم الميزان الكلاسيكي يعلن الشكل الكلاسيكي', () => {
    const preset = THEME_PRESETS.find(item => item.id === 'al-mizan-classic');
    expect(preset?.layout).toBe('classic');
  });

  it('الثيمات الكلاسيكية المعلنة تقتصر على ثيمات الميزان والذهبي المحددة', () => {
    const classicPresets = THEME_PRESETS.filter(item => item.layout === 'classic').map(
      item => item.id
    );
    expect(classicPresets).toEqual(['classic-golden-erp', 'al-mizan-classic', 'al-mizan-pro']);
  });
});
