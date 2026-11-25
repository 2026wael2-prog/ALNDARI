import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BranchTransferHeaderBar } from './BranchTransferHeaderBar';
import { RelatedProductsPanel } from './RelatedProductsPanel';
import { analyzeAutomotiveQuery } from '../../../ai/automotiveCrossSell';
import type { Product } from '../../../inventory/types';

const nowIso = new Date().toISOString();
const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const mockTransferRequests = [
  // Today + pending -> MUST appear
  {
    id: 'req-today-pending',
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
    created_at: nowIso,
    updated_at: nowIso,
  },
  // Today + approved -> MUST disappear
  {
    id: 'req-today-approved',
    batch_id: null,
    company_id: 'c-1',
    requester_branch_id: 'branch-2',
    requester_branch_name: 'فرع غمدان',
    source_branch_id: 'branch-1',
    source_branch_name: 'فرع وائل',
    product_id: 'p-2',
    product_name: 'منتج معتمد يجب أن يختفي',
    product_sku: 'SKU-2',
    product_part_number: '11111',
    product_brand: 'Toyota',
    requested_quantity: 1,
    status: 'approved' as const,
    created_at: nowIso,
    updated_at: nowIso,
  },
  // Today + rejected -> MUST disappear
  {
    id: 'req-today-rejected',
    batch_id: null,
    company_id: 'c-1',
    requester_branch_id: 'branch-2',
    requester_branch_name: 'فرع غمدان',
    source_branch_id: 'branch-1',
    source_branch_name: 'فرع وائل',
    product_id: 'p-3',
    product_name: 'منتج مرفوض يجب أن يختفي',
    product_sku: 'SKU-3',
    product_part_number: '22222',
    product_brand: 'Toyota',
    requested_quantity: 1,
    status: 'rejected' as const,
    created_at: nowIso,
    updated_at: nowIso,
  },
  // Yesterday + pending -> MUST disappear (historical)
  {
    id: 'req-yesterday-pending',
    batch_id: null,
    company_id: 'c-1',
    requester_branch_id: 'branch-2',
    requester_branch_name: 'فرع غمدان',
    source_branch_id: 'branch-1',
    source_branch_name: 'فرع وائل',
    product_id: 'p-4',
    product_name: 'منتج قديم من أمس',
    product_sku: 'SKU-4',
    product_part_number: '33333',
    product_brand: 'Toyota',
    requested_quantity: 1,
    status: 'pending' as const,
    created_at: yesterdayIso,
    updated_at: yesterdayIso,
  },
];

const mockRefetch = vi.fn();
const mockRespond = vi.fn();
const mockShowToast = vi.fn();

vi.mock('../../../inventory/hooks/useStockTransferRequests', () => ({
  useStockTransferRequests: () => ({
    data: mockTransferRequests,
    isLoading: false,
    isFetching: false,
    refetch: mockRefetch,
  }),
  useRespondToTransferRequest: () => ({
    mutate: mockRespond,
    isPending: false,
  }),
}));

vi.mock('../../../feedback/store', () => ({
  useFeedbackStore: () => ({
    showToast: mockShowToast,
  }),
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
  created_at: nowIso,
};

describe('ProductSelectionModal Enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('BranchTransferHeaderBar shows ONLY today active pending requests and hides historical/approved/rejected ones', () => {
    const onOpenNewRequest = vi.fn();
    const onReviewIncoming = vi.fn();
    const onCloseModal = vi.fn();

    render(
      <BranchTransferHeaderBar
        activeBranchId="branch-1"
        totalProductsCount={42}
        onOpenNewRequest={onOpenNewRequest}
        onReviewIncoming={onReviewIncoming}
        onCloseModal={onCloseModal}
      />
    );

    expect(screen.getByText('مستكشف الأصناف')).toBeTruthy();
    expect(screen.getByText('طلبات اليوم الواردة:')).toBeTruthy();

    // Expand floating overlay drawer
    fireEvent.click(screen.getByRole('button', { name: /توسيع شريط طلبات الفروع/i }));

    // Only today's pending request is shown
    expect(screen.getByText('راس عكس هايلوكس')).toBeTruthy();
    expect(screen.queryByText('منتج معتمد يجب أن يختفي')).toBeNull();
    expect(screen.queryByText('منتج مرفوض يجب أن يختفي')).toBeNull();
    expect(screen.queryByText('منتج قديم من أمس')).toBeNull();

    // Trigger review modal
    fireEvent.click(screen.getByText('مراجعة واعتماد / رفض'));
    expect(onReviewIncoming).toHaveBeenCalledWith([mockTransferRequests[0]]);

    // Trigger new request & close
    fireEvent.click(screen.getByText('طلب من فرع'));
    expect(onOpenNewRequest).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'إغلاق مستكشف الأصناف' }));
    expect(onCloseModal).toHaveBeenCalledTimes(1);
  });

  it('RelatedProductsPanel renders compact companion pill, Google link, branch request, and add action', () => {
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
    expect(screen.getByText('هايلوكس')).toBeTruthy();
    expect(screen.getByText('ربلة عكس خارجي هايلوكس')).toBeTruthy();

    fireEvent.click(screen.getByText('ربلة عكس خارجي هايلوكس'));
    expect(onSelectProduct).toHaveBeenCalledWith(sampleCompanionProduct);

    fireEvent.click(screen.getByTitle('طلب هذه القطعة من فرع آخر'));
    expect(onRequestFromBranch).toHaveBeenCalledWith(sampleCompanionProduct);

    const googleLink = screen.getByTitle('البحث عن القطعة في جوجل');
    expect(googleLink.getAttribute('href')).toContain('https://www.google.com/search?q=');
  });
});
