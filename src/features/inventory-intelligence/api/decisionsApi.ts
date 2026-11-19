import { supabase } from '../../../lib/supabaseClient';
import type { PersistedRecommendationRecord, RecommendationStatus } from '../types';

export async function getRecommendationHistory(
  companyId: string
): Promise<PersistedRecommendationRecord[]> {
  const { data, error } = await (supabase as unknown as { from: (t: string) => any })
    .from('inv_intelligence_recommendations')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return [];
  return (data ?? []) as PersistedRecommendationRecord[];
}

const inFlightDecisions = new Set<string>();

export async function recordRecommendationDecision(params: {
  companyId: string;
  userId: string;
  recType: 'transfer' | 'purchase' | 'excess_review';
  productId: string;
  productName?: string;
  fromBranchId?: string | null;
  toBranchId?: string | null;
  supplierId?: string | null;
  recommendedQty: number;
  approvedQty?: number | null;
  urgency: string;
  confidenceScore: number;
  reason: string;
  status: RecommendationStatus;
  decisionReason?: string;
  calculationBreakdown?: Record<string, unknown>;
  idempotencyKey?: string;
  conflictBlocked?: boolean;
  conflictReasons?: string[];
}): Promise<{ linkedTransferId?: string | null; linkedPoId?: string | null }> {
  const routeSuffix =
    params.recType === 'transfer'
      ? `:${params.fromBranchId ?? 'none'}:${params.toBranchId ?? 'none'}`
      : '';
  const lockKey = `${params.companyId}:${params.recType}:${params.productId}${routeSuffix}`;
  if (inFlightDecisions.has(lockKey)) {
    throw new Error('عملية الاعتماد قيد التنفيذ بالفعل — يرجى الانتظار لمنع التكرار');
  }
  inFlightDecisions.add(lockKey);

  try {
    const effectiveQty = Math.max(1, Math.round(params.approvedQty ?? params.recommendedQty));

    if (params.status === 'approved' || params.status === 'modified') {
      if (params.conflictBlocked) {
        const reasonText = (params.conflictReasons ?? []).join(' • ') || 'قرار محجوب من محرك الحوكمة والتدقيق';
        throw new Error(`حجب الحوكمة: ${reasonText}`);
      }

      // 0) Accounting Audit Veto Guard: Reject execution on negative/corrupted stock (company-scoped)
      const { data: stockRows, error: stockErr } = await (supabase as unknown as { from: (t: string) => any })
        .from('product_stock')
        .select('quantity, reserved_quantity, damaged_quantity, warehouse_id')
        .eq('company_id', params.companyId)
        .eq('product_id', params.productId);

      if (stockErr) {
        throw new Error('تعذر التحقق من الأرصدة المخزنية قبل التنفيذ (فشل أمني آمن)');
      }

      const hasNegativeStock = (stockRows ?? []).some(
        (s: { quantity: number | null }) => Number(s.quantity ?? 0) < 0
      );
      if (hasNegativeStock) {
        throw new Error('حجب التدقيق المحاسبي: الصنف يحتوي على رصيد سالب في أحد المستودعات — يُحظر الشراء أو التحويل قبل التسوية الجردية');
      }

      // 1) Fail-Closed Role-Based Authorization check against user_company_roles
      const { data: roleRow, error: roleErr } = await (supabase as unknown as { from: (t: string) => any })
        .from('user_company_roles')
        .select('role')
        .eq('company_id', params.companyId)
        .eq('user_id', params.userId)
        .limit(1)
        .maybeSingle();

      if (roleErr) {
        throw new Error('تعذر التحقق من صلاحية المستخدم — تم رفض التنفيذ احترازياً');
      }

      const role = String(roleRow?.role ?? '').trim().toLowerCase();
      if (!role) {
        throw new Error('access_denied: لا توجد صلاحية مسجلة لهذا المستخدم في هذه الشركة');
      }

      const allowedApprovers = new Set([
        'owner',
        'admin',
        'manager',
        'branch_manager',
        'accountant',
        'procurement',
      ]);
      if (!allowedApprovers.has(role)) {
        throw new Error(`صلاحيتك (${role}) لا تسمح باعتماد أو تنفيذ قرارات المخزون والمشتريات`);
      }

      if (params.recType === 'purchase') {
        const unitPrice = Number(params.calculationBreakdown?.unitPrice ?? 0);
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
          throw new Error('لا يمكن اعتماد أو إنشاء أمر شراء بدون سعر وحدة موثوق (unitPrice > 0)');
        }
        if (!params.supplierId) {
          throw new Error('لا يمكن اعتماد أمر الشراء بدون تحديد مورد مسجل');
        }
        const authoritativeAmount = Number((effectiveQty * unitPrice).toFixed(2));
        if (authoritativeAmount >= 5000 && role !== 'owner' && role !== 'admin') {
          throw new Error('أوامر الشراء بقيمة 5,000 فأكثر تتطلب اعتماد المالك أو المدير العام (Owner/Admin)');
        }
      }

      // 2) Same-day route-aware idempotency guard against duplicate execution
      const todayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
      let dupQuery = (supabase as unknown as { from: (t: string) => any })
        .from('inv_intelligence_recommendations')
        .select('id, status, linked_transfer_id, linked_po_id')
        .eq('company_id', params.companyId)
        .eq('rec_type', params.recType)
        .eq('product_id', params.productId)
        .in('status', ['approved', 'modified', 'executed'])
        .gte('created_at', todayStart);

      if (params.recType === 'transfer' && params.fromBranchId && params.toBranchId) {
        dupQuery = dupQuery
          .eq('from_branch_id', params.fromBranchId)
          .eq('to_branch_id', params.toBranchId);
      }

      const { data: existing } = await dupQuery.limit(1).maybeSingle();

      if (existing) {
        throw new Error('تم اعتماد أو تنفيذ هذه التوصية مسبقاً اليوم (حماية منع التكرار)');
      }
    }

  let linkedTransferId: string | null = null;
  let linkedPoId: string | null = null;
  let finalStatus: RecommendationStatus = params.status;

  // Compute route-aware idempotency key early — used by both transfer and purchase blocks below
  const computedIdempotencyKey =
    params.idempotencyKey ??
    `decision:${params.companyId}:${params.recType}:${params.productId}${routeSuffix}:${new Date().toISOString().slice(0, 10)}`;

  if (
    params.recType === 'transfer' &&
    (params.status === 'approved' || params.status === 'modified') &&
    params.fromBranchId &&
    params.toBranchId
  ) {
    const { data: whRows } = await supabase
      .from('warehouses')
      .select('id, branch_id, is_primary')
      .eq('company_id', params.companyId)
      .in('branch_id', [params.fromBranchId, params.toBranchId])
      .is('deleted_at', null)
      .order('is_primary', { ascending: false });

    const fromWh = (whRows ?? []).find(w => w.branch_id === params.fromBranchId)?.id;
    const toWh = (whRows ?? []).find(w => w.branch_id === params.toBranchId)?.id;

    if (!fromWh || !toWh || fromWh === toWh) {
      throw new Error('تعذر تحديد مستودع المصدر أو الوجهة لإتمام التحويل المخزني');
    }

    const { data: transferRes, error: transferErr } = await supabase.rpc('create_stock_transfer', {
      p_from_warehouse: fromWh,
      p_to_warehouse: toWh,
      p_items: [{ product_id: params.productId, quantity: effectiveQty }],
      p_company_id: params.companyId,
      p_user_id: params.userId,
      p_notes: `تحويل ذكاء المخزون: ${params.reason}`,
    });
    if (transferErr) {
      throw new Error(transferErr.message || 'تعذر تنفيذ التحويل المخزني بين الفروع');
    }
    const parsedId =
      typeof transferRes === 'string'
        ? transferRes
        : (transferRes as { transfer_id?: string } | null)?.transfer_id ?? null;
    if (!parsedId) {
      throw new Error('لم يرجع نظام المستودعات رقم سند التحويل');
    }
    linkedTransferId = parsedId;
    finalStatus = 'executed';
  }

  if (
    params.recType === 'purchase' &&
    (params.status === 'approved' || params.status === 'modified') &&
    params.supplierId
  ) {
    // P0 FIX: Use atomic RPC — header + items created in one ACID transaction with idempotency.
    // This replaces the previous 2-step browser approach (insert header, then insert items separately).
    const unitCost = Math.max(0, Number(params.calculationBreakdown?.unitPrice ?? 0) || 0);
    const atomicKey =
      computedIdempotencyKey ||
      `po:${params.companyId}:${params.recType}:${params.productId}:${new Date().toISOString().slice(0, 10)}`;

    const { data: poResult, error: poErr } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(
      'fn_create_ai_purchase_order_atomic',
      {
        p_company_id:      params.companyId,
        p_supplier_id:     params.supplierId,
        p_buyer_id:        params.userId,
        p_product_id:      params.productId,
        p_product_name:    params.productName || 'صنف موصى بشرائه (ذكاء المخزون)',
        p_quantity:        effectiveQty,
        p_unit_cost:       unitCost,
        p_reason:          params.reason,
        p_idempotency_key: atomicKey,
      }
    );

    if (poErr) {
      throw new Error(poErr.message || 'تعذر إنشاء أمر الشراء الذري');
    }

    const poData = (poResult as unknown) as { po_id?: string; idempotent?: boolean } | null;
    if (!poData?.po_id) {
      throw new Error('لم يرجع النظام رقم أمر الشراء — قد يكون الصنف أو المورد غير مسجل');
    }

    linkedPoId = String(poData.po_id);
    finalStatus = 'executed';
  }

  const lifecycleState =
    finalStatus === 'executed'
      ? 'executed'
      : params.status === 'approved' || params.status === 'modified'
      ? 'approved'
      : params.status === 'rejected'
      ? 'rejected'
      : params.status === 'postponed'
      ? 'postponed'
      : 'awaiting_approval';

  const { error } = await (supabase as unknown as { from: (t: string) => any })
    .from('inv_intelligence_recommendations')
    .insert({
      company_id: params.companyId,
      idempotency_key: computedIdempotencyKey,
      lifecycle_state: lifecycleState,
      rec_type: params.recType,
      product_id: params.productId,
      from_branch_id: params.fromBranchId ?? null,
      to_branch_id: params.toBranchId ?? null,
      supplier_id: params.supplierId ?? null,
      recommended_qty: params.recommendedQty,
      approved_qty: params.approvedQty ?? null,
      urgency: params.urgency,
      confidence_score: params.confidenceScore,
      model_version: 'v2.1-ensemble',
      reason: params.reason,
      calculation_breakdown: params.calculationBreakdown ?? {},
      status: finalStatus,
      decision_reason: params.decisionReason ?? null,
      decided_by: params.userId,
      decided_at: new Date().toISOString(),
      linked_transfer_id: linkedTransferId,
      linked_po_id: linkedPoId,
    });

    if (error) throw error;
    return { linkedTransferId, linkedPoId };
  } finally {
    inFlightDecisions.delete(lockKey);
  }
}
