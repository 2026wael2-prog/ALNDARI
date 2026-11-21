import React, { useRef, useState } from 'react';
import { FileText, Loader2, RotateCcw, CheckCircle, AlertTriangle } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import Modal from '@/ui/base/Modal';
import PrintableInvoice from '../PrintableInvoice';
import { useInvoiceDetails } from '../../hooks/index';
import { useCompany } from '@/features/settings/hooks';
import { useAuthStore } from '@/features/auth/store';
import { useInvoicePaymentStatus } from '../../hooks/useInvoicePaymentStatus';
import ReturnWizard from './ReturnWizard';
import type { Invoice, InvoiceItem } from '../../../returns/types';
import InvoiceItemsTable from './InvoiceItemsTable';
import InvoiceActionButtons from './InvoiceActionButtons';
import { ErrorBoundary } from '@/core/components/ErrorBoundary';
import { PdfCaptureHost } from '@/core/components/PdfCaptureHost';
import { cn } from '@/core/utils';
import { useInvoiceExportActions } from './useInvoiceExportActions';
import { InvoiceDetailsSummaryCards } from './InvoiceDetailsSummaryCards';

interface Props {
  invoiceId: string | null;
  onClose: () => void;
  onReturn?: (invoice: Invoice, items: InvoiceItem[]) => void;
}

const InvoiceDetailsModal: React.FC<Props> = ({ invoiceId, onClose, onReturn }) => {
  const { data: invoice, isLoading } = useInvoiceDetails(invoiceId);
  const { data: company } = useCompany();
  const { user } = useAuthStore();
  const [showReturnSection, setShowReturnSection] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'preview'>('details');

  const paymentInfo = useInvoicePaymentStatus(invoice);
  const issuedByName = user?.full_name || user?.email || 'غير محدد';
  const directPrintRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: directPrintRef,
    documentTitle: `فاتورة_${invoice?.invoice_number || ''}`,
  });

  const {
    printRef,
    isExporting,
    showAlert,
    setShowAlert,
    handleAlert,
    handleExportPDF,
    handleExportExcel,
    handleShareWhatsApp,
    fullInvoiceData,
  } = useInvoiceExportActions(invoice, company, issuedByName);

  const handleReturnSubmit = (invoiceData: Invoice, items: InvoiceItem[]) => {
    if (onReturn) {
      onReturn(invoiceData, items);
      setTimeout(() => {
        setShowAlert(null);
      }, 3000);
      setShowReturnSection(false);
    }
  };

  return (
    <Modal
      isOpen={!!invoiceId}
      onClose={onClose}
      icon={FileText}
      title={invoice ? `فاتورة #${invoice.invoice_number || ''}` : 'تفاصيل الفاتورة'}
      description="عرض تفصيلي لبيانات ومنتجات الفاتورة"
      size="4xl"
      footer={
        <InvoiceActionButtons
          invoice={invoice}
          onClose={onClose}
          onPrint={() => {
            handlePrint();
          }}
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          onShare={handleShareWhatsApp}
          onToggleReturn={() => {
            setShowReturnSection(!showReturnSection);
          }}
          isExporting={isExporting}
          issuedByName={issuedByName}
          printRef={printRef as React.RefObject<HTMLDivElement>}
        />
      }
    >
      <ErrorBoundary inline>
        {showAlert && (
          <div
            className={cn(
              'mb-3 flex items-center gap-2 rounded-lg p-2.5 text-xs font-bold',
              showAlert.type === 'success'
                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                : showAlert.type === 'warning'
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                  : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
            )}
          >
            {showAlert.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            <span>{showAlert.message}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 p-16 text-center">
            <Loader2 className="animate-spin text-blue-500" size={28} />
            <span className="text-xs font-bold text-slate-400">جاري تحميل بيانات الفاتورة...</span>
          </div>
        ) : invoice ? (
          <div className="space-y-3 p-1 sm:p-2">
            {/* Top Compact Tab Switcher */}
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-bold dark:bg-slate-800/80">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('details');
                }}
                className={cn(
                  'flex-1 rounded-md py-1.5 transition-all',
                  activeTab === 'details'
                    ? 'bg-white font-black text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                <span className="hidden sm:inline">تفاصيل البنود والمنتجات</span>
                <span className="sm:hidden">بنود الفاتورة</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('preview');
                }}
                className={cn(
                  'flex-1 rounded-md py-1.5 transition-all',
                  activeTab === 'preview'
                    ? 'bg-white font-black text-blue-600 shadow-xs dark:bg-slate-700 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                معاينة الطباعة
              </button>
            </div>

            {activeTab === 'details' ? (
              <>
                <InvoiceDetailsSummaryCards
                  invoice={invoice}
                  remainingAmount={paymentInfo?.remaining}
                />

                {showReturnSection && (
                  <div className="animate-in slide-in-from-top-2 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-900/20">
                    <div className="mb-1 flex items-center gap-2 text-rose-700 dark:text-rose-400">
                      <RotateCcw size={16} />
                      <h3 className="text-xs font-bold">إرجاع جزئي / كلي بنفس سعر الفاتورة</h3>
                    </div>
                    <p className="text-[11px] text-rose-600 dark:text-rose-300">
                      اختر الأصناف والكميات المراد إرجاعها للمخزون واسترداد قيمتها.
                    </p>
                  </div>
                )}

                {showReturnSection ? (
                  <ReturnWizard
                    invoice={invoice as unknown as Invoice}
                    onReturn={handleReturnSubmit}
                    onCancel={() => {
                      setShowReturnSection(false);
                    }}
                    onAlert={handleAlert}
                  />
                ) : (
                  <InvoiceItemsTable invoice={invoice} />
                )}
              </>
            ) : (
              <div className="custom-scrollbar flex max-h-[60vh] justify-center overflow-auto rounded-xl bg-slate-200 p-3 dark:bg-slate-900">
                <div className="w-full max-w-4xl shrink-0 rounded-xl border border-slate-300 bg-white p-2 shadow-lg">
                  <PrintableInvoice
                    invoice={fullInvoiceData}
                    onPrint={() => {
                      handlePrint();
                    }}
                    onExportPDF={handleExportPDF}
                    isExporting={isExporting}
                  />
                </div>
              </div>
            )}

            {/* Always-mounted isolated print sheet for react-to-print (works from both tabs) */}
            <div style={{ display: 'none' }} aria-hidden="true">
              <div ref={directPrintRef}>
                <PrintableInvoice invoice={fullInvoiceData} />
              </div>
            </div>

            {/* Off-screen capture host for PDF export */}
            {isExporting && (
              <PdfCaptureHost innerRef={printRef}>
                <PrintableInvoice
                  invoice={fullInvoiceData}
                  onExportPDF={handleExportPDF}
                  isExporting={isExporting}
                />
              </PdfCaptureHost>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <AlertTriangle className="text-amber-500" size={32} />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
              تعذر تحميل بيانات الفاتورة أو أنها غير موجودة
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-100 px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            >
              إغلاق
            </button>
          </div>
        )}
      </ErrorBoundary>
    </Modal>
  );
};

export default InvoiceDetailsModal;
