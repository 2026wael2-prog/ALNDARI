import { supabase } from '@/lib/supabaseClient';
import type { Json } from '@/core/database.types';
import { parseError } from '@/core/utils/errorUtils';
import { formatLocalDate } from '@/core/utils/dateUtils';
import type { CreateInvoicePayload, UpdateInvoicePayload, InvoiceResponse } from '../types';
import { logger } from '@/core/utils/logger';
import type { MatchedInvoiceItem, SearchInvoiceResultRow } from '@/core/types/invoiceSearch';
import { optArg } from '@/core/utils/rpcArgs';
import { resolveSaleInvoiceDueDate } from '../utils/dueDate';
import { broadcastCrossBranchActivity } from '@/features/branches/api';
import { edgeClient, shouldUseLocalFailover } from '@/core/offline/edgeClient';
import type { InvoiceWithDetails, InvoiceWithParty } from './types';

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

export const invoicesApi = {
  getInvoices: async (companyId: string, page = 0, limit = 50, branchId?: string | null) => {
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
        return_status,
        returned_amount,
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
      p_limit: params.limit ?? 30,
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
      p_party_id: payload.partyId as unknown as string,
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
      if (
        shouldUseLocalFailover() ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) {
        throw new Error('البيع والتحويل بين الفروع يتطلب اتصالاً مباشراً بالإنترنت');
      }
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

      type CrossBranchRpc = (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: unknown }>;
      const { data: result, error } = await (supabase.rpc as unknown as CrossBranchRpc)(
        'fn_process_cross_branch_sale',
        crossBranchParams
      );
      if (error !== null && error !== undefined) throw parseError(error);
      return {
        id: typeof result === 'string' ? result : '',
        invoice_number: '',
        total_amount: 0,
        status: 'posted',
      };
    }

    const enqueueOfflineSale = async (): Promise<InvoiceResponse> => {
      const queued = await edgeClient.enqueueSalesInvoice(rpcParams, userId);
      return {
        id: queued.id,
        invoice_number: queued.invoice_number,
        total_amount: queued.total_amount,
        status: 'offline_queued',
      };
    };

    if (shouldUseLocalFailover()) {
      return await enqueueOfflineSale();
    }

    let result: unknown;
    let error: unknown;
    try {
      const rpcRes = await supabase.rpc('commit_sales_invoice_v2', rpcParams);
      result = rpcRes.data;
      error = rpcRes.error;
    } catch (netErr) {
      if (shouldUseLocalFailover(netErr)) {
        return await enqueueOfflineSale();
      }
      throw netErr;
    }

    if (error !== null && error !== undefined) {
      if (shouldUseLocalFailover(error)) {
        return await enqueueOfflineSale();
      }
      throw parseError(error);
    }

    const invResponse: InvoiceResponse =
      typeof result === 'string'
        ? { id: result, invoice_number: '', total_amount: 0, status: 'posted' }
        : (result as InvoiceResponse);
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
        p_items: returnItems as unknown as Json,
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

  deleteInvoice: async (id: string) => {
    // Strictly invoke void_invoice RPC to reverse inventory and accounting atomically.
    // Zero client-side fallback to prevent unauthorized bypass or un-reversed ledgers.
    const { data, error } = await supabase.rpc('void_invoice', { p_invoice_id: id });
    if (error) throw parseError(error);
    return { data, error: null };
  },

  updateInvoice: async (
    payload: UpdateInvoicePayload
  ): Promise<InvoiceResponse> => {
    if (payload.paymentMethod === 'credit' && !payload.partyId) {
      throw new Error('يجب اختيار العميل للفاتورة الآجلة');
    }

    const rpcParams = {
      p_invoice_id: payload.invoiceId,
      p_party_id: (payload.partyId || null) as unknown as string,
      p_invoice_date: payload.issueDate || formatLocalDate(),
      p_due_date: resolveSaleInvoiceDueDate({
        issueDate: payload.issueDate ?? null,
        explicitDueDate: payload.dueDate ?? null,
        paymentMethod: payload.paymentMethod,
      }) as unknown as string,
      p_items: payload.items.map(i => ({
        product_id: i.productId,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        tax_rate: i.taxRate ?? 0,
        warehouse_id: i.warehouseId ?? null,
        discount_amount: i.discount ?? 0,
      })),
      p_payment_type: payload.paymentMethod || 'cash',
      p_notes: (payload.notes || null) as unknown as string,
      p_currency_code: payload.currency || 'SAR',
      p_exchange_rate: payload.exchangeRate ? payload.exchangeRate : 1,
      p_branch_id: (payload.branchId || null) as unknown as string,
      p_payment_account_id: (payload.treasuryAccountId || null) as unknown as string,
      p_paid_amount: payload.paymentMethod === 'credit' ? payload.paidAmount || 0 : 0,
    };

    const { data: result, error } = await supabase.rpc('update_sales_invoice_v2', rpcParams);
    if (error) throw parseError(error);

    return result as unknown as InvoiceResponse;
  },

  mergeInvoices: async (payload: {
    invoiceIds: string[];
    targetCurrency?: string | undefined;
    exchangeRate?: number | undefined;
    targetDate?: string | undefined;
    notes?: string | undefined;
    combineDuplicateProducts?: boolean | undefined;
  }) => {
    const { data, error } = await (supabase.rpc as any)('merge_sales_invoices_v1', {
      p_invoice_ids: payload.invoiceIds,
      p_target_currency: payload.targetCurrency || null,
      p_exchange_rate: payload.exchangeRate ?? null,
      p_target_date: payload.targetDate || null,
      p_notes: payload.notes?.trim() || null,
      p_combine_duplicate_products: payload.combineDuplicateProducts ?? true,
    });
    if (error) throw parseError(error);
    return data as {
      success: boolean;
      primary_invoice_id: string;
      primary_invoice_number: string;
      merged_invoice_ids: string[];
      merged_invoice_numbers: string[];
      merged_count: number;
      currency_code: string;
      exchange_rate: number;
      total_amount: number;
      total_document_amount: number;
    };
  },

  bulkConvertInvoicesCurrency: async (payload: {
    invoiceIds: string[];
    targetCurrency: string;
    exchangeRate: number;
  }) => {
    const { data, error } = await (supabase.rpc as any)(
      'bulk_convert_sales_invoices_currency_v1',
      {
        p_invoice_ids: payload.invoiceIds,
        p_target_currency: payload.targetCurrency,
        p_exchange_rate: payload.exchangeRate,
      }
    );
    if (error) throw parseError(error);
    return data as {
      success: boolean;
      converted_count: number;
      skipped_count: number;
      target_currency: string;
      exchange_rate: number;
      invoice_numbers: string[];
    };
  },
};
