import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  formatCompactBranchLabel,
  summarizeProductBranchAvailability,
} from '../../utils/branchStockSummary';
import { BranchStockAvailabilityCell } from './BranchStockAvailabilityCell';
import type { Product } from '../../types';

const makeProduct = (
  distribution: Product['warehouse_distribution'],
  stock_quantity = 0
): Product =>
  ({
    id: 'p-1',
    company_id: 'c-1',
    name: 'فلتر زيت أصلي',
    name_ar: 'فلتر زيت أصلي',
    sku: 'SKU-1',
    part_number: '90915-YZZD2',
    brand: 'Toyota',
    category: 'فلاتر',
    cost_price: 20,
    sale_price: 35,
    selling_price: 35,
    stock_quantity,
    min_stock_level: 2,
    is_core: false,
    unit: 'pcs',
    created_at: '2026-01-01',
    warehouse_distribution: distribution,
  }) as unknown as Product;

describe('branchStockSummary & BranchStockAvailabilityCell', () => {
  it('shortens Arabic branch names cleanly for narrow table cells', () => {
    expect(formatCompactBranchLabel('فرع وائل النظاري')).toBe('وائل');
    expect(formatCompactBranchLabel('فرع غمدان النظاري')).toBe('غمدان');
    expect(formatCompactBranchLabel('فرع محمد النظاري')).toBe('محمد');
    expect(formatCompactBranchLabel(null, 'المستودع الرئيسي')).toBe('المستودع');
  });

  it('orders active branch first and detects stock available only in other branches', () => {
    const product = makeProduct(
      [
        {
          warehouse_id: 'w1',
          warehouse_name: 'المستودع الرئيسي',
          branch_id: 'b-wael',
          branch_name: 'فرع وائل النظاري',
          quantity: 12,
        },
        {
          warehouse_id: 'w2',
          warehouse_name: 'مستودع غمدان',
          branch_id: 'b-ghamdan',
          branch_name: 'فرع غمدان النظاري',
          quantity: 0,
        },
        {
          warehouse_id: 'w3',
          warehouse_name: 'مستودع محمد',
          branch_id: 'b-mohammed',
          branch_name: 'فرع محمد النظاري',
          quantity: 4,
        },
      ],
      0
    );

    const summary = summarizeProductBranchAvailability(product, 'b-ghamdan');
    expect(summary.currentBranchQty).toBe(0);
    expect(summary.otherBranchesQty).toBe(16);
    expect(summary.totalQty).toBe(16);
    expect(summary.availableOnlyInOtherBranches).toBe(true);
    expect(summary.allBranches[0].branchId).toBe('b-ghamdan');
    expect(summary.stockedBranches.map(b => b.shortLabel)).toEqual(['وائل', 'محمد']);
  });

  it('renders compact pills with +N overflow and opens portal breakdown popover on click', () => {
    const product = makeProduct(
      [
        {
          warehouse_id: 'w1',
          warehouse_name: 'المستودع الرئيسي',
          branch_id: 'b-wael',
          branch_name: 'فرع وائل النظاري',
          location: 'رف A3',
          quantity: 10,
        },
        {
          warehouse_id: 'w2',
          warehouse_name: 'مستودع غمدان',
          branch_id: 'b-ghamdan',
          branch_name: 'فرع غمدان النظاري',
          quantity: 5,
        },
        {
          warehouse_id: 'w3',
          warehouse_name: 'مستودع محمد',
          branch_id: 'b-mohammed',
          branch_name: 'فرع محمد النظاري',
          quantity: 3,
        },
      ],
      5
    );

    render(
      <BranchStockAvailabilityCell
        product={product}
        activeBranchId="b-ghamdan"
        maxVisiblePills={2}
      />
    );

    // Compact cell shows active branch + top peer + "+1" overflow
    expect(screen.getByText('غمدان')).toBeInTheDocument();
    expect(screen.getByText('وائل')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();

    // Click opens portal breakdown with all 3 branches and total 18
    fireEvent.click(screen.getByRole('button', { name: /توفر المنتج/ }));
    expect(screen.getByText('التوفر عبر الفروع والمستودعات')).toBeInTheDocument();
    expect(screen.getByText('فرع وائل النظاري')).toBeInTheDocument();
    expect(screen.getByText('فرع غمدان النظاري')).toBeInTheDocument();
    expect(screen.getByText('فرع محمد النظاري')).toBeInTheDocument();
    expect(screen.getByText('رف A3')).toBeInTheDocument();
  });
});
