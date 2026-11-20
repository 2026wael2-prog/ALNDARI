import type React from 'react';
import type { TableSettings } from './tableSettingsStore';

const DENSITY_PADDING_Y: Record<TableSettings['density'], string> = {
  compact: '3px',
  normal: '7px',
  comfortable: '12px',
};

const resolveOptionalCssVars = (settings: TableSettings): Record<string, string> => {
  const entries: Array<[string, string | undefined]> = [
    ['--tbl-header-bg', settings.headerBg],
    ['--tbl-header-fg', settings.headerText],
    ['--tbl-zebra-bg', settings.zebraBg],
    ['--tbl-border', settings.borderColor],
    ['--tbl-hover-bg', settings.hoverBg],
    ['--tbl-font-family', settings.fontFamily !== 'inherit' ? settings.fontFamily : undefined],
  ];
  const validEntries = entries.filter(
    (pair): pair is [string, string] => pair[1] !== undefined && pair[1] !== ''
  );
  return Object.fromEntries(validEntries);
};

/**
 * يحوّل إعدادات الجدول إلى متغيرات CSS محلية تُطبّق على حاوية الجدول مباشرة
 * بأداء فوري وصفر إعادة رسم ثقيلة للصفوف.
 */
export function buildTableCustomStyle(settings: TableSettings): React.CSSProperties {
  const zoomFactor = Number.isFinite(settings.zoom) && settings.zoom > 0 ? settings.zoom : 1;
  const scaledFontSize = Math.round(settings.fontSize * zoomFactor * 10) / 10;
  const baseVars: Record<string, string> = {
    '--tbl-font-size': `${String(scaledFontSize)}px`,
    '--tbl-zoom': String(zoomFactor),
    '--tbl-font-weight': settings.fontWeight,
    '--tbl-row-py': DENSITY_PADDING_Y[settings.density],
    '--tbl-white-space': settings.wrapText ? 'normal' : 'nowrap',
  };

  return {
    ...baseVars,
    ...resolveOptionalCssVars(settings),
    fontVariantNumeric: settings.tabularNums ? 'tabular-nums' : 'normal',
  };
}

const hasStructuralCustomization = (settings: TableSettings): boolean =>
  settings.hiddenColumns.length > 0 ||
  settings.columnOrder.length > 0 ||
  settings.customColumns.length > 0 ||
  settings.zoom !== 1 ||
  settings.fontSize !== 12 ||
  settings.density !== 'normal' ||
  settings.wrapText;

const hasVisualCustomization = (settings: TableSettings): boolean =>
  settings.fontFamily !== 'inherit' ||
  settings.fontWeight !== '600' ||
  !settings.tabularNums ||
  Boolean(settings.headerBg) ||
  Boolean(settings.headerText) ||
  Boolean(settings.zebraBg) ||
  Boolean(settings.borderColor) ||
  Boolean(settings.hoverBg);

/** هل توجد إعدادات مخصّصة فعالة على هذا الجدول؟ */
export function hasActiveTableCustomization(settings: TableSettings): boolean {
  return hasStructuralCustomization(settings) || hasVisualCustomization(settings);
}
