import { useCallback, useMemo, useRef, useState } from 'react';
import { logger } from '@/core/utils/logger';
import { exportToPDF } from '@/core/utils/pdfExporter';
import { exportInvoiceToExcel } from '@/core/utils/invoiceExcelExporter';
import { getDisplayItemName } from '@/core/utils';
import { buildWhatsappHeader } from '@/core/utils/whatsappHeader';
import type { InvoiceDetailItem, InvoiceWithDetails } from '../../api';
import { useDocumentHeaderSettings } from '@/features/settings/settingsStore';

export interface InvoiceAlertState {
  type: 'success' | 'warning' | 'error';
  message: string;
}

const buildExcelPayload = (
  invoice: InvoiceWithDetails,
  company: unknown,
  issuedByName: string
) => {
  const comp = (company || {}) as Record<string, unknown>;
  const companyName = (comp?.name_ar ||
    comp?.name ||
    (comp as { company_name?: string }).company_name ||
    'الشركة') as string;
  const subtotal =
    ((invoice as Record<string, unknown>).subtotal as number) ||
    invoice.total_amount - (((invoice as Record<string, unknown>).tax_amount as number) || 0);

  return {
    comp,
    data: {
      companyName,
      companyAddress: (comp?.address || '') as string,
      taxNumber: (comp?.tax_number || '') as string,
      invoiceNumber: invoice.invoice_number || '',
      issueDate: invoice.issue_date,
      customerName: invoice.parties?.name || 'عميل نقدي',
      issuedBy: issuedByName,
      items: (invoice.invoice_items || []).map((i: InvoiceDetailItem) => ({
        name: getDisplayItemName(i),
        quantity: i.quantity,
        unitPrice: i.unit_price,
        total: i.total,
      })),
      subtotal,
      totalAmount: invoice.total_amount,
    },
  };
};

/**
 * Encapsulates PDF/Excel export, WhatsApp sharing, printable data shaping,
 * and transient alert feedback for InvoiceDetailsModal.
 */
export const useInvoiceExportActions = (
  invoice: InvoiceWithDetails | null | undefined,
  company: unknown,
  issuedByName: string
) => {
  const headerConfig = useDocumentHeaderSettings();
  const [isExporting, setIsExporting] = useState(false);
  const [showAlert, setShowAlert] = useState<InvoiceAlertState | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handleAlert = useCallback((alertOptions: InvoiceAlertState) => {
    setShowAlert(alertOptions);
    if (alertOptions.type !== 'success') {
      setTimeout(() => {
        setShowAlert(null);
      }, 3000);
    }
  }, []);

  const handleExportPDF = useCallback(async () => {
    setIsExporting(true);
    // Allow React to commit the PdfCaptureHost to the DOM before measuring
    await new Promise(resolve => setTimeout(resolve, 50));
    if (!printRef.current || !invoice) {
      setIsExporting(false);
      return;
    }
    try {
      await exportToPDF(printRef.current, `فاتورة-${invoice.invoice_number}`);
      setShowAlert({ type: 'success', message: 'تم تصدير الفاتورة بنجاح' });
    } catch {
      setShowAlert({ type: 'error', message: 'فشل في تصدير الفاتورة' });
    } finally {
      setIsExporting(false);
      setTimeout(() => {
        setShowAlert(null);
      }, 3000);
    }
  }, [invoice]);

  const handleExportExcel = useCallback(async () => {
    if (!invoice || !company) return;
    const { data } = buildExcelPayload(invoice, company, issuedByName);
    await exportInvoiceToExcel(data);
    setShowAlert({ type: 'success', message: 'تم تصدير ملف Excel بنجاح' });
    setTimeout(() => {
      setShowAlert(null);
    }, 3000);
  }, [invoice, company, issuedByName]);

  const handleShareWhatsApp = useCallback(async () => {
    if (!invoice) return;
    setIsExporting(true);
    try {
      const { generateInvoiceExcelBlob, exportInvoiceToExcel: exportExcel } =
        await import('@/core/utils/invoiceExcelExporter');
      const { shareSpreadsheet } = await import('@/core/utils/shareUtils');
      const { comp, data } = buildExcelPayload(invoice, company, issuedByName);

      const blob = await generateInvoiceExcelBlob(data);
      const waHeader = headerConfig?.whatsapp
        ? buildWhatsappHeader(headerConfig.whatsapp, {
            name:
              headerConfig.details.companyNameOverride ||
              (comp?.name_ar as string) ||
              (comp?.name as string) ||
              'الشركة',
            phone: (comp?.phone as string) || undefined,
            taxNumber: (comp?.tax_number as string) || undefined,
            slogan: headerConfig.details.sloganText || undefined,
          })
        : '';
      const shareText = `${waHeader}مرفق فاتورة رقم ${data.invoiceNumber}`;
      await shareSpreadsheet({
        blob,
        fileName: `فاتورة_${data.invoiceNumber}.xlsx`,
        shareTitle: `فاتورة ${data.invoiceNumber}`,
        shareText,
        fallbackText: `${shareText}. يرجى الاطلاع على الملف المرفق.`,
        onDownloadFallback: () => exportExcel(data),
      });
    } catch (err) {
      logger.error('InvoiceDetailsModal', 'Share via WhatsApp failed', err);
      setShowAlert({ type: 'error', message: 'حدث خطأ أثناء المشاركة' });
    } finally {
      setIsExporting(false);
    }
  }, [invoice, company, issuedByName, headerConfig]);

  const fullInvoiceData = useMemo(
    () =>
      invoice
        ? {
            ...invoice,
            company: company || {},
            party_name: invoice.parties?.name || 'عميل نقدي',
            issuedBy: issuedByName,
            items: (invoice.invoice_items || []).map((i: InvoiceDetailItem) => ({
              ...i,
              name: getDisplayItemName(i),
              price: i.unit_price,
            })),
          }
        : null,
    [invoice, company, issuedByName]
  );

  return {
    printRef,
    isExporting,
    showAlert,
    setShowAlert,
    handleAlert,
    handleExportPDF,
    handleExportExcel,
    handleShareWhatsApp,
    fullInvoiceData,
  };
};
