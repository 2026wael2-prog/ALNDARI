import { describe, it, expect, beforeEach } from 'vitest';
import { useOpenInvoicesStore } from './openInvoicesStore';
import { useSalesStore } from '../store';
import type { Product } from '../../inventory/types';

const makeProduct = (id: string, name: string, price: number): Product =>
  ({
    id,
    name_ar: name,
    name,
    sku: `SKU-${id}`,
    part_number: `PN-${id}`,
    selling_price: price,
    cost_price: price * 0.6,
    stock_quantity: 10,
  }) as unknown as Product;

describe('useOpenInvoicesStore & Sales Cart Row Placement', () => {
  beforeEach(() => {
    useOpenInvoicesStore.getState().resetAllDrafts();
    useSalesStore.getState().resetCart();
  });

  it('initializes with a valid activeDraftId matching drafts[0].id', () => {
    const state = useOpenInvoicesStore.getState();
    expect(state.drafts.length).toBe(1);
    expect(state.activeDraftId).toBe(state.drafts[0]?.id);
    expect(state.activeDraftId.length).toBeGreaterThan(0);
  });

  it('preserves other open invoice drafts intact when saving/closing the active draft', () => {
    const store = useOpenInvoicesStore.getState();
    const draft1Id = store.activeDraftId;

    // Populate draft 1 and open draft 2 atomically
    const draft2Id = store.createDraft('فاتورة العميل الثاني', {
      selectedCustomer: { id: 'cust-1', name: 'العميل الأول' },
      notes: 'ملاحظة الفاتورة الأولى',
      summary: { subtotal: 150, discountAmount: 0, totalAmount: 150 },
    });

    // Populate draft 2
    useOpenInvoicesStore.getState().syncCurrentDraft({
      selectedCustomer: { id: 'cust-2', name: 'العميل الثاني' },
      notes: 'ملاحظة الفاتورة الثانية',
      summary: { subtotal: 320, discountAmount: 0, totalAmount: 320 },
    });

    // Switch back to draft 1 and close (simulate saving draft 1)
    useOpenInvoicesStore.getState().switchDraft(draft1Id);
    const nextDraft = useOpenInvoicesStore.getState().closeDraft(draft1Id);

    // Draft 2 must still exist completely intact and become the active draft!
    const afterState = useOpenInvoicesStore.getState();
    expect(afterState.drafts.length).toBe(1);
    expect(afterState.activeDraftId).toBe(draft2Id);
    expect(nextDraft?.id).toBe(draft2Id);
    expect(nextDraft?.selectedCustomer?.name).toBe('العميل الثاني');
    expect(nextDraft?.notes).toBe('ملاحظة الفاتورة الثانية');
    expect(nextDraft?.summary.totalAmount).toBe(320);
  });

  it('places newly added products into the first empty row (index 0) instead of row 5', () => {
    const sales = useSalesStore.getState();
    sales.initializeItems(5);
    expect(useSalesStore.getState().items.length).toBe(5);

    useSalesStore.getState().addProductToCart(makeProduct('p1', 'فلتر زيت أصلي', 45));
    let currentItems = useSalesStore.getState().items;
    expect(currentItems.length).toBe(5);
    expect(currentItems[0]?.productId).toBe('p1');
    expect(currentItems[0]?.name).toBe('فلتر زيت أصلي');
    expect(currentItems[4]?.productId).toBe('');

    useSalesStore.getState().addProductToCart(makeProduct('p2', 'فحمات أمامية', 120));
    currentItems = useSalesStore.getState().items;
    expect(currentItems.length).toBe(5);
    expect(currentItems[0]?.productId).toBe('p1');
    expect(currentItems[1]?.productId).toBe('p2');
    expect(currentItems[4]?.productId).toBe('');
  });
});
