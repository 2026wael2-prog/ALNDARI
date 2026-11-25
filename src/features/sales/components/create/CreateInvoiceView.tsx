import React from 'react';
import { AlertTriangle } from 'lucide-react';
import InvoiceHeader from './InvoiceHeader';
import InvoiceMeta from './InvoiceMeta';
import InteractiveInvoiceTable from './InteractiveInvoiceTable';
import InvoiceTotals from './InvoiceTotals';
import InvoiceActions from './InvoiceActions';
import PrintableInvoice from '../PrintableInvoice';
import PageLoader from '../../../../ui/base/PageLoader';
import ErrorDisplay from '../../../../ui/base/ErrorDisplay';
import DraftStatusBanner from '../../../../ui/common/DraftStatusBanner';
import { InvoiceConfirmationModal } from '../../../../ui/common/InvoiceConfirmationModal';
import { InvoiceNavigatorBar } from './InvoiceNavigatorBar';
import { PreviousInvoiceView } from './PreviousInvoiceView';
import { OpenInvoicesTabs } from './OpenInvoicesTabs';
import { useCreateInvoiceController } from '../../hooks/useCreateInvoiceController';

interface CreateInvoiceViewProps {
  onSuccess: () => void;
}

const CreateInvoiceView: React.FC<CreateInvoiceViewProps> = ({ onSuccess }) => {
  const {
    comp,
    companyLoading,
    companyError,
    nextInvoiceNumber,
    numberLoading,
    navigation,
    printRef,
    handlePrint,
    enteredItemsCount,
    selectedCustomer,
    summary,
    resetCart,
    invoiceType,
    currency,
    exchangeRate,
    exchangeOperator,
    notes,
    paidAmount,
    setMetadata,
    setCurrencyPreservingPrices,
    handleSave,
    handleSaveAsQuotation,
    isSavingQuotation,
    executeSave,
    showConfirmModal,
    setShowConfirmModal,
    targetStatus,
    isPending,
    invoiceForPrint,
    confirmModalItems,
    cashboxName,
    warehouseName,
  } = useCreateInvoiceController(onSuccess);

  if (companyLoading && !comp) return <PageLoader />;
  if (companyError && !comp)
    return <ErrorDisplay error={companyError?.message || null} variant="full" />;

  return (
    <>
      <div className="animate-in fade-in mx-auto max-w-none space-y-1 px-1 pb-24 pt-0 duration-500 sm:space-y-1.5 sm:px-1.5 sm:pb-24 sm:pt-0">
        {/* شريط تبويبات الفواتير المفتوحة المتعددة بالتوازي */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <OpenInvoicesTabs disabled={Boolean(navigation.currentViewingInvoice)} />
        </div>

        {navigation.currentViewingInvoice ? (
          /* وضع استعراض فاتورة سابقة بنظام الميزان */
          <PreviousInvoiceView
            invoiceId={navigation.currentViewingInvoice.id}
            onClose={navigation.exitViewingMode}
            onCopiedToNewInvoice={navigation.exitViewingMode}
          />
        ) : (
          /* وضع تحرير الفاتورة الجديدة المفتوحة */
          <>
            <DraftStatusBanner
              itemCount={enteredItemsCount}
              onClearDraft={resetCart}
              entityName={selectedCustomer?.name}
            />
            {/* Modern Enterprise Invoice Workspace Container */}
            <div
              className={`flex flex-col rounded-2xl border shadow-xl transition-all duration-300 ${
                invoiceType === 'credit'
                  ? 'border-rose-400/90 bg-rose-50/25 ring-2 ring-rose-500/20 dark:border-rose-600/80 dark:bg-rose-950/15 dark:ring-rose-500/25'
                  : 'border-slate-200 bg-[var(--app-surface)] dark:border-slate-800'
              }`}
            >
              {invoiceType === 'credit' && (
                <div className="flex items-center justify-between gap-2 rounded-t-2xl border-b border-rose-200/90 bg-gradient-to-l from-rose-50 via-rose-100/80 to-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 dark:border-rose-800/70 dark:from-rose-950/70 dark:via-rose-900/50 dark:to-rose-950/70 dark:text-rose-200">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-300">
                      <AlertTriangle size={13} className="animate-pulse" />
                    </span>
                    <span>
                      وضع البيع الآجل (Credit) مفعّل — سيتم قيد المبلغ المتبقي كمديونية على حساب العميل
                    </span>
                  </div>
                  <span className="hidden rounded-full border border-rose-300 bg-white/80 px-2 py-0.5 text-[10px] font-black text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200 sm:inline-block">
                    فاتورة آجلة
                  </span>
                </div>
              )}
              {comp && (
                <div className="hidden md:block">
                  <InvoiceHeader company={comp} />
                </div>
              )}
              <InvoiceMeta invoiceNumber={nextInvoiceNumber ?? (numberLoading ? '...' : '---')} />
              <InteractiveInvoiceTable />
              <InvoiceTotals
                notes={notes}
                onNotesChange={value => {
                  setMetadata('notes', value);
                }}
              />
            </div>

            <div className="flex justify-end">
              <InvoiceActions
                onSave={handleSave}
                onSaveAsQuotation={() => {
                  void handleSaveAsQuotation();
                }}
                isSavingQuotation={isSavingQuotation}
                onPrint={() => {
                  handlePrint();
                }}
                isSaving={isPending}
              />
            </div>
          </>
        )}

        {/* شريط الميزان الثابت للتنقل وإجراءات الفاتورة مع الأيقونات المطورة */}
        <InvoiceNavigatorBar
          navigation={navigation}
          defaultNextNumber={nextInvoiceNumber ?? undefined}
          onNewInvoiceClick={navigation.exitViewingMode}
          onSave={handleSave}
          onSaveAsQuotation={() => {
            void handleSaveAsQuotation();
          }}
          isSavingQuotation={isSavingQuotation}
          onPrint={() => {
            handlePrint();
          }}
          isSaving={isPending}
          totalAmount={summary.totalAmount}
          currencyCode={currency}
        />
      </div>

      {/* [FIX #4] PrintableInvoice مركّب خارج الشاشة (بلا display:none) لتهيئة الشعار والهيدر فوراً للطباعة */}
      <div
        className="pointer-events-none fixed -left-[10000px] top-0 w-[210mm] opacity-0"
        aria-hidden="true"
      >
        <div ref={printRef}>
          <PrintableInvoice invoice={invoiceForPrint} />
        </div>
      </div>

      {/* Interactive Confirmation Modal */}
      <InvoiceConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => {
          setShowConfirmModal(false);
        }}
        onConfirm={() => {
          executeSave(targetStatus);
        }}
        isSubmitting={isPending}
        mode="sale"
        invoiceNumber={nextInvoiceNumber ?? undefined}
        partyName={selectedCustomer?.name ?? 'عميل نقدي'}
        invoiceType={invoiceType}
        currency={currency}
        exchangeRate={currency === 'SAR' ? 1 : exchangeRate || 1}
        exchangeOperator={exchangeOperator}
        cashboxName={cashboxName}
        warehouseName={warehouseName}
        items={confirmModalItems}
        subtotal={summary.subtotal}
        discount={summary.discountAmount}
        tax={0}
        total={summary.totalAmount}
        paidAmount={invoiceType === 'credit' ? paidAmount : undefined}
        notes={notes}
        onSwitchToYER={() => setCurrencyPreservingPrices('YER')}
      />
    </>
  );
};

export default CreateInvoiceView;
