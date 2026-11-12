import { supabase } from '@/lib/supabaseClient';
import { parseError } from '@/core/utils/errorUtils';
import { formatLocalDate } from '@/core/utils/dateUtils';
import { toBaseCurrency } from '@/core/utils/currencyUtils';
import type { CreateInvoicePayload, InvoiceResponse } from '../types';
import { logger } from '@/core/utils/logger';
import type { Invoice, Party } from '@/core/types/supabase-helpers';
import { salesQuotationsApi } from './quotationsApi';
import type { MatchedInvoiceItem, SearchInvoiceResultRow } from '@/core/types/invoiceSearch';
import { optArg } from '@/core/utils/rpcArgs';
import { resolveSaleInvoiceDueDate } from '../utils/dueDate';
import { broadcastCrossBranchActivity } from '@/features/branches/api';
import {
  batchLookupParties,
  batchLookupProducts,
  computePreviousDateRange,
} from '@/core/utils/dataFetching';

// Re-export quotations API
export { salesQuotationsApi };

/**
 * هل الفشل بسبب غياب الدالة نفسها (بيئة قديمة لم تُطبَّق عليها الهجرة)؟
 *
 * PGRST202 = PostgREST لم يجد الدالة في ذاكنة المخطط، 42883 = undefined_function.
 * أي خطأ آخر (مهلة، 57014، تعارض، 23505…) لا يُعدّ دليلاً على أن العملية لم تحدث،
 * لذا لا يجوز سلوك مسار احتياطي مكافئ لها — راجع تعليق catch في commitReturnRPC.
 */
const isMissingFunctionError = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) return false;
  const record = err as { code?: unknown; message?: unknown };
  if (record.code === 'PGRST202' || record.code === '42883') return true;
  return (
    typeof record.message === 'string' &&
    /could not find the function|function .+ does not exist|schema cache/i.test(record.message)
  );
};

// Define types for invoice with relations
type InvoiceWithParty = Invoice & {
  party: Pick<Party, 'name'>;
  invoice_items: Array<{ id: string }>;
};

export interface InvoiceDetailItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  returned_at: string | null;
  name?: string;
  price?: number;
  product: {
    name_ar: string;
    sku: string;
    cost_price?: number;
    part_number?: string;
    brand?: string;
  };
}

export type InvoiceWithDetails = Invoice & {
  parties: Party;
  payment_allocations: Array<{
    payments: { amount: number; created_at: string; payment_method: string };
  }>;
  invoice_items: InvoiceDetailItem[];
};

export interface InvoiceNavSummary {
  id: string;
  invoice_number: string;
  created_at: string;
  issue_date: string;
  total_amount: number;
  currency_code: string;
  party_name?: string | null;
}

export const salesApi = {
  getInvoices: async (companyId: string, page = 0, limit = 150, branchId?: string | null) => {
    const from = page * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('invoices')
      .select(
        `
        id,
        invoice_number,
        issue_date,
        created_at,
        total_amount,
        total_document_amount,
        subtotal_document_amount,
        status,
        type,
        payment_method,
        currency_code,
        exchange_rate,
        party:party_id(name, phone),
        invoice_items(
          id,
          product_id,
          description,
          quantity,
          unit_price,
          total,
          cost_price,
          product:products!fk_invoice_items_company_product(id, name_ar, sku, part_number, brand)
        ),
        reference_invoice_id
      `
      )
      .eq('company_id', companyId)
      .eq('type', 'sale')
      .neq('status', 'void')
      .is('deleted_at', null)
      // ترتيب الأحدث أولاً: حسب تاريخ الإصدار ثم وقت الإنشاء ثم المعرف لمنع التكرار
      .order('issue_date', { ascending: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;
    if (error) throw parseError(error);
    return data as unknown as InvoiceWithParty[];
  },

  searchInvoicesAdvanced: async (
    companyId: string,
    params: {
      type?: string | undefined;
      query?: string | undefined;
      dateFrom?: string | undefined;
      dateTo?: string | undefined;
      status?: string | undefined;
      paymentMethod?: string | undefined;
      branchId?: string | null | undefined;
      limit?: number | undefined;
      offset?: number | undefined;
    }
  ): Promise<SearchInvoiceResultRow[]> => {
    if (!companyId) return [];
    const { data, error } = await supabase.rpc('search_invoices_advanced', {
      p_company_id: companyId,
      p_type: params.type ?? 'sale',
      ...optArg('p_query', params.query?.trim() || null),
      ...optArg('p_date_from', params.dateFrom),
      ...optArg('p_date_to', params.dateTo),
      ...optArg('p_status', params.status),
      ...optArg('p_payment_method', params.paymentMethod),
      ...optArg('p_branch_id', params.branchId),
      p_limit: params.limit ?? 500,
      p_offset: params.offset ?? 0,
    });

    if (error) throw parseError(error);
    // `matched_items` is a jsonb column on the RPC contract; the API layer
    // exposes it as the typed MatchedInvoiceItem[] the search views consume.
    return (data ?? []).map(row => ({
      ...row,
      matched_items: row.matched_items as unknown as MatchedInvoiceItem[],
    }));
  },

  commitInvoiceRPC: async (
    companyId: string,
    userId: string,
    payload: CreateInvoicePayload
  ): Promise<InvoiceResponse> => {
    if (payload.paymentMethod === 'credit' && !payload.partyId) {
      throw new Error('يجب اختيار العميل للفاتورة الآجلة');
    }

    // Idempotency: prefer the caller-provided key, which is stable per user
    // intent (form session). Double-clicks, network retries and offline-queue
    // replays all reuse the SAME key, so the DB UNIQUE(company_id, idempotency_key)
    // constraint rejects duplicates. The fallback only covers legacy callers
    // that do not pass a key.
    const idempotencyKey =
      payload.idempotencyKey ??
      `${companyId}_${Date.now()}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

    const rpcParams = {
      // كما في admin_assign_company_plan: المعامل بلا DEFAULT فيجب أن يبقى حاضراً،
      // لكن NULL مشروع (بيع نقدي لعميل نقدي بلا طرف مسجَّل). النوع المولَّد لا يستطيع
      // التعبير عن «إلزامي الحضور ويقبل NULL»، فيُقيَّد النوع صراحةً هنا فقط.
      p_party_id: (payload.partyId || null) as string,
      p_invoice_date: payload.issueDate || formatLocalDate(),
      // [FIX §18] كان `payload.dueDate || formatLocalDate()` ⇒ الاستحقاق = الإصدار
      // لكل فاتورة آجلة (صفر يوم سماح)، فظهر 100% من المديونية «متأخراً».
      // الآن: الصريح يُحترم، والنقدي = الإصدار، والآجل بمدة سماح مجهولة يُرسل
      // NULL ليحسمه مُشغّل قاعدة البيانات من parties.payment_terms_days.
      // النوع المولَّد يعلن `p_due_date: string` بينما العمود يقبل NULL والدالة
      // تقبل NULL — نفس مفارقة p_party_id أعلاه، والتضييق صريح هنا فقط.
      p_due_date: resolveSaleInvoiceDueDate({
        issueDate: payload.issueDate ?? null,
        explicitDueDate: payload.dueDate ?? null,
        paymentMethod: payload.paymentMethod,
      }) as unknown as string,
      p_items: payload.items.map(i => ({
        product_id: i.productId,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        // [AUDIT-FIX] لا تُضف ضريبة 15% افتراضية صامتة: كانت tax_rate ?? 15 تُحمّل
        // الفاتورة 15% بينما الواجهة والقالب المطبوع لا يعرضان أي ضريبة (tax_amount: 0)
        // ونظام tax_rates يُنشأ افتراضياً 0%. الافتراضي الآن 0% ويُحترم أي taxRate صريح
        // فقط عندما تعرض الواجهة الضريبة فعلياً.
        tax_rate: i.taxRate ?? 0,
        ...(i.warehouseId ? { warehouse_id: i.warehouseId } : {}),
      })),
      p_payment_type: payload.paymentMethod || 'cash',
      ...optArg('p_notes', payload.notes),
      p_currency_code: payload.currency || 'SAR',
      p_exchange_rate: payload.exchangeRate || 1,
      p_idempotency_key: idempotencyKey,
      ...optArg('p_branch_id', payload.branchId),
      ...optArg('p_payment_account_id', payload.treasuryAccountId),
      p_paid_amount: Number(payload.paidAmount) || 0,
    };

    if (payload.isCrossBranch) {
      const sourceWarehouseId = payload.items[0]?.warehouseId;
      if (!sourceWarehouseId) {
        throw new Error('يجب تحديد المستودع لعملية البيع المتقاطع');
      }

      const crossBranchParams = {
        p_company_id: companyId,
        p_seller_branch_id: payload.branchId,
        p_source_warehouse_id: sourceWarehouseId,
        p_customer_id: payload.partyId || null,
        p_items: payload.items.map(i => ({
          product_id: i.productId,
          quantity: i.quantity,
          sale_price: i.unitPrice,
        })),
        p_payment_type: payload.paymentMethod || 'cash',
        p_user_id: userId,
      };

      const { data: result, error } = await supabase.rpc(
        'fn_process_cross_branch_sale' as any,
        crossBranchParams
      );
      if (error) throw parseError(error);
      return { id: result } as unknown as InvoiceResponse;
    }

    const { data: result, error } = await supabase.rpc('commit_sales_invoice_v2', rpcParams);
    if (error) throw parseError(error);

    const invResponse = result as unknown as InvoiceResponse;
    if (invResponse?.id) {
      void broadcastCrossBranchActivity(companyId, {
        id: invResponse.id,
        company_id: companyId,
        branch_id: payload.branchId ?? null,
        type: 'sale_created',
        title: 'فاتورة مبيعات جديدة',
        message: `تم تسجيل فاتورة مبيعات ${invResponse.invoice_number ? `رقم ${invResponse.invoice_number}` : ''}`,
        amount: invResponse.total_amount || 0,
        currency_code: payload.currency || 'SAR',
        document_number: invResponse.invoice_number,
        link: '/sales',
        created_by: userId,
      });
    }

    return invResponse;
  },

  commitReturnRPC: async (
    companyId: string,
    userId: string,
    payload: CreateInvoicePayload
  ): Promise<InvoiceResponse> => {
    if (!payload.partyId) {
      throw new Error('يجب اختيار العميل قبل إنشاء مرتجع المبيعات');
    }

    // البنود تُرسَل بالمفاتيح التي يملكها هذا النوع فعلاً. لا حاجة لإرسال الوصف
    // أو التكلفة: process_sales_return يستنبطهما من كتالوج المنتجات عند غيابهما
    // (راجع migration 20260928000003)، فلا يعود بإمكان عميل أن يُصفّر عكس تكلفة
    // البضاعة في القيد المحاسبي بإغفال حقل.
    const returnItems = payload.items.map(i => ({
      product_id: i.productId,
      quantity: i.quantity,
      unit_price: i.unitPrice,
    }));

    try {
      const { data: result, error } = await supabase.rpc('process_sales_return', {
        p_invoice_id: (payload.referenceInvoiceId || null) as unknown as string,
        p_party_id: (payload.partyId || null) as unknown as string,
        p_payment_method: payload.paymentMethod || 'cash',
        p_items: returnItems as any,
        p_return_reason: payload.returnReason || '',
        p_status: 'posted',
        p_notes: payload.notes || '',
        p_issue_date: payload.issueDate || formatLocalDate(),
        p_currency_code: payload.currency || 'SAR',
        p_exchange_rate: payload.exchangeRate ? payload.exchangeRate : 1,
        p_company_id: companyId,
        p_user_id: userId,
      });

      if (error) throw error;
      return result as unknown as InvoiceResponse;
    } catch (err) {
      // ⚠️ المسار الاحتياطي مسموح فقط عند غياب الدالة نفسها في بيئة قديمة.
      // أي فشل آخر (مهلة الشبكة 45s، انقطاع، 57014، 23505…) قد يكون قد نُفِّذ
      // فعلياً على الخادم ثم فُقد الردّ؛ فيُنشئ commit_sale_return مرتجعاً ثانياً
      // بلا مفتاح idempotency (الدالة لا تقبل مفتاحاً أصلاً) → ازدواج مالي حقيقي
      // في المخزون والقيود والأرصدة. لذلك نُظهر الخطأ بدل إعادة المحاولة بعقد آخر.
      if (!isMissingFunctionError(err)) {
        throw parseError(err);
      }
      logger.warn(
        'salesApi',
        'process_sales_return is unavailable in this database; using legacy commit_sale_return:',
        err
      );
      const rpcParams = {
        p_company_id: companyId,
        p_user_id: userId,
        p_party_id: payload.partyId,
        p_items: returnItems,
        ...(payload.notes ? { p_notes: payload.notes } : {}),
        ...(payload.currency ? { p_currency: payload.currency } : {}),
        ...(payload.exchangeRate ? { p_exchange_rate: payload.exchangeRate } : {}),
        ...(payload.referenceInvoiceId
          ? { p_reference_invoice_id: payload.referenceInvoiceId }
          : {}),
        ...(payload.returnReason ? { p_return_reason: payload.returnReason } : {}),
        ...(payload.branchId ? { p_branch_id: payload.branchId } : {}),
      };

      const { data: fallbackResult, error: fallbackError } = await supabase.rpc(
        'commit_sale_return',
        rpcParams
      );
      if (fallbackError) throw parseError(fallbackError);
      return fallbackResult as unknown as InvoiceResponse;
    }
  },

  getInvoiceDetails: async (invoiceId: string, companyId?: string | null) => {
    let query = supabase
      .from('invoices')
      .select(
        `
        *,
        parties:party_id(*),
        payment_allocations(
          payments:payments(amount, created_at, payment_method)
        ),
        invoice_items(
          *,
          product:products(name_ar, sku, cost_price, part_number, brand)
        )
      `
      )
      .eq('id', invoiceId);

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query.single();

    if (error) throw parseError(error);
    return data as unknown as InvoiceWithDetails;
  },

  getNextInvoiceNumber: async (companyId: string) => {
    const { data, error } = await supabase.rpc('get_next_invoice_number', {
      p_company_id: companyId,
      p_type: 'INV',
    });

    if (error) return { data: null, error };
    return { data: data as string | null, error: null };
  },

  getNextSequence: async (companyId: string, type: string) => {
    const { data, error } = await supabase.rpc('get_next_sequence', {
      p_company_id: companyId,
      p_sequence_name: type,
    });
    if (error) {
      logger.error('Sales', 'Error fetching next sequence', error);
      return { data: null, error: parseError(error) };
    }
    return { data, error: null };
  },

  /**
   * [AUDIT-FIX] الرقم المعروض/المطبوع قبل الاعتماد.
   * يستخدم دالة generate_invoice_number الخادمية (إن وُجدت) لتوليد رقم بصيغة
   * INV-YYYYMMDD-NNNN مطابقة لما يعتمده الخادم، بدلاً من get_next_sequence('sale')
   * التي لا تملك فرع 'sale' فترجع '1' دائماً.
   */
  getNextGeneratedNumber: async (
    companyId: string,
    type: 'sale' | 'purchase' = 'sale',
    branchId?: string | null
  ) => {
    const { data, error } = await supabase.rpc('generate_invoice_number', {
      p_company_id: companyId,
      p_type: type,
      ...optArg('p_branch_id', branchId),
    });
    if (error) {
      logger.warn('Sales', 'generate_invoice_number unavailable — falling back to sequence', error);
      return { data: null, error: parseError(error) };
    }
    return { data: data as string | null, error: null };
  },

  getSalesAnalytics: async (params: {
    company_id: string;
    start_date?: string;
    end_date?: string;
    branch_id?: string | null;
    currency?: 'ALL' | 'SAR' | 'YER';
    payment_type?: 'ALL' | 'cash' | 'credit' | 'bank' | 'network';
  }) => {
    // 1. Build main period query (Lean without nested joins for maximum speed)
    let query = supabase
      .from('invoices')
      .select('id, type, total_amount, issue_date, payment_method, currency_code, exchange_rate, party_id')
      .eq('company_id', params.company_id)
      .in('type', ['sale', 'sale_return'])
      .neq('status', 'void')
      .neq('status', 'cancelled')
      .is('deleted_at', null);

    if (params.branch_id) {
      query = query.eq('branch_id', params.branch_id);
    }
    if (params.currency && params.currency !== 'ALL') {
      query = query.eq('currency_code', params.currency);
    }
    if (params.payment_type && params.payment_type !== 'ALL') {
      query = query.eq('payment_method', params.payment_type);
    }
    if (params.start_date) {
      query = query.gte('issue_date', params.start_date);
    }
    if (params.end_date) {
      query = query.lte('issue_date', params.end_date);
    }

    // 2. Build previous period comparison query if dates are provided
    let prevQueryPromise: Promise<{ data: any[] | null; error: any }> = Promise.resolve({
      data: null,
      error: null,
    });

    if (params.start_date && params.end_date) {
      const { startDate: prevStart, endDate: prevEnd } = computePreviousDateRange(
        params.start_date,
        params.end_date
      );

      let prevQ = supabase
        .from('invoices')
        .select('type, total_amount, currency_code, exchange_rate')
        .eq('company_id', params.company_id)
        .in('type', ['sale', 'sale_return'])
        .neq('status', 'void')
        .neq('status', 'cancelled')
        .is('deleted_at', null)
        .gte('issue_date', prevStart)
        .lte('issue_date', prevEnd);

      if (params.branch_id) prevQ = prevQ.eq('branch_id', params.branch_id);
      if (params.currency && params.currency !== 'ALL') prevQ = prevQ.eq('currency_code', params.currency);
      if (params.payment_type && params.payment_type !== 'ALL') prevQ = prevQ.eq('payment_method', params.payment_type);

      prevQueryPromise = prevQ as any;
    }

    // Run main query and previous period query concurrently in parallel
    const [{ data: invRows, error: invErr }, { data: prevRows }] = await Promise.all([
      query,
      prevQueryPromise,
    ]);

    if (invErr) {
      logger.error('Sales', 'Error fetching sales analytics', invErr);
      return { data: null, error: invErr };
    }

    let totalSales = 0;
    let totalReturns = 0;
    let totalSalesSAR = 0;
    let totalSalesYER = 0;
    let cashSalesSAR = 0;
    let cashSalesYER = 0;
    let creditSalesSAR = 0;
    let creditSalesYER = 0;
    let totalReturnsSAR = 0;
    let totalReturnsYER = 0;
    let invoiceCount = 0;

    const byDay = new Map<string, { sales: number; returns: number }>();
    const byMethod = new Map<string, number>();
    const byCust = new Map<string, { customerName: string; totalAmount: number; invoiceCount: number }>();

    for (const r of invRows || []) {
      const amt = r.total_amount ?? 0;
      const rate = r.exchange_rate ?? 1;
      const curr = (r.currency_code || 'SAR').toUpperCase();
      const method = r.payment_method || 'cash';

      let baseAmt = amt;
      if (params.currency && params.currency !== 'ALL') {
        // When filtered specifically by a single currency (e.g. YER or SAR),
        // use nominal currency amounts directly to preserve accurate values
        baseAmt = amt;
      } else {
        try {
          baseAmt = toBaseCurrency({
            amount: amt,
            currency_code: curr,
            exchange_rate: rate,
          });
        } catch {
          baseAmt = amt;
        }
      }
      const day = r.issue_date || '';
      const dEntry = byDay.get(day) ?? { sales: 0, returns: 0 };

      if (r.type === 'sale') {
        totalSales += baseAmt;
        invoiceCount += 1;
        dEntry.sales += baseAmt;
        byMethod.set(method, (byMethod.get(method) ?? 0) + baseAmt);

        if (curr === 'SAR') {
          totalSalesSAR += amt;
          if (method === 'cash') cashSalesSAR += amt;
          else if (method === 'credit') creditSalesSAR += amt;
        } else if (curr === 'YER') {
          totalSalesYER += amt;
          if (method === 'cash') cashSalesYER += amt;
          else if (method === 'credit') creditSalesYER += amt;
        }

        const partyId = r.party_id;
        if (partyId) {
          const cEntry = byCust.get(partyId) ?? {
            customerName: 'عميل',
            totalAmount: 0,
            invoiceCount: 0,
          };
          cEntry.totalAmount += baseAmt;
          cEntry.invoiceCount += 1;
          byCust.set(partyId, cEntry);
        }
      } else if (r.type === 'sale_return') {
        totalReturns += baseAmt;
        dEntry.returns += baseAmt;
        if (curr === 'SAR') totalReturnsSAR += amt;
        else if (curr === 'YER') totalReturnsYER += amt;
      }

      if (day) byDay.set(day, dEntry);
    }

    // 3. Fast decoupled batch customer names lookup for top 10 customers only (< 15ms)
    const topCustomerEntries = Array.from(byCust.entries())
      .sort((a, b) => b[1].totalAmount - a[1].totalAmount)
      .slice(0, 10);

    const partyMap = await batchLookupParties(
      topCustomerEntries.map(([id]) => id),
      supabase
    );

    for (const entry of topCustomerEntries) {
      const found = partyMap.get(entry[0]);
      if (found) entry[1].customerName = found.name;
    }

    // 3.5 Fast decoupled top products lookup for matching invoices
    const saleInvoiceIds = (invRows || [])
      .filter(r => r.type === 'sale')
      .map(r => r.id)
      .slice(0, 100);

    let topProducts: Array<{
      productId: string;
      productName: string;
      sku?: string;
      partNumber?: string | null;
      brand?: string | null;
      quantity: number;
      revenue: number;
    }> = [];

    if (saleInvoiceIds.length > 0) {
      const { data: itemRows } = await supabase
        .from('invoice_items')
        .select('product_id, quantity, total')
        .in('invoice_id', saleInvoiceIds);

      if (itemRows && itemRows.length > 0) {
        const prodMap = new Map<string, { quantity: number; revenue: number }>();
        for (const it of itemRows) {
          const pid = it.product_id;
          if (pid) {
            const entry = prodMap.get(pid) ?? { quantity: 0, revenue: 0 };
            entry.quantity += Number(it.quantity || 0);
            entry.revenue += Number(it.total || 0);
            prodMap.set(pid, entry);
          }
        }

        const topProdEntries = Array.from(prodMap.entries())
          .sort((a, b) => b[1].revenue - a[1].revenue)
          .slice(0, 10);

        const prodDetailsMap = await batchLookupProducts(
          topProdEntries.map(([id]) => id),
          supabase
        );

        topProducts = topProdEntries.map(([pid, v]) => {
          const detail = prodDetailsMap.get(pid);
          return {
            productId: pid,
            productName: detail?.name_ar || 'صنف',
            ...(detail?.sku ? { sku: detail.sku } : {}),
            partNumber: detail?.part_number ?? null,
            brand: detail?.brand ?? null,
            quantity: v.quantity,
            revenue: v.revenue,
          };
        });
      }
    }

    // 4. Calculate previous period metrics
    let prevTotalSales = 0;
    let prevTotalReturns = 0;
    for (const pr of prevRows || []) {
      const amt = pr.total_amount ?? 0;
      const rate = pr.exchange_rate ?? 1;
      const curr = (pr.currency_code || 'SAR').toUpperCase();
      let baseAmt = amt;
      if (params.currency && params.currency !== 'ALL') {
        baseAmt = amt;
      } else {
        try {
          baseAmt = toBaseCurrency({ amount: amt, currency_code: curr, exchange_rate: rate });
        } catch {
          baseAmt = amt;
        }
      }
      if (pr.type === 'sale') prevTotalSales += baseAmt;
      else if (pr.type === 'sale_return') prevTotalReturns += baseAmt;
    }
    const prevNetSales = prevTotalSales - prevTotalReturns;

    const netSales = totalSales - totalReturns;
    return {
      data: {
        totalSales,
        totalReturns,
        netSales,
        totalSalesSAR,
        totalSalesYER,
        cashSalesSAR,
        cashSalesYER,
        creditSalesSAR,
        creditSalesYER,
        totalReturnsSAR,
        totalReturnsYER,
        invoiceCount,
        averageInvoiceValue: invoiceCount > 0 ? totalSales / invoiceCount : 0,
        prevTotalSales,
        prevTotalReturns,
        prevNetSales,
        topProducts,
        topCustomers: topCustomerEntries.map(([customerId, v]) => ({ customerId, ...v })),
        salesByDay: Array.from(byDay.entries())
          .map(([date, v]) => ({ date, ...v }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        salesByPaymentMethod: Array.from(byMethod.entries()).map(([method, amount]) => ({
          method,
          amount,
        })),
      },
      error: null,
    };
  },

  deleteInvoice: async (id: string) => {
    // Strictly invoke void_invoice RPC to reverse inventory and accounting atomically.
    // Zero client-side fallback to prevent unauthorized bypass or un-reversed ledgers.
    const { data, error } = await supabase.rpc('void_invoice', { p_invoice_id: id });
    if (error) throw parseError(error);
    return { data, error: null };
  },

  getInvoiceNavigatorBoundaries: async (
    companyId: string,
    branchId?: string | null
  ): Promise<{ first: InvoiceNavSummary | null; last: InvoiceNavSummary | null }> => {
    let firstQuery = supabase
      .from('invoices')
      .select('id, invoice_number, created_at, issue_date, total_amount, currency_code, party:party_id(name)')
      .eq('company_id', companyId)
      .eq('type', 'sale')
      .neq('status', 'void')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1);

    let lastQuery = supabase
      .from('invoices')
      .select('id, invoice_number, created_at, issue_date, total_amount, currency_code, party:party_id(name)')
      .eq('company_id', companyId)
      .eq('type', 'sale')
      .neq('status', 'void')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);

    if (branchId) {
      firstQuery = firstQuery.eq('branch_id', branchId);
      lastQuery = lastQuery.eq('branch_id', branchId);
    }

    const [firstRes, lastRes] = await Promise.all([firstQuery, lastQuery]);
    if (firstRes.error) throw parseError(firstRes.error);
    if (lastRes.error) throw parseError(lastRes.error);

    const mapRow = (r: any): InvoiceNavSummary | null => {
      if (!r) return null;
      return {
        id: r.id,
        invoice_number: r.invoice_number || '',
        created_at: r.created_at || '',
        issue_date: r.issue_date || '',
        total_amount: Number(r.total_amount) || 0,
        currency_code: r.currency_code || 'SAR',
        party_name: r.party?.name || null,
      };
    };

    return {
      first: mapRow(firstRes.data?.[0]),
      last: mapRow(lastRes.data?.[0]),
    };
  },

  getAdjacentInvoices: async (
    companyId: string,
    currentCreatedAt: string,
    currentId: string,
    branchId?: string | null
  ): Promise<{ prev: InvoiceNavSummary | null; next: InvoiceNavSummary | null }> => {
    let prevQuery = supabase
      .from('invoices')
      .select('id, invoice_number, created_at, issue_date, total_amount, currency_code, party:party_id(name)')
      .eq('company_id', companyId)
      .eq('type', 'sale')
      .neq('status', 'void')
      .is('deleted_at', null)
      .or(`created_at.lt.${currentCreatedAt},and(created_at.eq.${currentCreatedAt},id.lt.${currentId})`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);

    let nextQuery = supabase
      .from('invoices')
      .select('id, invoice_number, created_at, issue_date, total_amount, currency_code, party:party_id(name)')
      .eq('company_id', companyId)
      .eq('type', 'sale')
      .neq('status', 'void')
      .is('deleted_at', null)
      .or(`created_at.gt.${currentCreatedAt},and(created_at.eq.${currentCreatedAt},id.gt.${currentId})`)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1);

    if (branchId) {
      prevQuery = prevQuery.eq('branch_id', branchId);
      nextQuery = nextQuery.eq('branch_id', branchId);
    }

    const [prevRes, nextRes] = await Promise.all([prevQuery, nextQuery]);
    if (prevRes.error) throw parseError(prevRes.error);
    if (nextRes.error) throw parseError(nextRes.error);

    const mapRow = (r: any): InvoiceNavSummary | null => {
      if (!r) return null;
      return {
        id: r.id,
        invoice_number: r.invoice_number || '',
        created_at: r.created_at || '',
        issue_date: r.issue_date || '',
        total_amount: Number(r.total_amount) || 0,
        currency_code: r.currency_code || 'SAR',
        party_name: r.party?.name || null,
      };
    };

    return {
      prev: mapRow(prevRes.data?.[0]),
      next: mapRow(nextRes.data?.[0]),
    };
  },

  searchInvoiceForNavigation: async (
    companyId: string,
    invoiceNumber: string,
    branchId?: string | null
  ): Promise<InvoiceNavSummary | null> => {
    const cleanNum = invoiceNumber.trim();
    if (!cleanNum) return null;

    let queryExact = supabase
      .from('invoices')
      .select('id, invoice_number, created_at, issue_date, total_amount, currency_code, party:party_id(name)')
      .eq('company_id', companyId)
      .eq('type', 'sale')
      .neq('status', 'void')
      .is('deleted_at', null)
      .eq('invoice_number', cleanNum)
      .limit(1);

    if (branchId) queryExact = queryExact.eq('branch_id', branchId);
    const { data: exactData, error: exactError } = await queryExact;
    if (exactError) throw parseError(exactError);

    if (exactData && exactData.length > 0) {
      const r = exactData[0];
      return {
        id: r.id,
        invoice_number: r.invoice_number || '',
        created_at: r.created_at || '',
        issue_date: r.issue_date || '',
        total_amount: Number(r.total_amount) || 0,
        currency_code: r.currency_code || 'SAR',
        party_name: (r as any).party?.name || null,
      };
    }

    let queryLike = supabase
      .from('invoices')
      .select('id, invoice_number, created_at, issue_date, total_amount, currency_code, party:party_id(name)')
      .eq('company_id', companyId)
      .eq('type', 'sale')
      .neq('status', 'void')
      .is('deleted_at', null)
      .ilike('invoice_number', `%${cleanNum}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (branchId) queryLike = queryLike.eq('branch_id', branchId);
    const { data: likeData, error: likeError } = await queryLike;
    if (likeError) throw parseError(likeError);

    if (likeData && likeData.length > 0) {
      const r = likeData[0];
      return {
        id: r.id,
        invoice_number: r.invoice_number || '',
        created_at: r.created_at || '',
        issue_date: r.issue_date || '',
        total_amount: Number(r.total_amount) || 0,
        currency_code: r.currency_code || 'SAR',
        party_name: (r as any).party?.name || null,
      };
    }

    return null;
  },
};
