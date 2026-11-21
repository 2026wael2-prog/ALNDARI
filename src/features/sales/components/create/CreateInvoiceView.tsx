import React from 'react';
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
            <div className="flex flex-col rounded-2xl border border-slate-200 bg-[var(--app-surface)] shadow-xl dark:border-slate-800">
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
