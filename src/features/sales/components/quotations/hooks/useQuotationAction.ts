import { useCallback, useState } from 'react';
import type { QuotationDetailItem, QuotationDetailRow } from '@/features/sales/api/quotationsApi';
import { salesQuotationsApi } from '@/features/sales/api/quotationsApi';
import { useSalesStore, type SalesCartItem } from '@/features/sales/store';

const text = (value: string | null | undefined): string => value ?? '';

const toCartItem = (item: QuotationDetailItem): SalesCartItem => {
  const unitPrice = item.unit_price;
  const product = item.product;
  return {
    id: crypto.randomUUID(),
    productId: text(item.product_id),
    sku: text(product?.sku),
    name: text(product?.name_ar) !== '' ? text(product?.name_ar) : item.description,
    partNumber: text(product?.part_number),
    brand: text(product?.brand),
    quantity: item.quantity,
    basePrice: unitPrice,
    price: unitPrice,
    discount: item.discount_percent > 0 ? (unitPrice * item.discount_percent) / 100 : 0,
    costPrice: product?.cost_price ?? 0,
  };
};

const applyQuotationToCart = (quotation: QuotationDetailRow): void => {
  const { resetCart, setCustomer, setMetadata, calculateTotals } = useSalesStore.getState();
  resetCart();

  const party = quotation.party;
  if (party !== null) {
    setCustomer({
      id: party.id,
      name: party.name,
      ...(party.phone !== null ? { phone: party.phone } : {}),
    });
  }

  setMetadata('invoiceType', 'credit');
  useSalesStore.setState({ items: quotation.quotation_items.map(toCartItem) });
  calculateTotals();
};

export interface ActionOptions {
  quotation: QuotationDetailRow | null;
  onClose: () => void;
  onRefresh: () => void;
  onConvertToInvoice?: (() => void) | undefined;
  reload: () => Promise<void>;
}

export const useQuotationAction = (
  options: ActionOptions
): { busy: boolean; run: (s: string) => void } => {
  const { quotation, onClose, onRefresh, onConvertToInvoice, reload } = options;
  const [busy, setBusy] = useState<boolean>(false);

  const run = useCallback(
    (nextStatus: string): void => {
      if (quotation === null) return;
      void (async (): Promise<void> => {
        setBusy(true);
        try {
          if (nextStatus === 'converted') {
            applyQuotationToCart(quotation);
            await salesQuotationsApi.markAsConverted(quotation.id);
            onClose();
            if (onConvertToInvoice !== undefined) onConvertToInvoice();
            return;
          }
          await salesQuotationsApi.updateStatus(quotation.id, nextStatus);
          await reload();
          onRefresh();
        } finally {
          setBusy(false);
        }
      })();
    },
    [quotation, onClose, onRefresh, onConvertToInvoice, reload]
  );

  return { busy, run };
};
