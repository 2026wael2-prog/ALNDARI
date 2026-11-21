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
});
