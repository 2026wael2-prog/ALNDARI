import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UniversalEntityInspectorModal } from './UniversalEntityInspectorModal';
import { useEntityInspectorStore } from '../store';
import type { InspectedEntityData } from '../types';
import type { Product, ProductFormData } from '../../inventory/types';

const mockSaveProduct = vi.fn();
const mockFetchInspectedEntity = vi.fn();
let mockAuthUser: { id: string; company_id: string; role: string } | null = {
  id: 'u-1',
  company_id: 'c-1',
  role: 'admin',
};

vi.mock('../../auth/store', () => ({
  useAuthStore: (selector?: (s: { user: typeof mockAuthUser }) => unknown) =>
    selector ? selector({ user: mockAuthUser }) : { user: mockAuthUser },
}));

vi.mock('../../branches/store', () => ({
  useBranchFilterStore: (selector?: (s: { activeBranchId: string | null }) => unknown) =>
    selector ? selector({ activeBranchId: null }) : { activeBranchId: null },
}));

vi.mock('../service', () => ({
  fetchInspectedEntity: (...args: unknown[]) => mockFetchInspectedEntity(...args),
}));

vi.mock('../../inventory/hooks/useProducts', () => ({
  useProductMutations: () => ({
    saveProduct: mockSaveProduct,
    isSaving: false,
    deleteProduct: vi.fn(),
    bulkDeleteProducts: vi.fn(),
    toggleCoreProduct: vi.fn(),
    isDeleting: false,
  }),
}));

vi.mock('../../returns/components/AdvancedReturnModal', () => ({
  AdvancedReturnModal: () => null,
}));

vi.mock('../../inventory/components/AddProductModal', () => ({
  default: ({
    isOpen,
    initialData,
    onSubmit,
    onClose,
  }: {
    isOpen: boolean;
    initialData?: Product | null;
    onSubmit: (data: ProductFormData) => Promise<void>;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="mock-add-product-modal">
        <span data-testid="edit-product-name">{initialData?.name}</span>
        <button
          type="button"
          onClick={() =>
            void onSubmit({
              name: 'فلتر زيت أصلي محدّث',
              selling_price: 95,
              cost_price: 55,
            })
          }
        >
          حفظ التعديل التجريبي
        </button>
        <button type="button" onClick={onClose}>
          إغلاق التعديل
        </button>
      </div>
    ) : null,
}));

const sampleProduct: Product = {
  id: 'prod-123',
  company_id: 'c-1',
  name: 'فلتر زيت تويوتا',
  name_ar: 'فلتر زيت تويوتا',
  sku: 'SKU-100',
  part_number: '90915-YZZE1',
  alternative_numbers: null,
  brand: 'Toyota',
  category: 'فلاتر',
  category_id: 'cat-1',
  size: null,
  specifications: 'أصلي وكالة',
  cost_price: 45,
  purchase_price: 45,
  sale_price: 80,
  selling_price: 80,
  stock_quantity: 12,
  min_stock_level: 3,
  unit: 'piece',
  created_at: '2026-11-01',
};

const sampleInspectedProduct: InspectedEntityData = {
  type: 'product',
  title: 'فلتر زيت تويوتا',
  subtitle: 'Toyota • فلاتر',
  code: 'SKU-100',
  kpis: [{ label: 'الرصيد المتوفر حالياً', value: '12 قطعة', tone: 'emerald' }],
  fields: [{ section: 'الهوية والتعريف', label: 'اسم الصنف', value: 'فلتر زيت تويوتا' }],
  sheets: [],
  product: sampleProduct,
};

const renderModal = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UniversalEntityInspectorModal />
    </QueryClientProvider>
  );
};

describe('UniversalEntityInspectorModal — product editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser = { id: 'u-1', company_id: 'c-1', role: 'admin' };
    mockFetchInspectedEntity.mockResolvedValue(sampleInspectedProduct);
    mockSaveProduct.mockResolvedValue({ id: 'prod-123' });
    useEntityInspectorStore.getState().open({
      type: 'product',
      id: 'prod-123',
      label: 'فلتر زيت تويوتا',
    });
  });

  it('shows edit product button, opens AddProductModal with initialData, saves, and refetches', async () => {
    renderModal();

    const editButtons = await screen.findAllByRole('button', { name: /تعديل المنتج/i });
    expect(editButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(editButtons[0]);

    const editModal = await screen.findByTestId('mock-add-product-modal');
    expect(editModal).toBeTruthy();
    expect(screen.getByTestId('edit-product-name').textContent).toBe('فلتر زيت تويوتا');

    fireEvent.click(screen.getByRole('button', { name: 'حفظ التعديل التجريبي' }));

    await waitFor(() => {
      expect(mockSaveProduct).toHaveBeenCalledWith({
        id: 'prod-123',
        data: {
          name: 'فلتر زيت أصلي محدّث',
          selling_price: 95,
          cost_price: 55,
        },
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('mock-add-product-modal')).toBeNull();
    });
    expect(mockFetchInspectedEntity.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('hides edit product button for restricted roles (cashier / viewer)', async () => {
    mockAuthUser = { id: 'u-2', company_id: 'c-1', role: 'cashier' };
    renderModal();

    await screen.findByText('الرصيد المتوفر حالياً');
    expect(screen.queryByRole('button', { name: /تعديل المنتج/i })).toBeNull();
  });
});
