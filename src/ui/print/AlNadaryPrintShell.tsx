import React from 'react';
import { ALNADARY_PRINT_CSS } from './alNadaryPrintStyles';
import { AlNadaryPrintHeader, type AlNadaryPrintHeaderProps } from './AlNadaryPrintHeader';

export interface AlNadaryPrintShellProps extends AlNadaryPrintHeaderProps {
  children: React.ReactNode;
  /** عرض الشروط الافتراضية أسفل الفاتورة */
  showDefaultTerms?: boolean;
  /** شروط مخصصة اختيارية */
  terms?: readonly string[];
  /** تسميات التوقيعات الثلاثة في التذييل */
  signatures?: readonly [string, string, string];
  className?: string;
}

const DEFAULT_TERMS: readonly string[] = [
  '* البضاعة لا ترد ولا تستبدل بعد خروجها من المحل',
  '* أتعهد بدفع المبلغ عند الطلب',
];

const DEFAULT_SIGNATURES: readonly [string, string, string] = [
  'توقيع المستلم',
  'توقيع المحاسب',
  'الختم والاعتماد',
];

/**
 * القالب الموحد المركزي للطباعة (Unified Print Template) لشركة النظاري.
 * يجمع الأنماط الرسمية (A4 RTL) + الهيدر الموحد + المحتوى + الشروط والتوقيعات.
 */
export const AlNadaryPrintShell: React.FC<AlNadaryPrintShellProps> = ({
  children,
  showDefaultTerms = true,
  terms = DEFAULT_TERMS,
  signatures = DEFAULT_SIGNATURES,
  className = '',
  ...headerProps
}) => {
  return (
    <div className={`alnadary-print-sheet ${className}`} dir="rtl">
      <style>{ALNADARY_PRINT_CSS}</style>
      <AlNadaryPrintHeader {...headerProps} />
      <main>{children}</main>
      <footer className="alnadary-footer">
        {showDefaultTerms && terms.length > 0 && (
          <div className="alnadary-terms-row">
            {terms.map((term, idx) => (
              <span key={idx}>{term}</span>
            ))}
          </div>
        )}
        <div className="alnadary-signatures-row">
          {signatures.map((sig, idx) => (
            <div key={idx}>
              <div>{sig}</div>
              <div className="alnadary-sig-line" />
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
};

export default AlNadaryPrintShell;
