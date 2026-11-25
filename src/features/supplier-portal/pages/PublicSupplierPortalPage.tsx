import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import PageLoader from '../../../ui/base/PageLoader';
import { SupplierQuotationPrintModal } from '../components/SupplierQuotationPrintModal';
import { PortalHeader } from '../components/public/PortalHeader';
import { ReorderCatalogTab } from '../components/public/ReorderCatalogTab';
import { RfqsListTab } from '../components/public/RfqsListTab';
import { QuotationHistoryTab } from '../components/public/QuotationHistoryTab';
import { PortalDraftDrawer } from '../components/public/PortalDraftDrawer';
import { usePublicPortalController } from '../components/public/usePublicPortalController';
import { buildPublicPortalProductColumns } from '../components/public/publicPortalColumns';

export const PublicSupplierPortalPage: React.FC = () => {
  const ctrl = usePublicPortalController();

  const productColumns = useMemo(
    () =>
      buildPublicPortalProductColumns({
        copiedOem: ctrl.copiedOem,
        onCopyOem: ctrl.handleCopyOEM,
        onAddProductToDraft: ctrl.handleAddProductToDraft,
      }),
    [ctrl.copiedOem, ctrl.handleCopyOEM, ctrl.handleAddProductToDraft]
  );

  if (ctrl.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <PageLoader />
      </div>
    );
  }

  if (ctrl.errorMessage || !ctrl.context) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100"
        dir="rtl"
      >
        <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-lg font-black text-white">تعذر الدخول إلى بوابة الموردين</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{ctrl.errorMessage}</p>
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-[11px] text-slate-400">
            يرجى التواصل مع إدارة المشتريات لتزويدكم برابط وصول حديث ومباشر.
          </div>
        </div>
      </div>
    );
  }

  const { supplier, company, reorder_products, rfqs, quotations } = ctrl.context;
  const reorderCount = reorder_products.filter(p => p.needs_reorder).length;
  const filteredProducts = ctrl.onlyNeedsReorder
    ? reorder_products.filter(p => p.needs_reorder)
    : reorder_products;

  return (
    <div className="min-h-screen bg-slate-950 pb-20 font-sans text-slate-100" dir="rtl">
      <PortalHeader
        company={company}
        supplier={supplier}
        draftCount={ctrl.draftItems.length}
        onOpenDrawer={() => {
          ctrl.setIsDrawerOpen(true);
        }}
        activeTab={ctrl.activeTab}
        setActiveTab={ctrl.setActiveTab}
        reorderCount={reorderCount}
        rfqsCount={rfqs.length}
        quotationsCount={quotations.length}
        onSelectReorderTab={() => {
          ctrl.setActiveTab('reorder');
          ctrl.setOnlyNeedsReorder(true);
        }}
      />

      <main className="mx-auto max-w-7xl space-y-4 px-4 pt-4">
        {ctrl.activeTab === 'reorder' && (
          <ReorderCatalogTab
            products={filteredProducts}
            reorderCount={reorderCount}
            onlyNeedsReorder={ctrl.onlyNeedsReorder}
            setOnlyNeedsReorder={ctrl.setOnlyNeedsReorder}
            selectedProductIds={ctrl.selectedProductIds}
            setSelectedProductIds={ctrl.setSelectedProductIds}
            onBulkAddSelectedToDraft={ctrl.handleBulkAddSelectedToDraft}
            productSearch={ctrl.productSearch}
            setProductSearch={ctrl.setProductSearch}
            productColumns={productColumns}
          />
        )}

        {ctrl.activeTab === 'rfqs' && (
          <RfqsListTab rfqs={rfqs} onQuoteRfq={ctrl.handleLoadRFQIntoDraft} />
        )}

        {ctrl.activeTab === 'quotations' && (
          <QuotationHistoryTab
            quotations={quotations}
            onOpenPrintModal={ctrl.handleOpenPrintModal}
            onReQuote={ctrl.handleReQuoteFromHistory}
          />
        )}
      </main>

      <PortalDraftDrawer
        isOpen={ctrl.isDrawerOpen}
        onClose={() => {
          ctrl.setIsDrawerOpen(false);
        }}
        draftItems={ctrl.draftItems}
        setDraftItems={ctrl.setDraftItems}
        deliveryTerms={ctrl.deliveryTerms}
        setDeliveryTerms={ctrl.setDeliveryTerms}
        paymentTerms={ctrl.paymentTerms}
        setPaymentTerms={ctrl.setPaymentTerms}
        notes={ctrl.notes}
        setNotes={ctrl.setNotes}
        draftTotal={ctrl.draftTotal}
        isSubmitting={ctrl.isSubmitting}
        onSubmit={ctrl.handleSubmitQuotation}
        successResult={ctrl.successResult}
        onSuccessDismiss={() => {
          ctrl.setSuccessResult(null);
          ctrl.setIsDrawerOpen(false);
          ctrl.setActiveTab('quotations');
        }}
      />

      <SupplierQuotationPrintModal
        isOpen={ctrl.isPrintModalOpen}
        onClose={() => {
          ctrl.setIsPrintModalOpen(false);
          ctrl.setSelectedPrintQuotation(null);
        }}
        quotation={ctrl.selectedPrintQuotation}
        context={ctrl.context}
      />
    </div>
  );
};

export default PublicSupplierPortalPage;
