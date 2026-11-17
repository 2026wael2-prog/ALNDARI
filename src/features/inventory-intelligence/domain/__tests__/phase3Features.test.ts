import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_CONFIG, type InventoryIntelligenceSnapshot } from '../../types';
import { runIntelligenceEngine } from '../intelligenceEngine';
import { buildExecutiveStudyWorkbook } from '../../utils/intelligenceExcelExporter';
import {
  buildExecutiveDigestMessage,
  buildPurchaseOrderShareMessage,
} from '../../utils/intelligenceMessageFormatter';
import {
  DEFAULT_INTELLIGENCE_FILTERS,
  filterAndSortProducts,
} from '../sorting/intelligenceSortAndFilter';

function makeRichSnapshot(): InventoryIntelligenceSnapshot {
  return {
    generated_at: '2026-11-17T00:00:00Z',
    branches: [
      { id: 'b1', name: 'الفرع الرئيسي', code: 'B1', is_main: true, warehouses: [] },
      { id: 'b2', name: 'فرع غمدان', code: 'B2', is_main: false, warehouses: [] },
    ],
    products: [
      {
        id: 'p1',
        name_ar: 'فلتر هواء مقاس 20mm',
        sku: 'SKU-1',
        part_number: 'PN-1',
        alternative_numbers: null,
        brand: 'Toyota',
        item_type: 'spare_part',
        min_stock_level: 5,
        cost_price: 25,
        purchase_price: 25,
        sale_price: 40,
        category_id: null,
        category_name: 'فلاتر',
        stock_by_warehouse: [
          { warehouse_id: 'w1', branch_id: 'b1', quantity: 1, weighted_avg_cost: 25 },
          { warehouse_id: 'w2', branch_id: 'b2', quantity: 0, weighted_avg_cost: 25 },
        ],
      },
    ],
    sales_history: [
      {
        product_id: 'p1',
        branch_id: 'b1',
        net_qty_365: 120,
        net_qty_180: 70,
        net_qty_90: 45,
        net_qty_30: 20,
        net_qty_7: 5,
        net_revenue_365: 4800,
        net_cogs_365: 3000,
        sale_tx_count: 25,
        demand_days_count: 22,
        returned_qty: 0,
        last_sale_date: '2026-11-15',
        first_sale_date: '2025-12-01',
      },
    ],
    monthly_sales: [],
    supplier_history: [
      {
        product_id: 'p1',
        supplier_id: 'sup1',
        supplier_name: 'مورد السلام',
        purchase_tx_count: 4,
        total_qty_supplied: 100,
        avg_unit_price: 25,
        last_unit_price: 25,
        last_qty: 30,
        last_purchase_date: '2026-10-15',
      },
    ],
    customer_demand: [
      {
        product_id: 'p1',
        branch_id: 'b1',
        customer_id: 'c1',
        customer_name: 'ورشة النجم',
        qty_365d: 35,
        revenue_365d: 1400,
        tx_count: 7,
        last_order_date: '2026-11-15',
      },
    ],
    open_pos: [],
    cross_references: [],
  };
}

describe('Phase 3 exports, digests, and combined 6-dimension filtering', () => {
  it('builds a 5-sheet RTL Excel workbook with all study sheets', async () => {
    const output = runIntelligenceEngine(makeRichSnapshot(), DEFAULT_ENGINE_CONFIG);
    const { wb, fileName } = await buildExecutiveStudyWorkbook(output);

    expect(fileName).toMatch(/\.xlsx$/);
    expect(wb.Workbook?.Views?.[0]?.RTL).toBe(true);
    expect(wb.SheetNames).toEqual([
      'الملخص التنفيذي',
      'توصيات الشراء',
      'التحويلات الداخلية',
      'الراكد والفائض',
      'تحليل الفروع والتنبؤ',
    ]);
  });

  it('formats Telegram/WhatsApp executive and purchase digests cleanly', () => {
    const output = runIntelligenceEngine(makeRichSnapshot(), DEFAULT_ENGINE_CONFIG);

    const execMsg = buildExecutiveDigestMessage(output, 'executive');
    expect(execMsg).toContain('الملخص التنفيذي لذكاء المخزون');
    expect(execMsg).toContain('فلتر هواء مقاس 20mm');

    const poRec = output.purchaseRecommendations[0];
    expect(poRec).toBeDefined();
    const poMsg = buildPurchaseOrderShareMessage(poRec);
    expect(poMsg).toContain('طلب تسعير / شراء مقترح');
    expect(poMsg).toContain('مورد السلام');
  });

  it('filters accurately when all 6 dimensions are combined', () => {
    const output = runIntelligenceEngine(makeRichSnapshot(), DEFAULT_ENGINE_CONFIG);
    const matched = filterAndSortProducts(output.products, {
      ...DEFAULT_INTELLIGENCE_FILTERS,
      search: 'فلتر',
      partType: 'فلتر',
      size: '20mm',
      supplierId: 'sup1',
      customerId: 'c1',
      branchId: 'b1',
      sortBy: 'branchDemand',
      sortDir: 'desc',
    });
    expect(matched).toHaveLength(1);
    expect(matched[0].topCustomers[0]?.txCount).toBe(7);

    // Mismatched branch for customer c1 excludes the row
    const wrongBranch = filterAndSortProducts(output.products, {
      ...DEFAULT_INTELLIGENCE_FILTERS,
      customerId: 'c1',
      branchId: 'b2',
    });
    expect(wrongBranch).toHaveLength(0);
  });
});
