import { describe, expect, it } from 'vitest';
import { extractPartType, extractProductSize } from '../product/sizeExtractor';
import {
  DEFAULT_INTELLIGENCE_FILTERS,
  filterAndSortProducts,
} from '../sorting/intelligenceSortAndFilter';
import { runIntelligenceEngine } from '../intelligenceEngine';
import { DEFAULT_ENGINE_CONFIG, type InventoryIntelligenceSnapshot } from '../../types';

describe('sizeExtractor & 6-dimension sorting', () => {
  it('extracts part types and sizes accurately', () => {
    expect(extractPartType('فلتر زيت تويوتا اصلي', 'عام')).toBe('فلتر');
    expect(extractPartType('صنفرة رقم 1200 العلمين', 'عام')).toBe('صنفرة / تلميع');

    expect(extractProductSize('زيت محرك 10W40 تخليقي').size).toMatch(/10W40/i);
    expect(extractProductSize('كفر هانكوك 205/55R16').size).toMatch(/205\/55R16/i);
    expect(extractProductSize('صامولة مقاس 16mm').size).toBe('16mm');
    expect(extractProductSize('قطعة مخصصة', '40x60')).toEqual({ size: '40x60', sizeSortKey: 40 });
  });

  it('filters and sorts by name, partType, size, supplier, customer, and branch', () => {
    const snapshot: InventoryIntelligenceSnapshot = {
      generated_at: '2026-11-17T00:00:00Z',
      branches: [
        { id: 'b1', name: 'الفرع الرئيسي', code: 'B1', is_main: true, warehouses: [] },
        { id: 'b2', name: 'فرع غمدان', code: 'B2', is_main: false, warehouses: [] },
      ],
      products: [
        {
          id: 'p1',
          name_ar: 'فلتر هواء مقاس 20mm',
          sku: 'S1',
          part_number: 'PN1',
          alternative_numbers: null,
          brand: 'Toyota',
          item_type: null,
          min_stock_level: 2,
          cost_price: 10,
          purchase_price: 10,
          sale_price: 15,
          category_id: null,
          category_name: 'فلاتر',
          stock_by_warehouse: [
            { warehouse_id: 'w1', branch_id: 'b1', quantity: 5, weighted_avg_cost: 10 },
            { warehouse_id: 'w2', branch_id: 'b2', quantity: 20, weighted_avg_cost: 10 },
          ],
        },
        {
          id: 'p2',
          name_ar: 'فحمات فرامل مقاس 10mm',
          sku: 'S2',
          part_number: 'PN2',
          alternative_numbers: null,
          brand: 'Denso',
          item_type: null,
          min_stock_level: 2,
          cost_price: 20,
          purchase_price: 20,
          sale_price: 30,
          category_id: null,
          category_name: 'فرامل',
          stock_by_warehouse: [
            { warehouse_id: 'w1', branch_id: 'b1', quantity: 15, weighted_avg_cost: 20 },
            { warehouse_id: 'w2', branch_id: 'b2', quantity: 2, weighted_avg_cost: 20 },
          ],
        },
      ],
      sales_history: [],
      monthly_sales: [],
      supplier_history: [
        {
          product_id: 'p1',
          supplier_id: 'sup_b',
          supplier_name: 'مورد السلام',
          purchase_tx_count: 3,
          total_qty_supplied: 30,
          avg_unit_price: 10,
          last_unit_price: 10,
          last_qty: 10,
          last_purchase_date: '2026-10-01',
        },
        {
          product_id: 'p2',
          supplier_id: 'sup_a',
          supplier_name: 'مورد الأمل',
          purchase_tx_count: 2,
          total_qty_supplied: 20,
          avg_unit_price: 20,
          last_unit_price: 20,
          last_qty: 10,
          last_purchase_date: '2026-10-01',
        },
      ],
      customer_demand: [
        {
          product_id: 'p1',
          customer_id: 'c1',
          customer_name: 'ورشة النجم',
          qty_365d: 12,
          revenue_365d: 180,
          last_order_date: '2026-11-01',
        },
        {
          product_id: 'p2',
          customer_id: 'c2',
          customer_name: 'شركة الخليج',
          qty_365d: 8,
          revenue_365d: 240,
          last_order_date: '2026-11-02',
        },
      ],
      open_pos: [],
      cross_references: [],
    };

    const output = runIntelligenceEngine(snapshot, DEFAULT_ENGINE_CONFIG);

    // Sort by size ascending: 10mm (p2) before 20mm (p1)
    const bySize = filterAndSortProducts(output.products, {
      ...DEFAULT_INTELLIGENCE_FILTERS,
      sortBy: 'size',
      sortDir: 'asc',
    });
    expect(bySize.map(p => p.identity.productId)).toEqual(['p2', 'p1']);

    // Filter by customer c1 -> only p1
    const byCustomer = filterAndSortProducts(output.products, {
      ...DEFAULT_INTELLIGENCE_FILTERS,
      customerId: 'c1',
    });
    expect(byCustomer.map(p => p.identity.productId)).toEqual(['p1']);

    // Filter by supplier sup_a -> only p2
    const bySupplier = filterAndSortProducts(output.products, {
      ...DEFAULT_INTELLIGENCE_FILTERS,
      supplierId: 'sup_a',
    });
    expect(bySupplier.map(p => p.identity.productId)).toEqual(['p2']);

    // Sort by branch b2 stock desc -> p1 (20) before p2 (2)
    const byBranchStock = filterAndSortProducts(output.products, {
      ...DEFAULT_INTELLIGENCE_FILTERS,
      branchId: 'b2',
      sortBy: 'branchStock',
      sortDir: 'desc',
    });
    expect(byBranchStock.map(p => p.identity.productId)).toEqual(['p1', 'p2']);
  });
});
