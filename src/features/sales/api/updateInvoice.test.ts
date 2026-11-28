import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoicesApi } from './invoicesApi';
import { supabase } from '@/lib/supabaseClient';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('invoicesApi.updateInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws error if paymentMethod is credit but partyId is missing', async () => {
    await expect(
      invoicesApi.updateInvoice({
        invoiceId: 'inv-123',
        partyId: null,
        paymentMethod: 'credit',
        items: [{ productId: 'prod-1', quantity: 2, unitPrice: 100 }],
      })
    ).rejects.toThrow('يجب اختيار العميل للفاتورة الآجلة');
  });

  it('calls update_sales_invoice_v2 RPC with mapped payload and returns response', async () => {
    const mockResponse = {
      success: true,
      invoice_id: 'inv-123',
      invoice_number: 'INV-2026-0001',
      total_amount: 230,
      status: 'paid',
    };

    (supabase.rpc as any).mockResolvedValue({
      data: mockResponse,
      error: null,
    });

    const result = await invoicesApi.updateInvoice({
      invoiceId: 'inv-123',
      partyId: 'party-456',
      paymentMethod: 'cash',
      issueDate: '2026-11-21',
      items: [
        {
          productId: 'prod-1',
          quantity: 2,
          unitPrice: 100,
          discount: 10,
          taxRate: 15,
          warehouseId: 'wh-1',
        },
      ],
      treasuryAccountId: 'cashbox-1',
      notes: 'تعديل السعر والكمية',
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      'update_sales_invoice_v2',
      expect.objectContaining({
        p_invoice_id: 'inv-123',
        p_party_id: 'party-456',
        p_payment_type: 'cash',
        p_invoice_date: '2026-11-21',
        p_items: [
          {
            product_id: 'prod-1',
            quantity: 2,
            unit_price: 100,
            tax_rate: 15,
            warehouse_id: 'wh-1',
            discount_amount: 10,
          },
        ],
        p_notes: 'تعديل السعر والكمية',
        p_payment_account_id: 'cashbox-1',
      })
    );

    expect(result).toEqual(mockResponse);
  });

  it('calls merge_sales_invoices_v1 with the expected payload', async () => {
    const mockMergeResponse = {
      merged_invoice_id: 'inv-merged-1',
      merged_invoice_number: 'INV-9001',
      source_invoice_ids: ['inv-1', 'inv-2'],
    };

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: mockMergeResponse,
      error: null,
    } as any);

    const result = await invoicesApi.mergeInvoices({
      invoiceIds: ['inv-1', 'inv-2'],
      targetCurrency: 'YER',
      exchangeRate: 140,
      targetDate: '2026-11-28',
      notes: 'دمج فواتير العميل',
      combineDuplicateProducts: true,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('merge_sales_invoices_v1', {
      p_invoice_ids: ['inv-1', 'inv-2'],
      p_target_currency: 'YER',
      p_exchange_rate: 140,
      p_target_date: '2026-11-28',
      p_notes: 'دمج فواتير العميل',
      p_combine_duplicate_products: true,
    });
    expect(result).toEqual(mockMergeResponse);
  });

  it('calls bulk_convert_sales_invoices_currency_v1 with the expected payload', async () => {
    const mockBulkResponse = {
      converted_count: 2,
      target_currency: 'SAR',
    };

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: mockBulkResponse,
      error: null,
    } as any);

    const result = await invoicesApi.bulkConvertInvoicesCurrency({
      invoiceIds: ['inv-10', 'inv-11'],
      targetCurrency: 'SAR',
      exchangeRate: 1,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('bulk_convert_sales_invoices_currency_v1', {
      p_invoice_ids: ['inv-10', 'inv-11'],
      p_target_currency: 'SAR',
      p_exchange_rate: 1,
    });
    expect(result).toEqual(mockBulkResponse);
  });
});
