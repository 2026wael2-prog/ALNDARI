import type { ReactElement } from 'react';
import {
  PrintDocumentHeader,
  type CompanyHeaderData,
  type HeaderLayoutMode,
} from '../PrintDocumentHeader';
import InvoiceItemsPrintTable from './InvoiceItemsPrintTable';
import InvoicePrintMetaCards from './InvoicePrintMetaCards';
import InvoicePrintSummary from './InvoicePrintSummary';
import InvoicePrintTerms from './InvoicePrintTerms';
import type { InvoiceCompanyHeader } from './companyHeader';
import type { InvoicePrintView } from './invoicePrintModel';

interface InvoicePrintDocumentProps {
  view: InvoicePrintView;
  companyHeader: InvoiceCompanyHeader;
  layoutMode: HeaderLayoutMode;
  accentColor: string;
  showQrCode: boolean;
  onUpdateCompany: (updated: Partial<CompanyHeaderData>) => void;
}

/** الترويسة + بطاقتا العميل والعملية — أول كتلتين في صفحة الفاتورة. */
const InvoicePrintLetterhead = ({
  view,
  companyHeader,
  layoutMode,
  accentColor,
  onUpdateCompany,
}: InvoicePrintDocumentProps): ReactElement => (
  <>
    <PrintDocumentHeader
      company={companyHeader}
      document={view.documentMeta}
      layoutMode={layoutMode}
      onUpdateCompany={onUpdateCompany}
      accentColor={accentColor}
    />

    <InvoicePrintMetaCards
      partyName={view.partyName}
      partyTaxNumber={view.partyTaxNumber}
      partyPhone={view.partyPhone}
      partyAddress={view.partyAddress}
      paymentLabel={view.paymentLabel}
      branchName={view.branchName}
      dueDate={view.dueDate}
      issuedBy={view.issuedBy}
      accentColor={accentColor}
    />
  </>
);

/** صفحة A4 كاملة: الترويسة ← بيانات العميل ← البنود ← الملخص والضريبة ← الشروط. */
const InvoicePrintDocument = (props: InvoicePrintDocumentProps): ReactElement => (
  <div className="invoice-page-box" dir="rtl">
    <InvoicePrintLetterhead {...props} />
    <InvoiceItemsPrintTable items={props.view.items} currencyCode={props.view.currencyCode} />
    <InvoicePrintSummary
      view={props.view}
      sellerName={props.companyHeader.nameAr}
      vatNumber={props.companyHeader.taxNumber || '300000000000003'}
      showQrCode={props.showQrCode}
      accentColor={props.accentColor}
    />
    <InvoicePrintTerms />
  </div>
);

export default InvoicePrintDocument;
