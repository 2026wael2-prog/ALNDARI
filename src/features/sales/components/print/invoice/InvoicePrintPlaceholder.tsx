import type { ReactElement } from 'react';

/** حالة الانتظار أثناء تجهيز بيانات الفاتورة — تُعرض بدل صفحة ناقصة. */
const InvoicePrintPlaceholder = (): ReactElement => (
  <div className="flex h-48 items-center justify-center p-8 text-center text-slate-400">
    <p className="text-xs font-bold">جاري تجهيز الفاتورة للعرض والطباعة...</p>
  </div>
);

export default InvoicePrintPlaceholder;
