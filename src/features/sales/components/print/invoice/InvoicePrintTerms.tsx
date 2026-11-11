import { useState, type ReactElement } from 'react';
import { DEFAULT_INVOICE_TERMS } from './invoicePrintModel';

/** ختم وتوقيع المنشأة — يُطبع أسفل الشروط مع مساحة فارغة للتوقيع اليدوي. */
const SignatureStamp = (): ReactElement => (
  <div className="flex flex-col items-center justify-center text-center">
    <div className="mb-2 h-16 w-36 border-b-2 border-dashed border-slate-400"></div>
    <span className="text-[11px] font-bold text-slate-700">الختم والتوقيع المعتمد</span>
    <span className="text-[10px] text-slate-400" dir="ltr">
      Official Stamp &amp; Signature
    </span>
  </div>
);

/**
 * الشروط والأحكام القابلة للتحرير قبل الطباعة. الحالة محلية هنا كي لا يعيد
 * المكوّن الرئيسي تصيير الصفحة كلها عند كل تعديل على بند شرط.
 */
const InvoicePrintTerms = (): ReactElement => {
  const [terms, setTerms] = useState<string[]>(() => [...DEFAULT_INVOICE_TERMS]);

  const updateTerm = (index: number, value: string): void => {
    setTerms(previous => previous.map((term, position) => (position === index ? value : term)));
  };

  return (
    <div className="avoid-break mt-6 border-t border-slate-200 pt-3 text-xs">
      <div className="grid grid-cols-3 items-end gap-4">
        <div className="col-span-2 space-y-0.5 text-[10px] text-slate-500">
          <div className="mb-1 text-[11px] font-bold text-slate-700">الشروط والأحكام العامة:</div>
          <ul className="list-disc space-y-0.5 pr-3 leading-tight">
            {terms.map((term, index) => (
              <li key={index}>
                <div
                  role="textbox"
                  aria-label={`بند الشرط ${String(index + 1)}`}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={event => {
                    updateTerm(index, event.currentTarget.textContent);
                  }}
                >
                  {term}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <SignatureStamp />
      </div>
    </div>
  );
};

export default InvoicePrintTerms;

