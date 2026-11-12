import type { FC, ReactElement, RefObject } from 'react';
import { Loader2 } from 'lucide-react';
import type { QuotationDetailRow } from '@/features/sales/api/quotationsApi';
import PrintableQuotation from '../PrintableQuotation';
import { PdfCaptureHost } from '@/core/components/PdfCaptureHost';

interface BodyFallbackProps {
  message: string;
  onRetry: () => void | Promise<void>;
}

const QuotationBodyFallback: FC<BodyFallbackProps> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{message}</p>
    <button
      type="button"
      onClick={() => {
        void onRetry();
      }}
      className="rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-indigo-700"
    >
      إعادة المحاولة
    </button>
  </div>
);

export interface QuotationBodyProps {
  loading: boolean;
  quotation: QuotationDetailRow | null;
  errorText: string | null;
  onRetry: () => void | Promise<void>;
  exportPdf: () => void | Promise<void>;
  isExporting: boolean;
  printRef: RefObject<HTMLDivElement | null>;
}

export const QuotationBody: FC<QuotationBodyProps> = ({
  loading,
  quotation,
  errorText,
  onRetry,
  exportPdf,
  isExporting,
  printRef,
}): ReactElement => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }
  if (quotation === null) {
    return (
      <QuotationBodyFallback
        message={errorText ?? 'تعذّر تحميل عرض السعر'}
        onRetry={onRetry}
      />
    );
  }
  return (
    <>
      <div className="custom-scrollbar flex max-h-[70vh] justify-center overflow-auto rounded-xl bg-slate-200 p-3 dark:bg-slate-900">
        <div className="w-full max-w-4xl shrink-0 rounded-xl border border-slate-300 bg-white p-2 shadow-lg">
          <PrintableQuotation
            quotation={quotation}
            onExportPDF={() => {
              void exportPdf();
            }}
            isExporting={isExporting}
          />
        </div>
      </div>
      {isExporting && (
        <PdfCaptureHost innerRef={printRef}>
          <PrintableQuotation quotation={quotation} />
        </PdfCaptureHost>
      )}
    </>
  );
};
