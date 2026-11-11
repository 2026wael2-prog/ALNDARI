import type { ReactElement } from 'react';
import InvoicePrintQrAndWords from './InvoicePrintQrAndWords';
import InvoicePrintTotalsTable from './InvoicePrintTotalsTable';
import type { InvoicePrintView } from './invoicePrintModel';

/** الملخص السفلي: رمز ZATCA والمبلغ كتابةً في جهة، والإجماليات في جهة أخرى. */
const InvoicePrintSummary = ({
  view,
  sellerName,
  vatNumber,
  showQrCode,
  accentColor,
}: {
  view: InvoicePrintView;
  sellerName: string;
  vatNumber: string;
  showQrCode: boolean;
  accentColor: string;
}): ReactElement => (
  <div className="avoid-break mb-4 flex flex-wrap items-start justify-between gap-4">
    <InvoicePrintQrAndWords
      showQrCode={showQrCode}
      sellerName={sellerName}
      vatNumber={vatNumber}
      timestamp={view.zatcaTimestamp}
      totalAmount={view.totals.total}
      vatAmount={view.totals.tax}
      amountInWords={view.amountInWords}
    />
    <InvoicePrintTotalsTable
      totals={view.totals}
      currencyCode={view.currencyCode}
      accentColor={accentColor}
    />
  </div>
);

export default InvoicePrintSummary;
