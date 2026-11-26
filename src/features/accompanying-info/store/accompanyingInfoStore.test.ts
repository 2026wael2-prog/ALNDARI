import { beforeEach, describe, expect, it } from 'vitest';
import { useAccompanyingInfoStore } from './accompanyingInfoStore';

describe('useAccompanyingInfoStore', () => {
  beforeEach(() => {
    useAccompanyingInfoStore.setState({
      enabled: false,
      isOpen: false,
      isPinned: false,
      isMinimized: false,
      target: null,
      partyData: null,
      invoiceData: null,
      productData: null,
      isLoading: false,
      error: null,
    });
  });

  it('prevents opening when feature is disabled and closes panel upon disabling', () => {
    const store = useAccompanyingInfoStore.getState();

    store.toggleOpen();
    expect(useAccompanyingInfoStore.getState().isOpen).toBe(false);

    store.setOpen(true);
    expect(useAccompanyingInfoStore.getState().isOpen).toBe(false);

    store.setEnabled(true);
    store.setOpen(true);
    expect(useAccompanyingInfoStore.getState().isOpen).toBe(true);

    store.setEnabled(false);
    expect(useAccompanyingInfoStore.getState().enabled).toBe(false);
    expect(useAccompanyingInfoStore.getState().isOpen).toBe(false);
  });

  it('clears stale entity data when switching to a different target type', () => {
    const store = useAccompanyingInfoStore.getState();

    store.setTarget({ type: 'product', id: 'prod-1', title: 'فلتر زيت' });
    store.setProductData({
      id: 'prod-1',
      name_ar: 'فلتر زيت',
      sku: 'SKU-1',
      part_number: 'P-1',
      brand: 'Toyota',
      unit: 'حبة',
      sale_price: 50,
      purchase_price: 28,
      cost_price: 30,
      total_stock: 10,
      warehouses_stock: [],
      alternatives: [],
    });
    expect(useAccompanyingInfoStore.getState().productData?.id).toBe('prod-1');

    store.setTarget({ type: 'customer', id: 'cust-1', title: 'عميل تجريبي' });
    expect(useAccompanyingInfoStore.getState().productData).toBeNull();
    expect(useAccompanyingInfoStore.getState().target?.type).toBe('customer');
  });

  it('resets loading on data/error updates and resets everything on clear', () => {
    const store = useAccompanyingInfoStore.getState();

    store.setLoading(true);
    store.setError('فشل الجلب');
    expect(useAccompanyingInfoStore.getState().isLoading).toBe(false);
    expect(useAccompanyingInfoStore.getState().error).toBe('فشل الجلب');

    store.clear();
    expect(useAccompanyingInfoStore.getState().target).toBeNull();
    expect(useAccompanyingInfoStore.getState().error).toBeNull();
  });
});
