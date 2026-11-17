/**
 * Sales Quotations API
 * Handles CRUD operations for sales quotations
 */
import { supabase } from '../../../lib/supabaseClient';
import type { CreateQuotationDTO } from '../types/quotation';
import { broadcastCrossBranchActivity } from '@/features/branches/api';

// DB row types
interface QuotationRow {
  id: string;
  quotation_number: string;
  type: string;
  status: string;
  party_id: string | null;
  issue_date: string;
  valid_until: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  currency_code: string;
  exchange_rate: number;
  notes: string | null;
  terms_and_conditions: string | null;
  delivery_terms: string | null;
  payment_terms: string | null;
  converted_invoice_id: string | null;
  converted_at: string | null;
  created_by: string | null;
  created_at: string;
  party: { name: string } | null;
  quotation_items: Array<{ id: string }>;
}

export interface QuotationDetailItem {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  total: number;
  notes: string | null;
  sort_order: number;
  product: {
    name_ar: string;
    sku: string;
    part_number: string | null;
    brand?: string | null;
    cost_price?: number | null;
  } | null;
}

export interface QuotationDetailRow extends Omit<QuotationRow, 'party' | 'quotation_items'> {
  party: { id: string; name: string; phone: string | null; email: string | null } | null;
  quotation_items: QuotationDetailItem[];
}

export const salesQuotationsApi = {
  /**
   * Get all sales quotations
   */
  getQuotations: async (companyId: string, branchId?: string | null) => {
    let query = supabase
      .from('quotations')
      .select(
        `
        id,
        quotation_number,
        type,
        status,
        party_id,
        issue_date,
        valid_until,
        total_amount,
        currency_code,
        created_at,
        party:parties(name),
        quotation_items(id)
      `
      )
      .eq('company_id', companyId)
      .eq('type', 'sales')
      .is('deleted_at', null)
      .order('created_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;
    return { data: data as QuotationRow[] | null, error };
  },

  /**
   * Get quotation details with items
   */
  getQuotationDetails: async (quotationId: string) => {
    const { data, error } = await supabase
      .from('quotations')
      .select(
        `
        *,
        party:parties(id, name, phone, email),
        quotation_items(
          *,
          product:products(name_ar, sku, part_number)
        )
      `
      )
      .eq('id', quotationId)
      .single();

    return { data: data as QuotationDetailRow | null, error };
  },

  /**
   * Create a new sales quotation — single atomic RPC (totals & numbering computed in PostgreSQL).
   */
  createQuotation: async (companyId: string, userId: string, dto: CreateQuotationDTO) => {
    if (!dto.items || dto.items.length === 0) {
      throw new Error('لا يمكن حفظ عرض سعر بدون أصناف — أضف صنفاً واحداً على الأقل');
    }

    const rpcItems = dto.items.map(item => ({
      product_id: item.productId !== '' ? item.productId : null,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount_percent: item.discountPercent ?? 0,
    }));

    const { data, error } = await (supabase.rpc as Function)('create_quotation', {
      p_company_id: companyId,
      p_party_id: dto.partyId,
      p_issue_date: dto.issueDate,
      p_valid_until: dto.validUntil ?? null,
      p_discount_amount: dto.discountAmount ?? 0,
      p_currency_code: dto.currencyCode ?? 'SAR',
      p_exchange_rate: dto.exchangeRate ?? 1,
      p_notes: dto.notes ?? null,
      p_terms_and_conditions: dto.termsAndConditions ?? null,
      p_delivery_terms: dto.deliveryTerms ?? null,
      p_payment_terms: dto.paymentTerms ?? null,
      p_branch_id: dto.branchId ?? null,
      p_items: rpcItems,
      p_idempotency_key: crypto.randomUUID(),
    });

    if (error) throw error;

    const quotation = data as { id: string; quotation_number: string; total_amount?: number };

    void broadcastCrossBranchActivity(companyId, {
      id: quotation.id,
      company_id: companyId,
      branch_id: dto.branchId ?? null,
      type: 'quotation_created',
      title: 'عرض أسعار جديد',
      message: `تم إصدار عرض أسعار جديد ${quotation.quotation_number ? `رقم ${quotation.quotation_number}` : ''}`,
      amount: quotation.total_amount ?? 0,
      currency_code: dto.currencyCode || 'SAR',
      document_number: quotation.quotation_number,
      link: '/sales',
      created_by: userId,
    });

    return quotation;
  },

  /**
   * Update quotation status
   */
  updateStatus: async (quotationId: string, status: string) => {
    return await supabase.from('quotations').update({ status }).eq('id', quotationId);
  },

  /**
   * Convert quotation to invoice (marks it as converted)
   */
  markAsConverted: async (quotationId: string, invoiceId?: string) => {
    return await supabase
      .from('quotations')
      .update({
        status: 'converted',
        converted_invoice_id: invoiceId || null,
        converted_at: new Date().toISOString(),
      })
      .eq('id', quotationId);
  },

  /**
   * Soft delete a quotation
   */
  deleteQuotation: async (quotationId: string) => {
    return await supabase
      .from('quotations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', quotationId);
  },
};
