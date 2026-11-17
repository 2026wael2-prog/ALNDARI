import { useState } from 'react';
import { logger } from '../../../core/utils/logger';
import { purchaseQuotationsApi } from '../api/quotationsApi';
import { usePurchaseStore } from '../store';
import type { ComparisonSupplier } from '../services/quotationComparison';

interface UseConvertQuotationToPurchaseOptions {
  suppliers: ComparisonSupplier[];
  onClose: () => void;
  onConvertToPurchase?: (() => void) | undefined;
}

/**
 * يعتمد عرض مورد: يملأ سلة الشراء ببنود العرض ثم يعلّم حالة العرض «محوّل»،
 * ويغلق الشاشة عند النجاح. يحمي من النقر المزدوج عبر `actionLoading`.
 */
export function useConvertQuotationToPurchase({
  suppliers,
  onClose,
  onConvertToPurchase,
}: UseConvertQuotationToPurchaseOptions): {
  actionLoading: string | null;
  handleConvertToPurchase: (quotationId: string) => Promise<void>;
} {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleConvertToPurchase = async (quotationId: string): Promise<void> => {
    const quotation = suppliers.find(supplier => supplier.id === quotationId);
    if (quotation === undefined) return;
    setActionLoading(quotationId);
    try {
      const { resetCart, setSupplier, setMetadata, bulkLoadItems } = usePurchaseStore.getState();
      resetCart();
      if (quotation.party !== null) {
        setSupplier({ id: quotation.party.id ?? '', name: quotation.party.name });
      }
      const qMeta = quotation as typeof quotation & {
        currency_code?: string | null;
        exchange_rate?: number | null;
      };
      if (qMeta.currency_code) {
        setMetadata('currency', qMeta.currency_code);
      }
      if (qMeta.exchange_rate && qMeta.exchange_rate > 0) {
        setMetadata('exchangeRate', qMeta.exchange_rate);
      }
      if (quotation.quotation_items.length > 0) {
        bulkLoadItems(
          quotation.quotation_items.map(item => ({
            productId: item.product_id ?? '',
            name: item.description,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            costPrice: item.unit_price,
          }))
        );
      }
      await purchaseQuotationsApi.updateStatus(quotationId, 'converted');
      onClose();
      if (onConvertToPurchase !== undefined) onConvertToPurchase();
    } catch (error) {
      logger.error('QuotationComparisonView', 'Failed to convert purchase quotation:', error);
    } finally {
      setActionLoading(null);
    }
  };

  return { actionLoading, handleConvertToPurchase };
}
