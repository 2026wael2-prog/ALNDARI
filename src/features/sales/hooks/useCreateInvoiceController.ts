import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import { useSalesStore } from '../store';
import { useCreateInvoice, useNextInvoiceNumber } from './index';
import { salesQuotationsApi } from '../api';
import { useAuthStore } from '../../auth/store';
import { useCompany } from '../../settings/hooks';
import { useSettingsStore } from '../../settings/settingsStore';
import { useFeedbackStore } from '../../feedback/store';
import { partiesService } from '../../parties/service';
import type { InvoiceStatus } from '../types';
import { logger } from '../../../core/utils/logger';
import { createIdempotencyKey } from '../../../core/utils/idempotency';
import { formatLocalDate } from '../../../core/utils/dateUtils';
import { parseError } from '../../../core/utils/errorUtils';
import { usePaymentAccounts } from '../../accounting/hooks/index';
import { useWarehouses } from '../../inventory/hooks/useInventoryManagement';
import { useInvoiceNavigation } from './useInvoiceNavigation';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';
import { useOpenInvoicesStore } from '../store/openInvoicesStore';
import type { CustomerCreditAlertData } from './useCustomerCreditAlert';

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
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { invoice: invoiceSettings } = useSettingsStore();
  const { showToast } = useFeedbackStore();
  const { data: paymentAccounts } = usePaymentAccounts();
  const { data: rawWarehouses } = useWarehouses();
  const { branchId, branchName } = useBranchFilter();

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [targetStatus, setTargetStatus] = useState<InvoiceStatus>('paid');
  const [isSavingQuotation, setIsSavingQuotation] = useState(false);
  const [lastSavedInvoiceNumber, setLastSavedInvoiceNumber] = useState<string | null>(null);

  const navigation = useInvoiceNavigation();
  const { activeDraftId, syncCurrentDraft } = useOpenInvoicesStore();
  const lastSyncedDraftIdRef = useRef<string>(activeDraftId);

  // مزامنة حالة السلة الحالية مع المتجر المفتوح فقط عند بقاء نفس التبويب النشط (تمنع الكتابة فوق مسودة أخرى عند التبديل أو الحفظ)
  useEffect(() => {
    if (navigation.currentViewingInvoice || !activeDraftId) return;
    if (lastSyncedDraftIdRef.current !== activeDraftId) {
      lastSyncedDraftIdRef.current = activeDraftId;
      return;
    }
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
    documentTitle: `فاتورة_${lastSavedInvoiceNumber ?? nextInvoiceNumber ?? 'مسودة'}`,
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

    // حوكمة الائتمان: التحقق من تجميد الائتمان أو تجاوز السقف الائتماني في الفواتير الآجلة
    if (invoiceType === 'credit' && selectedCustomer.id && comp?.id) {
      const creditData = queryClient.getQueryData<CustomerCreditAlertData | null>([
        'customer_credit_alert',
        comp.id,
        selectedCustomer.id,
      ]);
      const isManager = user?.role === 'owner' || user?.role === 'admin' || user?.role === 'manager';
      if (creditData?.status === 'blocked') {
        if (!isManager) {
          showToast(
            'حساب هذا العميل مجمّد ائتمانياً — البيع متاح نقداً فقط أو بموافقة المدير بعد فك التجميد.',
            'error'
          );
          return;
        }
        const allowBlocked = window.confirm(
          `تنبيه حوكمة الائتمان:\n\nحساب العميل (${selectedCustomer.name}) مجمّد ائتمانياً (Blocked).\nهل تريد المتابعة واعتماد البيع الآجل بصلاحية المدير؟`
        );
        if (!allowBlocked) return;
      }

      const creditLimit = creditData?.creditLimit ?? 0;
      if (creditLimit > 0) {
        const activeCurr = (currency || 'SAR').toUpperCase();
        const currEntry = creditData?.balancesByCurrency.find(
          b => b.currency_code.toUpperCase() === activeCurr
        );
        const currentBal = currEntry ? currEntry.balance : activeCurr === 'SAR' ? (creditData?.balance ?? 0) : 0;
        const addedCredit = Math.max(0, summary.totalAmount - (paidAmount || 0));
        const projectedBal = Math.round((currentBal + addedCredit) * 100) / 100;
        if (projectedBal > creditLimit) {
          const proceedOverLimit = window.confirm(
            `تنبيه تجاوز السقف الائتماني:\n\nالعميل: ${selectedCustomer.name}\nالرصيد المتوقع بعد الفاتورة: ${String(projectedBal)} ${activeCurr}\nالسقف الائتماني المعتمد: ${String(creditLimit)} ${activeCurr}\n\nهل تريد المتابعة واعتماد الفاتورة الآجلة؟`
          );
          if (!proceedOverLimit) return;
        }
      }
    }

    setTargetStatus(status);
    setShowConfirmModal(true);
  };

  const handleSaveAsQuotation = async (): Promise<void> => {
    if (isSavingQuotation || isPending) return;
    if (!comp?.id || !user?.id) {
      showToast('جلسة العمل غير صالحة — يرجى تحديث الصفحة', 'error');
      return;
    }

    const validItems = items.filter(
      item =>
        (Boolean(item.productId) || Boolean(item.name.trim())) &&
        item.quantity > 0 &&
        item.price >= 0
    );
    if (validItems.length === 0) {
      showToast('يرجى إضافة صنف واحد على الأقل لحفظ عرض السعر', 'warning');
      return;
    }

    setIsSavingQuotation(true);
    try {
      const today = formatLocalDate();
      const validUntilDate = new Date();
      validUntilDate.setDate(validUntilDate.getDate() + 7);
      const validUntil = formatLocalDate(validUntilDate);

      const quotation = await salesQuotationsApi.createQuotation(comp.id, user.id, {
        partyId: selectedCustomer?.id || null,
        issueDate: today,
        validUntil,
        discountAmount: summary.discountAmount || 0,
        currencyCode: currency || 'SAR',
        exchangeRate: currency === 'SAR' ? 1 : exchangeRate || 1,
        notes: notes.trim() || undefined,
        branchId: branchId || null,
        items: validItems.map(item => ({
          productId: item.productId || '',
          description: item.name || 'صنف',
          quantity: item.quantity,
          unitPrice: item.price,
          discountPercent: item.discount || 0,
        })),
      });

      void queryClient.invalidateQueries({ queryKey: ['sales_quotations'] });
      void queryClient.invalidateQueries({ queryKey: ['sales_quotations_summary'] });

      showToast(
        `تم حفظ عرض السعر (${quotation.quotation_number}) بنجاح — تجده في تبويب عروض الأسعار`,
        'success'
      );
    } catch (error) {
      logger.error('CreateInvoiceView', 'Failed to save quotation from invoice cart', error);
      showToast('تعذر حفظ عرض السعر: ' + parseError(error).message, 'error');
    } finally {
      setIsSavingQuotation(false);
    }
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
        onSuccess: savedRes => {
          setShowConfirmModal(false);
          if (savedRes?.invoice_number) {
            setLastSavedInvoiceNumber(savedRes.invoice_number);
          }
          const openStore = useOpenInvoicesStore.getState();
          const savedDraftId = openStore.activeDraftId;
          const hadOtherOpenDrafts = openStore.drafts.length > 1;
          const nextDraft = savedDraftId ? openStore.closeDraft(savedDraftId) : null;

          // تحديث المرجع قبل تحميل السلة التالية حتى لا يقوم useEffect بالكتابة فوق المسودة الأخرى!
          lastSyncedDraftIdRef.current = nextDraft?.id ?? '';
          invoiceIdempotencyKeyRef.current = createIdempotencyKey('sale');

          if (hadOtherOpenDrafts && nextDraft) {
            useSalesStore.getState().loadCartState({
              items: nextDraft.items,
              selectedCustomer: nextDraft.selectedCustomer,
              invoiceType: nextDraft.invoiceType,
              currency: nextDraft.currency,
              exchangeRate: nextDraft.exchangeRate,
              exchangeOperator: nextDraft.exchangeOperator,
              warehouseId: nextDraft.warehouseId,
              cashboxId: nextDraft.cashboxId,
              paidAmount: nextDraft.paidAmount,
              showDiscount: nextDraft.showDiscount,
              notes: nextDraft.notes,
            });
            showToast(
              `تم حفظ الفاتورة بنجاح والانتقال إلى الفاتورة المفتوحة (${nextDraft.tabTitle})`,
              'success'
            );
            return;
          }

          resetCart();
          onSuccess();
        },
      }
    );
  };

  const invoiceForPrint = useMemo(
    () => ({
      company,
      invoice_number: lastSavedInvoiceNumber || nextInvoiceNumber || '...',
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
      lastSavedInvoiceNumber,
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
  };
};
