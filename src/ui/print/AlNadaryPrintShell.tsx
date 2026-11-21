import React from 'react';
import { ALNADARY_PRINT_CSS } from './alNadaryPrintStyles';
import { AlNadaryPrintHeader, type AlNadaryPrintHeaderProps } from './AlNadaryPrintHeader';
import { usePrintTemplateStore } from './printTemplateStore';
import { usePrintSettings } from '@/features/settings/settingsStore';

export interface AlNadaryPrintShellProps extends AlNadaryPrintHeaderProps {
  children: React.ReactNode;
  /** عرض الشروط الافتراضية أسفل الفاتورة */
  showDefaultTerms?: boolean;
  /** شروط مخصصة اختيارية */
  terms?: readonly string[];
  /** تسميات التوقيعات الثلاثة في التذييل */
  signatures?: readonly [string, string, string];
  /** إخفاء التذييل بالكامل (مثل وضع عرض الترويسة فقط على الشاشة) */
  hideFooter?: boolean;
  className?: string;
}

const clampMm = (val: number | undefined, fallback: number): number => {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(0, Math.min(40, val));
};

/**
 * القالب الموحد المركزي للطباعة (Unified Print Template) لشركة النظاري.
 * يجمع الأنماط الرسمية (A4 RTL) + الهيدر الموحد القابل للتعديل + المحتوى + الشروط والتوقيعات،
 * ويربطها بإعدادات الطباعة المحفوظة (حجم الورق، الاتجاه، الهوامش، إظهار الترويسة/التذييل).
 */
export const AlNadaryPrintShell: React.FC<AlNadaryPrintShellProps> = ({
  children,
  showDefaultTerms = true,
  terms,
  signatures,
  hideFooter = false,
  className = '',
  ...headerProps
}) => {
  const tpl = usePrintTemplateStore(s => s.config);
  const printSettings = usePrintSettings();
  const resolvedTerms = terms ?? tpl.terms.filter(Boolean);
  const resolvedSignatures = signatures ?? tpl.signatures;
  const hideLetterhead = printSettings.print_header === false;
  const shouldShowFooter = !hideFooter && printSettings.print_footer !== false;
  const shouldShowTerms = showDefaultTerms && tpl.showTerms && resolvedTerms.length > 0;
  const shouldShowSignatures = tpl.showSignatures && resolvedSignatures.length > 0;

  const pageSize = printSettings.paper_size || 'A4';
  const orientation = printSettings.orientation === 'landscape' ? 'landscape' : 'portrait';
  const marginTop = clampMm(printSettings.margin_top, 8);
  const marginRight = clampMm(printSettings.margin_right, 10);
  const marginBottom = clampMm(printSettings.margin_bottom, 8);
  const marginLeft = clampMm(printSettings.margin_left, 10);

  const dynamicPageCss = `@media print { @page { size: ${pageSize} ${orientation}; margin: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm; } }`;

  return (
    <div className={`alnadary-print-sheet ${className}`} dir="rtl">
      <style>{`${ALNADARY_PRINT_CSS}\n${dynamicPageCss}`}</style>
      <AlNadaryPrintHeader {...headerProps} hideLetterhead={headerProps.hideLetterhead ?? hideLetterhead} />
      <main>{children}</main>
      {shouldShowFooter && (shouldShowTerms || shouldShowSignatures) && (
        <footer className="alnadary-footer">
          {shouldShowTerms && (
            <div className="alnadary-terms-row">
              {resolvedTerms.map((term, idx) => (
                <span key={idx}>{term}</span>
              ))}
            </div>
          )}
          {shouldShowSignatures && (
            <div className="alnadary-signatures-row">
              {resolvedSignatures.map((sig, idx) => (
                <div key={idx}>
                  <div>{sig}</div>
                  <div className="alnadary-sig-line" />
                </div>
              ))}
            </div>
          )}
        </footer>
      )}
    </div>
  );
};

export default AlNadaryPrintShell;
