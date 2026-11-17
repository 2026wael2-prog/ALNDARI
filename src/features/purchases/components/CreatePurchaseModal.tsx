import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Save, Printer } from 'lucide-react';
import { usePurchaseStore } from '../store';
import { useCreatePurchase } from '../hooks';
import { useCompany } from '../../settings/hooks';
import { useSettingsStore } from '../../settings/settingsStore';
import { useFeedbackStore } from '../../feedback/store';
import { usePaymentAccounts } from '../../accounting/hooks/index';
import { useWarehouses } from '../../inventory/hooks/useWarehouses';
import InvoiceHeader from '../../sales/components/create/InvoiceHeader';
import PurchaseMeta from './create/PurchaseMeta';
import InteractivePurchaseTable from './create/InteractivePurchaseTable';
import { getDefaultExchangeOperator } from '../../../core/utils/currencyUtils';
import Button from '../../../ui/base/Button';
import DraftStatusBanner from '../../../ui/common/DraftStatusBanner';
import { InvoiceConfirmationModal } from '../../../ui/common/InvoiceConfirmationModal';
import {
  filterValidPurchaseItems,
  hasText,
  validatePurchase,
} from './create/purchaseValidation';
import { PurchaseTotalsSection } from './create/PurchaseTotalsSection';

interface Props {
  onSuccess: () => void;
}

const CreatePurchaseModal: React.FC<Props> = ({ onSuccess }) => {
  const { data: company } = useCompany();
  const {
    items,
    supplier,
    totals,
    resetCart,
    initializeItems,
    invoiceNumber,
    issueDate,
    invoiceType,
    cashboxId,
    paidAmount,
    warehouseId,
    notes,
    currency,
    exchangeRate,
    setMetadata,
  } = usePurchaseStore();
  const { mutate: createPurchase, isPending } = useCreatePurchase();
  const { invoice: invoiceSettings } = useSettingsStore();
  const { showToast } = useFeedbackStore();
  const { data: rawCashAccounts } = usePaymentAccounts();
  const { data: rawWarehouses } = useWarehouses();
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'مسودة_فاتورة_مشتريات',
  });

  useEffect(() => {
    initializeItems(6);
    const defCurrency = invoiceSettings.default_currency || 'SAR';
    setMetadata('currency', defCurrency);
    if (defCurrency === 'SAR') {
      setMetadata('exchangeRate', 1);
    }
    setMetadata('invoiceType', invoiceSettings.default_invoice_type);
  }, [
    initializeItems,
    invoiceSettings.default_currency,
    invoiceSettings.default_invoice_type,
    setMetadata,
  ]);

  useEffect((): (() => void) => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      const hasWork = items.some(item => item.productId !== '' && item.quantity > 0);
      if (hasWork) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return (): void => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [items]);

  const handleSave = useCallback((): void => {
    const validItems = filterValidPurchaseItems(items);
    const availableWarehouseIds = (rawWarehouses ?? []).map(w => w.id);
    const validationError = validatePurchase({
      supplier,
      issueDate,
      warehouseId,
      availableWarehouseIds,
      invoiceType,
      cashboxId,
      validItems,
    });
    if (validationError !== null) {
      showToast(
        validationError,
        invoiceType === 'cash' && !hasText(cashboxId) ? 'warning' : 'error'
      );
      return;
    }
    if (supplier === null) return;

    if (invoiceType === 'credit' && (paidAmount || 0) > totals.grandTotal) {
      showToast('مبلغ الدفعة المسددة لا يمكن أن يتجاوز إجمالي الفاتورة', 'error');
      return;
    }

    if (invoiceType === 'credit' && (paidAmount || 0) > 0 && !hasText(cashboxId)) {
      showToast('يرجى اختيار الصندوق / البنك لسداد الدفعة النقدية', 'warning');
      return;
    }

    setShowConfirmModal(true);
  }, [
    cashboxId,
    invoiceType,
    issueDate,
    items,
    paidAmount,
    rawWarehouses,
    showToast,
    supplier,
    totals.grandTotal,
    warehouseId,
  ]);

  const executeConfirm = useCallback((): void => {
    if (!supplier || isPending) return;
    const validItems = filterValidPurchaseItems(items);
    const primaryWh =
      (rawWarehouses ?? []).find(w => w.is_primary) ?? (rawWarehouses ?? [])[0];
    const effectiveWarehouseId =
      hasText(warehouseId) && (rawWarehouses ?? []).some(w => w.id === warehouseId)
        ? warehouseId
        : (primaryWh?.id ?? warehouseId);

    createPurchase(
      {
        supplierId: supplier.id,
        invoiceNumber: hasText(invoiceNumber) ? invoiceNumber : '',
        issueDate,
        items: validItems.map(item => ({
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          partNumber: item.partNumber,
          brand: item.brand,
          quantity: item.quantity,
          costPrice: item.costPrice,
          discount: item.discount,
          warehouseId: effectiveWarehouseId,
          total: Math.max(0, item.quantity * item.costPrice - item.discount),
        })),
        status: 'posted',
        notes: hasText(notes.trim()) ? notes.trim() : undefined,
        paymentMethod: invoiceType,
        cashAccountId: cashboxId,
        currency,
        exchangeRate: currency === 'SAR' ? 1 : exchangeRate,
        paidAmount: invoiceType === 'credit' ? paidAmount || 0 : 0,
      },
      {
        onSuccess: () => {
          setShowConfirmModal(false);
          resetCart();
          onSuccess();
        },
      }
    );
  }, [
    cashboxId,
    createPurchase,
    currency,
    exchangeRate,
    invoiceNumber,
    invoiceType,
    isPending,
    issueDate,
    items,
    notes,
    onSuccess,
    paidAmount,
    rawWarehouses,
    resetCart,
    supplier,
    warehouseId,
  ]);

  const enteredItemsCount = items.filter(item => item.productId !== '').length;

  const selectedCashbox = (
    rawCashAccounts as Array<{ id: string; name_ar: string }> | undefined
  )?.find(acc => acc.id === cashboxId);
  const selectedWarehouse = (
    rawWarehouses as Array<{ id: string; name_ar: string }> | undefined
  )?.find(w => w.id === warehouseId);

  const confirmationItems = filterValidPurchaseItems(items).map(item => ({
    name: item.name,
    sku: item.sku,
    partNumber: item.partNumber,
    brand: item.brand,
    quantity: item.quantity,
    price: item.costPrice,
    discount: item.discount,
    total: Math.max(0, item.quantity * item.costPrice - item.discount),
  }));

  return (
    <div className="animate-in fade-in mx-auto max-w-none space-y-2 px-1 pb-24 pt-1 duration-500 max-md:space-y-1.5 max-md:pb-12 max-md:pt-0 sm:space-y-3 sm:pt-2 md:px-2">
      <DraftStatusBanner
        itemCount={enteredItemsCount}
        onClearDraft={resetCart}
        entityName={supplier?.name}
      />
      <div
        ref={printRef}
        className="flex flex-col overflow-hidden rounded-2xl border-2 bg-[var(--app-surface)] shadow-2xl dark:border-gray-100 dark:border-slate-800 max-md:border"
      >
        {company && (
          <div className="hidden md:block">
            <InvoiceHeader company={company} documentTypeTitle="فاتورة توريد مشتريات" />
          </div>
        )}
        <PurchaseMeta />
        <InteractivePurchaseTable />
        <PurchaseTotalsSection
          totals={totals}
          invoiceType={invoiceType}
          paidAmount={paidAmount}
          currency={currency}
          onPaidAmountChange={val => {
            setMetadata('paidAmount', val);
          }}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-1.5 sm:gap-2 print:hidden">
        <Button
          onClick={() => {
            handlePrint();
          }}
          variant="outline"
          className="flex-1 border-gray-200 text-xs text-gray-500 sm:flex-none"
          leftIcon={<Printer size={14} />}
        >
          طباعة المستند
        </Button>
        <Button
          onClick={handleSave}
          isLoading={isPending}
          className="w-full min-w-0 text-xs sm:w-auto sm:min-w-[140px]"
          leftIcon={<Save size={14} />}
        >
          اعتماد التوريد
        </Button>
      </div>

      {/* Interactive Invoice Confirmation Modal */}
      <InvoiceConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => {
          setShowConfirmModal(false);
        }}
        onConfirm={executeConfirm}
        isSubmitting={isPending}
        mode="purchase"
        invoiceNumber={invoiceNumber || undefined}
        partyName={supplier?.name || 'مورد غير محدد'}
        invoiceType={invoiceType}
        currency={currency}
        exchangeRate={currency === 'SAR' ? 1 : exchangeRate}
        exchangeOperator={getDefaultExchangeOperator(currency)}
        cashboxName={selectedCashbox?.name_ar}
        warehouseName={selectedWarehouse?.name_ar}
        items={confirmationItems}
        subtotal={totals.subTotal}
        discount={totals.totalDiscount}
        total={totals.grandTotal}
        paidAmount={invoiceType === 'credit' ? paidAmount : undefined}
        notes={notes}
      />
    </div>
  );
};

export default CreatePurchaseModal;
