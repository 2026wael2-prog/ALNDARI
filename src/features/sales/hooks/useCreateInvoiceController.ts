import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useSalesStore } from '../store';
import { useCreateInvoice, useNextInvoiceNumber } from './index';
import { useCompany } from '../../settings/hooks';
import { useSettingsStore } from '../../settings/settingsStore';
import { useFeedbackStore } from '../../feedback/store';
import { partiesService } from '../../parties/service';
import type { InvoiceStatus } from '../types';
import { logger } from '../../../core/utils/logger';
import { createIdempotencyKey } from '../../../core/utils/idempotency';
import { formatLocalDate } from '../../../core/utils/dateUtils';
import { usePaymentAccounts } from '../../accounting/hooks/index';
import { useWarehouses } from '../../inventory/hooks/useInventoryManagement';
import { useInvoiceNavigation } from './useInvoiceNavigation';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';
import { useOpenInvoicesStore } from '../store/openInvoicesStore';

interface PaymentAccountOption {
  id: string;
  name_ar: string;
  currency_code?: string;
}

const validateCashboxCurrency = (
  cashboxId: string | undefined,
  currency: string | undefined,
  paymentAccounts: PaymentAccountOption[],
  missingMessage: string,
  mismatchPrefix: string,
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void
): boolean => {
  if (!cashboxId) {
    showToast(missingMessage, 'warning');
    return false;
  }
  const selectedBox = paymentAccounts.find(a => a.id === cashboxId);
  const invoiceCurr = (currency ?? 'SAR').toUpperCase();
  const boxCurr = (selectedBox?.currency_code ?? 'SAR').toUpperCase();
  if (selectedBox && selectedBox.currency_code !== '' && boxCurr !== invoiceCurr) {
    showToast(
      `${mismatchPrefix} (${selectedBox.name_ar} - ${boxCurr}) لا يطابق عملة الفاتورة (${invoiceCurr})`,
      'error'
    );
    return false;
  }
  return true;
};

/**
 * Encapsulates draft syncing, default customer initialization, validation,
 * currency guards, printing, and confirmation submission for CreateInvoiceView.
 */
export const useCreateInvoiceController = (onSuccess: () => void) => {
  const { data: company, isLoading: companyLoading, error: companyError } = useCompany();
  const comp = company as { id: string; [key: string]: unknown } | null;
  const { data: nextInvoiceNumber, isLoading: numberLoading } = useNextInvoiceNumber();

  const {
    items,
    selectedCustomer,
    summary,
    resetCart,
    invoiceType,
    cashboxId,
    paidAmount,
    warehouseId,
    currency,
    exchangeRate,
    exchangeOperator,
    notes,
    setMetadata,
    setCustomer,
    setCurrencyPreservingPrices,
  } = useSalesStore();

  const { mutate: createInvoice, isPending } = useCreateInvoice();
  const { invoice: invoiceSettings } = useSettingsStore();
  const { showToast } = useFeedbackStore();
  const { data: paymentAccounts } = usePaymentAccounts();
  const { data: rawWarehouses } = useWarehouses();
  const { branchId, branchName } = useBranchFilter();

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [targetStatus, setTargetStatus] = useState<InvoiceStatus>('paid');

  const navigation = useInvoiceNavigation();
  const { closeDraft, activeDraftId, syncCurrentDraft } = useOpenInvoicesStore();

  // مزامنة حالة السلة الحالية مع المتجر المفتوح عند تغيير الحقول
  useEffect(() => {
    if (!navigation.currentViewingInvoice && Boolean(activeDraftId)) {
      syncCurrentDraft({
        items,
        selectedCustomer,
        summary,
        invoiceType,
        currency,
        exchangeRate,
        exchangeOperator,
        warehouseId,
        cashboxId,
        paidAmount,
        notes,
      });
    }
  }, [
    items,
    selectedCustomer,
    summary,
    invoiceType,
    currency,
    exchangeRate,
    exchangeOperator,
    warehouseId,
    cashboxId,
    paidAmount,
    notes,
    navigation.currentViewingInvoice,
    activeDraftId,
    syncCurrentDraft,
  ]);

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `فاتورة_${nextInvoiceNumber ?? 'مسودة'}`,
  });

  const isInitialized = useRef(false);

  useEffect(() => {
    if (isInitialized.current) return;

    if (invoiceSettings?.default_currency) {
      setMetadata('currency', invoiceSettings.default_currency);
    }
    if (invoiceSettings?.default_invoice_type) {
      setMetadata('invoiceType', invoiceSettings.default_invoice_type);
    }

    if (!selectedCustomer && comp?.id) {
      isInitialized.current = true;
      const loadGeneralCustomer = async (companyId: string) => {
        try {
          const generalCustomer = await partiesService.getOrCreateGeneralParty(
            companyId,
            'customer'
          );
          const currentStoreState = useSalesStore.getState().selectedCustomer;
          if (!currentStoreState && generalCustomer) {
            setCustomer({
              id: generalCustomer.id,
              name: generalCustomer.name,
              phone: generalCustomer.phone || '',
              type: 'customer',
            });
          }
        } catch (error) {
          logger.error('CreateInvoiceView', 'Failed to load general customer', error);
        }
      };
      void loadGeneralCustomer(comp.id);
    } else if (selectedCustomer || !comp?.id) {
      if (comp?.id) isInitialized.current = true;
    }
  }, [comp?.id, invoiceSettings, selectedCustomer, setMetadata, setCustomer]);

  // تنبيه المتصفح عند محاولة الإغلاق غير المقصود مع وجود أصناف مدخلة
  useEffect((): (() => void) => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      const hasWork = items.some(i => Boolean(i.productId) && i.quantity > 0);
      if (hasWork) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return (): void => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [items]);

  const invoiceIdempotencyKeyRef = useRef(createIdempotencyKey('sale'));

  const handleSave = (status: InvoiceStatus) => {
    if (status === 'draft') {
      const hasDraftItems = items.some(
        item => Boolean(item.productId) && Boolean(item.name) && item.quantity > 0
      );
      if (!hasDraftItems) {
        showToast('أضف صنفاً واحداً على الأقل بكمية صحيحة لحفظ المسودة', 'warning');
        return;
      }
      showToast('تم حفظ المسودة محلياً على هذا الجهاز — لم تُرحَّل ولن يُخصم المخزون', 'success');
      return;
    }

    if (!selectedCustomer) {
      showToast('يرجى اختيار عميل أولاً', 'error');
      return;
    }

    const validItems = items.filter(
      item => item.productId && item.name && item.quantity > 0 && item.price > 0
    );
    if (validItems.length === 0) {
      showToast('يرجى إضافة صنف واحد على الأقل بكمية وسعر صحيحين', 'error');
      return;
    }

    if (summary.totalAmount < 0) {
      showToast('الخصم الإجمالي أكبر من قيمة الفاتورة — راجع الخصومات', 'error');
      return;
    }

    const isWaelBranch =
      Boolean(
        branchName &&
          (branchName.includes('وائل') ||
            branchName.includes('النظاري') ||
            branchName.toLowerCase().includes('wael'))
      ) ||
      (branchId ? localStorage.getItem(`branch_pref_currency_${branchId}`) === 'YER' : false);

    const isSuspiciousSAR =
      isWaelBranch &&
      currency === 'SAR' &&
      (summary.totalAmount >= 5000 || validItems.some(i => i.price >= 1000));

    if (isSuspiciousSAR) {
      const confirmYemeni = window.confirm(
        `تنبيه تدقيق العملة الصارم:\n\nإجمالي الفاتورة (${summary.totalAmount} ر.س) مرتفع جداً بالنسبة لمعاملات فرع وائل المعتادة بالريال اليمني.\n\nهل هذه الأسعار بالريال اليمني (YER)؟\n\n- اضغط [موافق / OK] للتحويل التلقائي إلى الريال اليمني (YER) وحساب المعادل الصحيح.\n- اضغط [إلغاء / Cancel] فقط إذا كنت متأكداً 100% أن المبلغ بالريال السعودي الحقيقي.`
      );
      if (confirmYemeni) {
        setCurrencyPreservingPrices('YER');
        showToast(
          'تم تحويل عملة الفاتورة إلى الريال اليمني (YER) وتثبيت سعر الصرف. يرجى مراجعة الصندوق والاعتماد.',
          'info'
        );
        return;
      }
    }

    if (
      invoiceType === 'cash' &&
      !validateCashboxCurrency(
        cashboxId,
        currency,
        paymentAccounts,
        'يرجى اختيار حساب الصندوق / البنك للفاتورة النقدية',
        'تعارض عملات: الصندوق المختار',
        showToast
      )
    ) {
      return;
    }

    if (
      invoiceType === 'credit' &&
      ((paidAmount || 0) > summary.totalAmount || (paidAmount || 0) < 0)
    ) {
      showToast('مبلغ الدفعة المسددة غير صالح؛ يجب أن يكون بين صفر وإجمالي الفاتورة', 'error');
      return;
    }

    if (
      invoiceType === 'credit' &&
      (paidAmount || 0) > 0 &&
      !validateCashboxCurrency(
        cashboxId,
        currency,
        paymentAccounts,
        'يرجى اختيار حساب الصندوق / البنك لاستلام الدفعة النقدية',
        'تعارض عملات: الصندوق المختار لاستلام الدفعة',
        showToast
      )
    ) {
      return;
    }

    setTargetStatus(status);
    setShowConfirmModal(true);
  };

  const executeSave = (statusToSave: InvoiceStatus) => {
    if (isPending) return;
    const validItems = items.filter(
      item => item.productId && item.name && item.quantity > 0 && item.price > 0
    );

    const whList = (rawWarehouses ?? []) as Array<{ id: string; is_primary?: boolean }>;
    const effectiveWarehouseId =
      warehouseId &&
      warehouseId !== 'wh_main' &&
      (whList.length === 0 || whList.some(w => w.id === warehouseId))
        ? warehouseId
        : (whList.find(w => w.is_primary)?.id ?? whList[0]?.id ?? warehouseId);

    createInvoice(
      {
        partyId: selectedCustomer?.id || null,
        customerName: selectedCustomer?.name || 'عميل نقدي',
        items: validItems.map(item => ({
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: item.price,
          costPrice: item.costPrice || 0,
          warehouseId: effectiveWarehouseId,
          maxStock: item.warehouse_distribution
            ? item.warehouse_distribution.reduce((sum, w) => sum + w.quantity, 0)
            : 9999,
        })),
        discount: summary.discountAmount,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        status: statusToSave,
        type: 'sale' as const,
        paymentMethod: invoiceType,
        treasuryAccountId: cashboxId,
        currency: currency || 'SAR',
        exchangeRate: currency === 'SAR' ? 1 : exchangeRate || 1,
        paidAmount: invoiceType === 'credit' ? paidAmount || 0 : 0,
        idempotencyKey: invoiceIdempotencyKeyRef.current,
      },
      {
        onSuccess: () => {
          setShowConfirmModal(false);
          resetCart();
          if (activeDraftId) {
            closeDraft(activeDraftId);
          }
          onSuccess();
          invoiceIdempotencyKeyRef.current = createIdempotencyKey('sale');
        },
      }
    );
  };

  const invoiceForPrint = useMemo(
    () => ({
      company,
      invoice_number: nextInvoiceNumber || '...',
      issue_date: formatLocalDate(),
      party_name: selectedCustomer?.name || 'عميل نقدي',
      party_phone: selectedCustomer?.phone || undefined,
      items: items.filter(i => i.name),
      subtotal: summary.subtotal,
      subtotal_document_amount: summary.subtotal,
      discount_amount: summary.discountAmount,
      tax_amount: 0,
      total_amount: summary.totalAmount,
      total_document_amount: summary.totalAmount,
      paid_amount: invoiceType === 'credit' ? paidAmount || 0 : summary.totalAmount,
      payment_method: invoiceType,
      notes: notes.trim() || undefined,
      currency_code: currency || 'SAR',
    }),
    [
      company,
      nextInvoiceNumber,
      selectedCustomer?.name,
      selectedCustomer?.phone,
      items,
      summary.subtotal,
      summary.discountAmount,
      summary.totalAmount,
      invoiceType,
      paidAmount,
      notes,
      currency,
    ]
  );

  const confirmModalItems = useMemo(
    () =>
      items
        .filter(
          item => Boolean(item.productId) && Boolean(item.name) && item.quantity > 0 && item.price > 0
        )
        .map(item => ({
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          price: item.price,
          total: item.quantity * item.price,
        })),
    [items]
  );

  const cashboxName = paymentAccounts.find(acc => acc.id === cashboxId)?.name_ar;
  const warehouseName = (rawWarehouses as Array<{ id: string; name_ar: string }> | undefined)?.find(
    w => w.id === warehouseId
  )?.name_ar;
  const enteredItemsCount = items.filter(i => Boolean(i.productId)).length;

  return {
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
  };
};
