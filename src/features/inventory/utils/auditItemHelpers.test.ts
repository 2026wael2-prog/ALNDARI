import { describe, it, expect } from 'vitest';
import { resolveExpectedQuantity } from './auditItemHelpers';
import type { Product } from '../types';

describe('resolveExpectedQuantity', () => {
  const dummyProduct: Product = {
    id: 'prod-1',
    company_id: 'comp-1',
    name: 'بطارية 50 ايسي ديلكو اكتروني يمين R',
    name_ar: 'بطارية 50 ايسي ديلكو اكتروني يمين R',
    sku: '1011799',
    part_number: 'N50MFR',
    brand: 'ACDelco',
    category: 'بطاريات',
    stock_quantity: -79, // Total from other warehouses
    cost_price: 100,
    sale_price: 150,
    min_stock_level: 5,
    is_core: false,
    item_type: 'stock',
    unit: 'حبة',
    warehouse_distribution: [
      {
        warehouse_id: 'wh-wael',
        warehouse_name: 'المحل - فرع وائل',
        quantity: -79,
      },
    ],
  };

  it('returns 0 when warehouseId is provided but not in warehouse_distribution (prevents cross-branch leak)', () => {
    // When auditing 'wh-mohammed', it has no stock record, so it must return 0, NEVER -79
    const result = resolveExpectedQuantity(dummyProduct, 'wh-mohammed');
    expect(result).toBe(0);
  });

  it('returns exact warehouse stock when warehouseId exists in distribution', () => {
    const result = resolveExpectedQuantity(dummyProduct, 'wh-wael');
    expect(result).toBe(-79);
  });

  it('returns 0 when warehouseId is provided and warehouse_distribution is empty', () => {
    const productWithoutDist: Product = {
      ...dummyProduct,
      warehouse_distribution: [],
    };
    const result = resolveExpectedQuantity(productWithoutDist, 'wh-mohammed');
    expect(result).toBe(0);
  });

  it('falls back to stock_quantity only when warehouseId is undefined/empty', () => {
    const result = resolveExpectedQuantity(dummyProduct, undefined);
    expect(result).toBe(-79);

    const resultEmpty = resolveExpectedQuantity(dummyProduct, '');
    expect(resultEmpty).toBe(-79);
  });
});
