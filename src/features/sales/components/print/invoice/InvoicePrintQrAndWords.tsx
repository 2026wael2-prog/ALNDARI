import type { ReactElement } from 'react';
import { ZatcaInvoiceQRCode } from '../ZatcaInvoiceQRCode';

interface InvoicePrintQrAndWordsProps {
  showQrCode: boolean;
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  totalAmount: number;
  vatAmount: number;
  amountInWords: string;
}

/** رمز ZATCA (إن كان مفعّلاً) مع المبلغ كتابةً — الجهة اليسرى من ملخص الفاتورة. */
const InvoicePrintQrAndWords = ({
  showQrCode,
  sellerName,
  vatNumber,
  timestamp,
  totalAmount,
  vatAmount,
  amountInWords,
}: InvoicePrintQrAndWordsProps): ReactElement => (
  <div className="min-w-[240px] flex-1 space-y-2.5">
    <div className="flex items-center gap-3">
      {showQrCode && (
        <div className="shadow-2xs rounded border border-slate-200 bg-white p-1">
          <ZatcaInvoiceQRCode
            sellerName={sellerName}
            vatNumber={vatNumber}
            timestamp={timestamp}
            totalAmount={totalAmount}
            vatAmount={vatAmount}
            size={105}
          />
        </div>
      )}
      <div className="space-y-1 text-xs">
        <div className="font-bold text-slate-700">المبلغ كتابةً:</div>
        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] font-bold leading-relaxed text-slate-800">
          {amountInWords}
        </div>
      </div>
    </div>
  </div>
);

export default InvoicePrintQrAndWords;
