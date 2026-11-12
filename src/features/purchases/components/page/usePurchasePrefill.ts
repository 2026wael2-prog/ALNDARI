import { useEffect } from 'react';
import { usePurchaseStore } from '../../store';
import { useAIPrefillStore } from '../../../ai/store';
import type { AIEntityItem } from '../../../ai/core/types';

export type PurchaseTab = 'create' | 'list' | 'returns' | 'analytics' | 'smart_import' | 'quotations';

export const usePurchasePrefill = (
  setActiveTab: React.Dispatch<React.SetStateAction<PurchaseTab>>
): void => {
  const { bulkLoadItems, setMetadata, setSupplier } = usePurchaseStore();
  const consumePrefill = useAIPrefillStore(state => state.consumePrefill);

  useEffect(() => {
    const aiData = consumePrefill(['create_purchase_invoice', 'create_return_purchase']);
    const entities = aiData?.entities;
    if (entities === undefined) return;
    if (entities.partyName !== undefined && entities.partyName !== '')
      setSupplier({ id: `ai_temp_${String(Date.now())}`, name: entities.partyName });
    if (entities.items !== undefined && entities.items.length > 0) {
      bulkLoadItems(
        entities.items.map((item: AIEntityItem) => ({
          productId: '',
          sku: '',
          name: item.productName ?? 'صنف غير محدد',
          partNumber: item.productCode ?? '',
          brand: item.manufacturer ?? '',
          quantity: item.quantity ?? 1,
          unitPrice: item.unitPrice ?? 0,
          costPrice: item.unitPrice ?? 0,
        }))
      );
    }
    if (entities.paymentMethod !== undefined)
      setMetadata('invoiceType', entities.paymentMethod === 'credit' ? 'credit' : 'cash');
    setActiveTab('create');
  }, [bulkLoadItems, consumePrefill, setActiveTab, setMetadata, setSupplier]);
};

