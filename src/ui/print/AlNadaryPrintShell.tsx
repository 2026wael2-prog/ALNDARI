import React from 'react';
import { ALNADARY_PRINT_CSS } from './alNadaryPrintStyles';
import { AlNadaryPrintHeader, type AlNadaryPrintHeaderProps } from './AlNadaryPrintHeader';
import { usePrintTemplateStore } from './printTemplateStore';

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

/**
 * القالب الموحد المركزي للطباعة (Unified Print Template) لشركة النظاري.
 * يجمع الأنماط الرسمية (A4 RTL) + الهيدر الموحد القابل للتعديل + المحتوى + الشروط والتوقيعات.
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
  const resolvedTerms = terms ?? tpl.terms.filter(Boolean);
  const resolvedSignatures = signatures ?? tpl.signatures;
  const shouldShowTerms = showDefaultTerms && tpl.showTerms && resolvedTerms.length > 0;
  const shouldShowSignatures = tpl.showSignatures && resolvedSignatures.length > 0;

  return (
    <div className={`alnadary-print-sheet ${className}`} dir="rtl">
      <style>{ALNADARY_PRINT_CSS}</style>
      <AlNadaryPrintHeader {...headerProps} />
      <main>{children}</main>
      {!hideFooter && (shouldShowTerms || shouldShowSignatures) && (
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
