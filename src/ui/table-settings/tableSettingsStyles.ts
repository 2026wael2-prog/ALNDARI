import type React from 'react';
import type { TableSettings } from './tableSettingsStore';

const DENSITY_PADDING_Y: Record<TableSettings['density'], string> = {
  compact: '3px',
  normal: '7px',
  comfortable: '12px',
};

/**
 * يحوّل إعدادات الجدول إلى متغيرات CSS محلية تُطبّق على حاوية الجدول مباشرة
 * بأداء فوري وصفر إعادة رسم ثقيلة للصفوف.
 */
export function buildTableCustomStyle(settings: TableSettings): React.CSSProperties {
  const vars: Record<string, string> = {
    '--tbl-font-size': `${settings.fontSize}px`,
    '--tbl-font-weight': settings.fontWeight,
    '--tbl-row-py': DENSITY_PADDING_Y[settings.density],
    '--tbl-white-space': settings.wrapText ? 'normal' : 'nowrap',
  };

  if (settings.fontFamily && settings.fontFamily !== 'inherit') {
    vars['--tbl-font-family'] = settings.fontFamily;
  }
  if (settings.headerBg) vars['--tbl-header-bg'] = settings.headerBg;
  if (settings.headerText) vars['--tbl-header-fg'] = settings.headerText;
  if (settings.zebraBg) vars['--tbl-zebra-bg'] = settings.zebraBg;
  if (settings.borderColor) vars['--tbl-border'] = settings.borderColor;
  if (settings.hoverBg) vars['--tbl-hover-bg'] = settings.hoverBg;

  return {
    ...(vars as React.CSSProperties),
    fontVariantNumeric: settings.tabularNums ? 'tabular-nums' : 'normal',
  };
}

/** هل توجد إعدادات مخصّصة فعالة على هذا الجدول؟ */
export function hasActiveTableCustomization(settings: TableSettings): boolean {
  return (
    settings.hiddenColumns.length > 0 ||
    settings.columnOrder.length > 0 ||
    settings.customColumns.length > 0 ||
    settings.zoom !== 1 ||
    settings.fontSize !== 12 ||
    settings.density !== 'normal' ||
    settings.wrapText ||
    settings.fontFamily !== 'inherit' ||
    settings.fontWeight !== '600' ||
    !settings.tabularNums ||
    Boolean(settings.headerBg) ||
    Boolean(settings.headerText) ||
    Boolean(settings.zebraBg) ||
    Boolean(settings.borderColor) ||
    Boolean(settings.hoverBg)
  );
}
