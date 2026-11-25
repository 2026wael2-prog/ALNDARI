import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supplierPortalService } from '../../services/supplierPortalService';
import type { SupplierPrintQuotation } from '../SupplierQuotationPrintModal';
import type { PublicPortalContext, PublicPortalQuotation } from '../../types';
import type { ReorderProductItem } from './ReorderCatalogTab';
import type { DraftItem } from './PortalDraftDrawer';

export function usePublicPortalController() {
  const { token: urlToken } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const token = urlToken || searchParams.get('token') || '';

  const [context, setContext] = useState<PublicPortalContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'reorder' | 'rfqs' | 'quotations'>('reorder');
  const [productSearch, setProductSearch] = useState('');
  const [onlyNeedsReorder, setOnlyNeedsReorder] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [deliveryTerms, setDeliveryTerms] = useState('التسليم خلال 3 أيام عمل');
  const [paymentTerms, setPaymentTerms] = useState('نقداً عند الاستلام');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<{ number: string; total: number } | null>(
    null
  );

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedPrintQuotation, setSelectedPrintQuotation] =
    useState<SupplierPrintQuotation | null>(null);
  const [copiedOem, setCopiedOem] = useState<string | null>(null);

  const fetchContext = useCallback(async () => {
    if (!token) {
      setErrorMessage('رمز الوصول مفقود. يرجى استخدام الرابط الخاص بكم.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await supplierPortalService.getPublicPortalContext(token.trim());
      setContext(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'رابط البوابة غير صالح أو منتهي الصلاحية';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchContext();
  }, [fetchContext]);

  const handleAddProductToDraft = useCallback((product: ReorderProductItem) => {
    setDraftItems(prev => {
      const existingIdx = prev.findIndex(item => item.product_id === product.id);
      if (existingIdx >= 0) {
        return prev.map((item, idx) =>
          idx === existingIdx ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          description: product.name_ar,
          oem_number: product.part_number,
          brand: product.brand,
          quantity: 1,
          // Internal pricing is shielded server-side; supplier enters their own price.
          unit_price: 0,
          discount_percent: 0,
        },
      ];
    });
    setIsDrawerOpen(true);
  }, []);

  const handleBulkAddSelectedToDraft = useCallback(() => {
    if (!context || selectedProductIds.size === 0) return;
    const selectedList = context.reorder_products.filter(p => selectedProductIds.has(p.id));

    setDraftItems(prev => {
      const updated = [...prev];
      for (const p of selectedList) {
        const existing = updated.find(item => item.product_id === p.id);
        if (existing) {
          existing.quantity += 1;
        } else {
          updated.push({
            product_id: p.id,
            description: p.name_ar,
            oem_number: p.part_number,
            brand: p.brand,
            quantity: 1,
            unit_price: 0,
            discount_percent: 0,
          });
        }
      }
      return updated;
    });

    setSelectedProductIds(new Set());
    setIsDrawerOpen(true);
  }, [context, selectedProductIds]);

  const handleLoadRFQIntoDraft = useCallback((rfq: PublicPortalContext['rfqs'][0]) => {
    if (!rfq.items || rfq.items.length === 0) return;
    setDraftItems(
      rfq.items.map(it => ({
        product_id: it.product_id ?? null,
        description: it.description,
        oem_number: it.oem_number ?? null,
        brand: null,
        quantity: it.quantity,
        unit_price: it.target_unit_price || 0,
        discount_percent: 0,
        notes: it.notes || null,
      }))
    );
    if (rfq.delivery_date) {
      setDeliveryTerms(`التسليم المطلوب بحلول ${rfq.delivery_date}`);
    }
    setIsDrawerOpen(true);
  }, []);

  const handleReQuoteFromHistory = useCallback((q: PublicPortalQuotation) => {
    if (!q.items || q.items.length === 0) return;
    setDraftItems(
      q.items.map(it => ({
        product_id: it.product_id ?? null,
        description: it.description,
        oem_number: null,
        brand: null,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount_percent: 0,
        notes: null,
      }))
    );
    if (q.delivery_terms) setDeliveryTerms(q.delivery_terms);
    if (q.payment_terms) setPaymentTerms(q.payment_terms);
    setIsDrawerOpen(true);
  }, []);

  const handleOpenPrintModal = useCallback((q: PublicPortalQuotation) => {
    setSelectedPrintQuotation({
      id: q.id,
      quotation_number: q.quotation_number,
      issue_date: q.issue_date,
      valid_until: q.valid_until,
      total_amount: q.total_amount,
      currency_code: q.currency_code || 'SAR',
      status: q.status,
      notes: q.notes,
      delivery_terms: q.delivery_terms,
      items: q.items
        ? q.items.map(it => ({
            id: it.id,
            product_id: it.product_id ?? null,
            description: it.description,
            oem_number: null,
            brand: null,
            quantity: it.quantity,
            unit_price: it.unit_price,
            discount_percent: 0,
            total: it.total,
            notes: null,
          }))
        : undefined,
    });
    setIsPrintModalOpen(true);
  }, []);

  const draftTotal = useMemo(
    () =>
      draftItems.reduce((sum, item) => {
        const line = item.quantity * item.unit_price * (1 - item.discount_percent / 100);
        return sum + line;
      }, 0),
    [draftItems]
  );

  const handleSubmitQuotation = useCallback(async () => {
    if (draftItems.length === 0) {
      alert('يرجى إضافة صنف واحد على الأقل في عرض السعر');
      return;
    }

    const hasZeroPrice = draftItems.some(i => i.unit_price <= 0);
    if (hasZeroPrice && !window.confirm('بعض الأصناف بسعر 0، هل ترغب في المتابعة؟')) {
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        items: draftItems.map(item => ({
          product_id: item.product_id || null,
          description: item.description,
          oem_number: item.oem_number || null,
          brand: item.brand || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent,
          notes: item.notes || null,
        })),
        notes,
        delivery_terms: deliveryTerms,
        payment_terms: paymentTerms,
        currency_code: 'SAR',
      };

      const result = await supplierPortalService.submitPublicQuotation(token.trim(), payload);
      setSuccessResult({
        number: result.quotation_number,
        total: result.total_amount,
      });
      setDraftItems([]);
      void fetchContext();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل إرسال عرض السعر';
      alert(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [deliveryTerms, draftItems, fetchContext, notes, paymentTerms, token]);

  const handleCopyOEM = useCallback((oem: string) => {
    void navigator.clipboard.writeText(oem);
    setCopiedOem(oem);
    setTimeout(() => {
      setCopiedOem(null);
    }, 2000);
  }, []);

  return {
    context,
    isLoading,
    errorMessage,
    activeTab,
    setActiveTab,
    productSearch,
    setProductSearch,
    onlyNeedsReorder,
    setOnlyNeedsReorder,
    selectedProductIds,
    setSelectedProductIds,
    isDrawerOpen,
    setIsDrawerOpen,
    draftItems,
    setDraftItems,
    deliveryTerms,
    setDeliveryTerms,
    paymentTerms,
    setPaymentTerms,
    notes,
    setNotes,
    isSubmitting,
    successResult,
    setSuccessResult,
    isPrintModalOpen,
    setIsPrintModalOpen,
    selectedPrintQuotation,
    setSelectedPrintQuotation,
    copiedOem,
    draftTotal,
    handleAddProductToDraft,
    handleBulkAddSelectedToDraft,
    handleLoadRFQIntoDraft,
    handleReQuoteFromHistory,
    handleOpenPrintModal,
    handleSubmitQuotation,
    handleCopyOEM,
  };
}
