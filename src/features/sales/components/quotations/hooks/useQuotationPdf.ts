import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { QuotationDetailRow } from '@/features/sales/api/quotationsApi';
import { exportToPDF } from '@/core/utils/pdfExporter';
import { logger } from '@/core/utils/logger';

export interface PdfResult {
  printRef: RefObject<HTMLDivElement | null>;
  isExporting: boolean;
  exportPdf: () => Promise<void>;
}

export const useQuotationPdf = (quotation: QuotationDetailRow | null): PdfResult => {
  const printRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const exportPdf = useCallback(async (): Promise<void> => {
    setIsExporting(true);
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      if (printRef.current !== null) {
        const number = quotation?.quotation_number ?? 'عرض-سعر';
        await exportToPDF(printRef.current, `عرض-سعر-${number}`);
      }
    } catch (error) {
      logger.error('QuotationDetailsModal', 'PDF export failed', error);
    } finally {
      setIsExporting(false);
    }
  }, [quotation]);

  return { printRef, isExporting, exportPdf };
};
