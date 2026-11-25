import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BranchTransferHeaderBar } from './BranchTransferHeaderBar';
import { RelatedProductsPanel } from './RelatedProductsPanel';
import { analyzeAutomotiveQuery } from '../../../ai/automotiveCrossSell';
import type { Product } from '../../../inventory/types';

const mockTransferRequests = [
  {
    id: 'req-1',
    batch_id: 'batch-1',
    company_id: 'c-1',
    requester_branch_id: 'branch-2',
    requester_branch_name: 'فرع غمدان',
    source_branch_id: 'branch-1',
    source_branch_name: 'فرع وائل',
    product_id: 'p-1',
    product_name: 'راس عكس هايلوكس',
    product_sku: 'SKU-1',
    product_part_number: '43460-09A36',
    product_brand: 'Toyota',
    requested_quantity: 2,
    status: 'pending' as const,
    created_at: '2026-11-25T12:00:00Z',
    updated_at: '2026-11-25T12:00:00Z',
  },
];

const mockRefetch = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../../../inventory/hooks/useStockTransferRequests', () => ({
  useStockTransferRequests: () => ({
    data: mockTransferRequests,
    isLoading: false,
    isFetching: false,
    refetch: mockRefetch,
  }),
}));

vi.mock('../../../feedback/store', () => ({
  useFeedbackStore: () => ({
    showToast: mockShowToast,
  }),
}));

vi.mock('../../../entity-inspector', () => ({
  EntityInfoDot: () => <span data-testid="entity-dot" />,
}));

const sampleCompanionProduct: Product = {
  id: 'prod-boot-1',
  company_id: 'c-1',
  name: 'ربلة عكس خارجي هايلوكس',
  name_ar: 'ربلة عكس خارجي هايلوكس',
  name_en: null,
  sku: 'SKU-BOOT-1',
  part_number: '04438-0K020',
  alternative_numbers: null,
  brand: 'Toyota',
  category: null,
  category_id: null,
  item_type: 'stock',
  size: null,
  specifications: null,
  cost_price: 25,
  purchase_price: 25,
  sale_price: 45,
  selling_price: 45,
  stock_quantity: 8,
  min_stock_level: 2,
  unit: 'piece',
  barcode: null,
  image_url: null,
  is_core: false,
  created_at: '2026-11-25T00:00:00Z',
};

describe('ProductSelectionModal Enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('BranchTransferHeaderBar displays incoming pending requests and triggers review modal', () => {
    const onOpenNewRequest = vi.fn();
    const onReviewIncoming = vi.fn();

    render(
      <BranchTransferHeaderBar
        activeBranchId="branch-1"
        onOpenNewRequest={onOpenNewRequest}
        onReviewIncoming={onReviewIncoming}
      />
    );

    expect(screen.getByText('طلبات الفروع')).toBeTruthy();
    expect(screen.getByText('واردة قيد الانتظار:')).toBeTruthy();

    // Expand the showcase drawer
    fireEvent.click(screen.getByRole('button', { name: /توسيع شريط طلبات الفروع/i }));
    expect(screen.getByText('مراجعة واعتماد')).toBeTruthy();

    fireEvent.click(screen.getByText('مراجعة واعتماد'));
    expect(onReviewIncoming).toHaveBeenCalledWith([mockTransferRequests[0]]);

    fireEvent.click(screen.getByText('طلب من فرع'));
    expect(onOpenNewRequest).toHaveBeenCalledTimes(1);
  });

  it('RelatedProductsPanel renders companion system chips, Google link, branch request, and add button', () => {
    const onSelectProduct = vi.fn();
    const onRequestFromBranch = vi.fn();
    const onSearchChipClick = vi.fn();
    const relation = analyzeAutomotiveQuery('راس عكس هايلوكس');

    render(
      <RelatedProductsPanel
        relation={relation}
        relatedProducts={[sampleCompanionProduct]}
        isLoading={false}
        mode="sale"
        onSelectProduct={onSelectProduct}
        onRequestFromBranch={onRequestFromBranch}
        onSearchChipClick={onSearchChipClick}
      />
    );

    expect(screen.getByText('منظومة العكوس والدفع')).toBeTruthy();
    expect(screen.getByText('المركبة: هايلوكس')).toBeTruthy();
    expect(screen.getByText('ربلة عكس خارجي هايلوكس')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /إضافة/i }));
    expect(onSelectProduct).toHaveBeenCalledWith(sampleCompanionProduct);

    fireEvent.click(screen.getByTitle('طلب هذه القطعة من فرع آخر'));
    expect(onRequestFromBranch).toHaveBeenCalledWith(sampleCompanionProduct);

    const googleLink = screen.getByTitle('البحث عن القطعة في جوجل');
    expect(googleLink.getAttribute('href')).toContain('https://www.google.com/search?q=');
  });
});
