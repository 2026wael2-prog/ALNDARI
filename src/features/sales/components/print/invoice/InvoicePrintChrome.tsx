import type { ReactElement } from 'react';
import { PrintToolbar } from '../PrintToolbar';
import type { HeaderLayoutMode } from '../PrintDocumentHeader';
import { buildInvoicePrintCss } from './invoicePrintStyles';

interface InvoicePrintChromeProps {
  layoutMode: HeaderLayoutMode;
  accentColor: string;
  showQrCode: boolean;
  isExporting: boolean;
  onPrint?: (() => void) | undefined;
  onExportPDF?: (() => void) | undefined;
  onLayoutChange: (mode: HeaderLayoutMode) => void;
  onAccentColorChange: (color: string) => void;
  onToggleQrCode: () => void;
}

/** أنماط A4 + شريط الأدوات (يظهر على الشاشة فقط — `no-print` في الطباعة). */
const InvoicePrintChrome = ({
  accentColor,
  showQrCode,
  isExporting,
  onPrint,
  onExportPDF,
  onAccentColorChange,
  onToggleQrCode,
}: InvoicePrintChromeProps): ReactElement => (
  <>
    <style>{buildInvoicePrintCss(accentColor)}</style>
    <PrintToolbar
      accentColor={accentColor}
      onChangeAccentColor={onAccentColorChange}
      showQrCode={showQrCode}
      onToggleQrCode={onToggleQrCode}
      onPrint={
        onPrint ??
        (() => {
          window.print();
        })
      }
      onExportPDF={onExportPDF}
      isExporting={isExporting}
    />
  </>
);

export default InvoicePrintChrome;
