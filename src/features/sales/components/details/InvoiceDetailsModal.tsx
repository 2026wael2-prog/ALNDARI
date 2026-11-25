import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, RotateCcw, CheckCircle, AlertTriangle } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import Modal from '@/ui/base/Modal';
import PrintableInvoice from '../PrintableInvoice';
import { useInvoiceDetails, useCreateSalesReturn } from '../../hooks/index';
import { formatLocalDate } from '@/core/utils/dateUtils';
import { useCompany } from '@/features/settings/hooks';
import { useAuthStore } from '@/features/auth/store';
import { useInvoicePaymentStatus } from '../../hooks/useInvoicePaymentStatus';
import ReturnWizard from './ReturnWizard';
import type { Invoice, InvoiceItem } from '../../../returns/types';
import InvoiceItemsTable from './InvoiceItemsTable';
import InvoiceActionButtons from './InvoiceActionButtons';
import { ErrorBoundary } from '@/core/components/ErrorBoundary';
import { PdfCaptureHost } from '@/core/components/PdfCaptureHost';
import { cn, getDisplayItemName } from '@/core/utils';
import { useInvoiceExportActions } from './useInvoiceExportActions';
import { InvoiceDetailsSummaryCards } from './InvoiceDetailsSummaryCards';
import EditInvoiceModal from '../edit/EditInvoiceModal';
import WhatsAppShareChoiceModal from '@/ui/common/WhatsAppShareChoiceModal';

interface Props {
  invoiceId: string | null;
  onClose: () => void;
  onReturn?: (invoice: Invoice, items: InvoiceItem[]) => void | Promise<void>;
}

const InvoiceDetailsModal: React.FC<Props> = ({ invoiceId, onClose, onReturn }) => {
  const { data: invoice, isLoading } = useInvoiceDetails(invoiceId);
  const queryClient = useQueryClient();
  const createSalesReturn = useCreateSalesReturn();
  const { data: company } = useCompany();
  const { user } = useAuthStore();
  const [showReturnSection, setShowReturnSection] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'preview'>('details');
  const [isEditing, setIsEditing] = useState(false);
  const [isReturning, setIsReturning] = useState(false);

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
    isWhatsAppModalOpen,
    setIsWhatsAppModalOpen,
    generateInvoicePdfBlob,
    whatsAppTextMessage,
    fullInvoiceData,
  } = useInvoiceExportActions(invoice, company, issuedByName);

  const handleReturnSubmit = async (invoiceData: Invoice, items: InvoiceItem[]) => {
    setIsReturning(true);
    try {
      if (onReturn) {
        await onReturn(invoiceData, items);
      } else {
        const invAny = invoiceData as any;
        await createSalesReturn.mutateAsync({
          invoiceId: invAny.id,
          partyId: invAny.party?.id || invAny.parties?.id || invAny.party_id || undefined,
          paymentMethod: invAny.payment_method || 'cash',
          items: items.map((item: any) => ({
            productId: item.product_id || item.productId || item.product?.id || item.id,
            name: getDisplayItemName(item, 'صنف مرتجع'),
            quantity: Number(item.quantity ?? item.returnQuantity ?? 1),
            unitPrice: Number(item.unit_price ?? item.unitPrice ?? 0),
            costPrice: Number(item.cost_price ?? item.costPrice ?? 0),
          })),
          returnReason: 'مرتجع مبيعات',
          status: 'posted',
          issueDate: formatLocalDate(),
          currency: invAny.currency_code || invAny.currency || 'SAR',
          exchangeRate: invAny.exchange_rate ?? 1,
          notes: `مرتجع للفاتورة #${invAny.invoice_number || ''}`,
        });
        onClose();
      }
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.refetchQueries({ queryKey: ['invoices'], type: 'active' });
      if (invoiceId) {
        void queryClient.invalidateQueries({ queryKey: ['invoice_details', invoiceId] });
      }
      setShowReturnSection(false);
      setTimeout(() => {
        setShowAlert(null);
      }, 3000);
    } catch (err: any) {
      handleAlert({
        type: 'error',
        message: err?.message || 'فشل في إنشاء مرتجع المبيعات',
      });
    } finally {
      setIsReturning(false);
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
            setShowReturnSection(prev => {
              const next = !prev;
              if (next) setActiveTab('details');
              return next;
            });
          }}
          onEdit={() => setIsEditing(true)}
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
                    isSubmitting={isReturning || createSalesReturn.isPending}
                  />
                ) : (
                  <InvoiceItemsTable invoice={invoice} />
                )}
              </>
            ) : (
              <div className="custom-scrollbar flex max-h-[68dvh] justify-center overflow-auto rounded-xl bg-slate-200 p-1 dark:bg-slate-900 sm:p-3">
                <div className="w-full max-w-4xl shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-white p-1 shadow-lg sm:rounded-xl sm:p-2">
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

            {/* Always-mounted off-screen print sheet for react-to-print (ensures logo & header render before clone) */}
            <div
              className="pointer-events-none fixed -left-[10000px] top-0 w-[210mm] opacity-0"
              aria-hidden="true"
            >
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

      {isEditing && invoiceId && (
        <EditInvoiceModal
          invoiceId={invoiceId}
          isOpen={true}
          onClose={() => setIsEditing(false)}
          onSuccess={() => {
            setIsEditing(false);
            onClose();
          }}
        />
      )}

      {invoice && (
        <WhatsAppShareChoiceModal
          isOpen={isWhatsAppModalOpen}
          onClose={() => setIsWhatsAppModalOpen(false)}
          title={`فاتورة #${invoice.invoice_number || ''}`}
          defaultPhone={invoice.parties?.phone || undefined}
          textMessage={whatsAppTextMessage}
          pdfFileName={`فاتورة_${invoice.invoice_number || invoice.id}`}
          pdfCaption={`مرفق فاتورة رقم ${invoice.invoice_number || ''} بصيغة PDF`}
          onGeneratePdfBlob={generateInvoicePdfBlob}
        />
      )}
    </Modal>
  );
};

export default InvoiceDetailsModal;
