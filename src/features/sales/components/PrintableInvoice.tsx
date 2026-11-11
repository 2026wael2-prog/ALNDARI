import { useMemo } from 'react';
import InvoicePrintChrome from './print/invoice/InvoicePrintChrome';
import InvoicePrintDocument from './print/invoice/InvoicePrintDocument';
import InvoicePrintPlaceholder from './print/invoice/InvoicePrintPlaceholder';
import { buildInvoicePrintView, type PrintableInvoiceSource } from './print/invoice/invoicePrintModel';
import { useInvoicePrintState } from './print/invoice/useInvoicePrintState';

interface PrintableInvoiceProps {
  /** الفاتورة جاهزة الطباعة؛ `null`/`undefined` يعني أن البيانات لم تُجهّز بعد. */
  invoice?: PrintableInvoiceSource | null | undefined;
  onExportPDF?: (() => void) | undefined;
  isExporting?: boolean | undefined;
}

/**
 * قالب طباعة الفاتورة الضريبية. الحسابات في `invoicePrintModel`، والأقسام
 * المرئية في مكوّنات مستقلة، وحالة الأدوات في `useInvoicePrintState`.
 *
 * ملاحظة: كل الـhooks تُستدعى قبل أي `return` مبكر (rules-of-hooks) — وهو الخرق
 * الذي كان قائماً حين كانت الفاتورة غير مهيّأة.
 */
const PrintableInvoice: React.FC<PrintableInvoiceProps> = ({
  invoice,
  onExportPDF,
  isExporting = false,
}) => {
  const printState = useInvoicePrintState(invoice?.company ?? null);
  const view = useMemo(
    () => (invoice === null || invoice === undefined ? null : buildInvoicePrintView(invoice)),
    [invoice]
  );

  if (view === null) return <InvoicePrintPlaceholder />;

  return (
    <div className="printable-invoice-container w-full bg-white font-sans text-black">
      <InvoicePrintChrome
        layoutMode={printState.layoutMode}
        accentColor={printState.accentColor}
        showQrCode={printState.showQrCode}
        isExporting={isExporting}
        onExportPDF={onExportPDF}
        onLayoutChange={printState.setLayoutMode}
        onAccentColorChange={printState.setAccentColor}
        onToggleQrCode={printState.toggleQrCode}
      />
      <InvoicePrintDocument
        view={view}
        companyHeader={printState.companyHeader}
        layoutMode={printState.layoutMode}
        accentColor={printState.accentColor}
        showQrCode={printState.showQrCode}
        onUpdateCompany={printState.updateCompany}
      />
    </div>
  );
};

export default PrintableInvoice;
