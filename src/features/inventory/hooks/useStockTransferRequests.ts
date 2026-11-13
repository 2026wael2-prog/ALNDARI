/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/explicit-function-return-type, max-lines-per-function, complexity, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabaseClient';
import { useAuthStore } from '../../auth/store';
import { useFeedbackStore } from '../../feedback/store';
import { broadcastCrossBranchActivity } from '@/features/branches/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BranchVisibilityPeer {
  branch_id: string;
  branch_name: string;
  integration_mode: string;
}

export type TransferRequestStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';

export interface StockTransferRequest {
  id: string;
  batch_id?: string | null;
  company_id: string;
  requester_branch_id: string;
  requester_branch_name?: string;
  source_branch_id: string;
  source_branch_name?: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  product_part_number?: string | null;
  product_brand?: string | null;
  requested_quantity: number;
  status: TransferRequestStatus;
  notes?: string | null;
  review_notes?: string | null;
  created_by?: string | null;
  reviewed_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTransferRequestDTO {
  productId: string;
  sourceBranchId: string;
  quantity: number;
  notes?: string | undefined;
}

export interface CreateTransferBatchItem {
  productId: string;
  quantity: number;
}

export interface CreateTransferBatchDTO {
  sourceBranchId: string;
  items: CreateTransferBatchItem[];
  notes?: string | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase raw helper — جداول branch_visibility_* غير موجودة بعد في types
// سيتم تحديث types بعد تطبيق المigration والتزامن مع CLI
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as any;

// ─────────────────────────────────────────────────────────────────────────────
// Hook: رؤية المخزون — يجلب الفروع التي يجوز لفرعي رؤية مخزونها
// ─────────────────────────────────────────────────────────────────────────────

export function useInventoryVisibilityGroup(branchId?: string | null) {
  const { user } = useAuthStore();
  const companyId = user?.company_id;

  return useQuery<BranchVisibilityPeer[]>({
    queryKey: ['branch_visibility_group', companyId, branchId],
    enabled: !!companyId && !!branchId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // 1. أوجد المجموعات التي ينتمي إليها هذا الفرع
      const { data: memberOf, error: e1 } = await db
        .from('branch_visibility_members')
        .select('group_id')
        .eq('branch_id', branchId)
        .eq('company_id', companyId);

      if (e1) throw e1;
      if (!memberOf || memberOf.length === 0) return [];

      const groupIds = (memberOf as Array<{ group_id: string }>).map(m => m.group_id);

      // 2. أوجد بقية الأعضاء في تلك المجموعات
      const { data: peers, error: e2 } = await db
        .from('branch_visibility_members')
        .select('branch_id, branches:branches!branch_id(id, name, integration_mode)')
        .in('group_id', groupIds)
        .eq('company_id', companyId)
        .neq('branch_id', branchId);

      if (e2) throw e2;

      return (
        (peers || []) as Array<{
          branch_id: string;
          branches: { name: string; integration_mode: string } | null;
        }>
      ).map(p => ({
        branch_id: p.branch_id,
        branch_name: p.branches?.name ?? 'فرع غير معروف',
        integration_mode: p.branches?.integration_mode ?? 'independent',
      }));
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: طلبات نقل المخزون
// ─────────────────────────────────────────────────────────────────────────────

export function useStockTransferRequests(
  filter: 'all' | 'incoming' | 'outgoing' = 'all',
  branchId?: string | null
) {
  const { user } = useAuthStore();
  const companyId = user?.company_id;

  return useQuery({
    queryKey: ['stock_transfer_requests', companyId, branchId, filter] as const,
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<StockTransferRequest[]> => {
      const selectFieldsWithBatch = `
        id, batch_id, company_id, requester_branch_id, source_branch_id,
        product_id, requested_quantity, status, notes, review_notes,
        created_by, reviewed_by, created_at, updated_at,
        requester_branch:branches!requester_branch_id(name),
        source_branch:branches!source_branch_id(name),
        product:products!product_id(name_ar, sku, part_number, brand)
      `;

      const selectFieldsWithoutBatch = `
        id, company_id, requester_branch_id, source_branch_id,
        product_id, requested_quantity, status, notes, review_notes,
        created_by, reviewed_by, created_at, updated_at,
        requester_branch:branches!requester_branch_id(name),
        source_branch:branches!source_branch_id(name),
        product:products!product_id(name_ar, sku, part_number, brand)
      `;

      const executeQuery = (selectStr: string) => {
        let q = db
          .from('stock_transfer_requests')
          .select(selectStr)
          .eq('company_id', companyId);

        if (branchId) {
          if (filter === 'incoming') q = q.eq('source_branch_id', branchId);
          else if (filter === 'outgoing') q = q.eq('requester_branch_id', branchId);
          else q = q.or(`requester_branch_id.eq.${branchId},source_branch_id.eq.${branchId}`);
        }

        return q.order('created_at', { ascending: false });
      };

      let { data, error } = await executeQuery(selectFieldsWithBatch);

      // Graceful fallback if batch_id column has not been migrated yet in the target database
      if (
        error &&
        (error.code === '42703' ||
          error.message?.includes('batch_id') ||
          error.code === 'PGRST100')
      ) {
        const fallbackRes = await executeQuery(selectFieldsWithoutBatch);
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) throw error;

      return ((data || []) as any[]).map(
        (r: any) =>
          ({
            ...r,
            batch_id: r.batch_id ?? null,
            requester_branch_name: r.requester_branch?.name,
            source_branch_name: r.source_branch?.name,
            product_name: r.product?.name_ar,
            product_sku: r.product?.sku,
            product_part_number: r.product?.part_number ?? null,
            product_brand: r.product?.brand ?? null,
          }) as StockTransferRequest
      );
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: إنشاء طلب نقل مخزون
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateStockTransferRequest() {
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requesterBranchId,
      dto,
    }: {
      requesterBranchId: string;
      dto: CreateTransferRequestDTO;
    }) => {
      if (!user?.company_id || !user?.id) {
        throw new Error('جلسة العمل منتهية، يرجى إعادة تسجيل الدخول');
      }
      const { data, error } = await db.rpc('create_stock_transfer_request', {
        p_company_id: user.company_id,
        p_requester_branch_id: requesterBranchId,
        p_source_branch_id: dto.sourceBranchId,
        p_product_id: dto.productId,
        p_quantity: dto.quantity,
        p_notes: dto.notes ?? null,
        p_user_id: user.id,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      showToast('تم إرسال طلب نقل المخزون بنجاح ✅', 'success');
      void qc.invalidateQueries({ queryKey: ['stock_transfer_requests'] });
    },
    onError: (err: Error) => {
      showToast(err.message || 'فشل في إرسال طلب النقل', 'error');
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: الاستجابة لطلب نقل (موافقة / رفض / إلغاء)
// ─────────────────────────────────────────────────────────────────────────────

export function useRespondToTransferRequest() {
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      requestId: string;
      action: 'approve' | 'reject' | 'cancel';
      reviewNotes?: string | undefined;
      approvedQuantity?: number | undefined;
    }) => {
      if (!user?.company_id || !user?.id) {
        throw new Error('جلسة العمل منتهية، يرجى إعادة تسجيل الدخول');
      }
      const { error } = await db.rpc('respond_stock_transfer_request', {
        p_request_id: params.requestId,
        p_action: params.action,
        p_review_notes: params.reviewNotes ?? null,
        p_user_id: user.id,
        p_approved_quantity: params.approvedQuantity ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, vars) => {
      const label =
        vars.action === 'approve' ? 'موافقة' : vars.action === 'reject' ? 'رفض' : 'إلغاء';
      showToast(`تمت ${label} طلب النقل بنجاح`, 'success');
      void qc.invalidateQueries({ queryKey: ['stock_transfer_requests'] });
      if (vars.action === 'approve') {
        void qc.invalidateQueries({ queryKey: ['products'] });
        void qc.invalidateQueries({ queryKey: ['warehouse_distribution'] });
        void qc.invalidateQueries({ queryKey: ['branches'] });
        void qc.invalidateQueries({ queryKey: ['branch_inventory'] });
      }
    },
    onError: (err: Error) => {
      showToast(err.message || 'فشلت العملية', 'error');
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: إنشاء طلب مناقلة متعدد الأصناف (Batch)
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateStockTransferBatch() {
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      requesterBranchId: string;
      dto: CreateTransferBatchDTO;
    }) => {
      if (!user?.company_id || !user?.id) {
        throw new Error('جلسة العمل منتهية، يرجى إعادة تسجيل الدخول');
      }
      const { data, error } = await db.rpc('create_stock_transfer_requests_batch', {
        p_company_id: user.company_id,
        p_requester_branch_id: params.requesterBranchId,
        p_source_branch_id: params.dto.sourceBranchId,
        p_items: params.dto.items.map(it => ({
          product_id: it.productId,
          quantity: it.quantity,
        })),
        p_notes: params.dto.notes ?? null,
        p_user_id: user.id,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: (data, vars) => {
      showToast('تم إرسال طلب المناقلة بنجاح لكافة الأصناف ✅', 'success');
      void qc.invalidateQueries({ queryKey: ['stock_transfer_requests'] });
      if (user?.company_id) {
        void broadcastCrossBranchActivity(user.company_id, {
          id: data || Math.random().toString(36),
          company_id: user.company_id,
          branch_id: vars.requesterBranchId,
          target_branch_id: vars.dto.sourceBranchId,
          type: 'transfer_request',
          title: 'طلب مناقلة مخزون وارد',
          message: `طلب مناقلة أصناف جديد لعدد ${vars.dto.items.length} صنف/أصناف`,
          item_count: vars.dto.items.length,
          link: '/inventory',
          created_by: user.id,
        });
      }
    },
    onError: (err: Error) => {
      showToast(err.message || 'فشل في إرسال طلب المناقلة', 'error');
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: الاستجابة لطلبات مناقلة متعددة دفعة واحدة (Batch Approval/Rejection)
// ─────────────────────────────────────────────────────────────────────────────

export function useRespondToTransferBatch() {
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      batchId?: string | undefined;
      requestIds?: string[] | undefined;
      action: 'approve' | 'reject' | 'cancel';
      itemsApproved?: Array<{ requestId: string; approvedQuantity: number }> | undefined;
      reviewNotes?: string | undefined;
      requesterBranchId?: string | null | undefined;
    }) => {
      if (!user?.company_id || !user?.id) {
        throw new Error('جلسة العمل منتهية، يرجى إعادة تسجيل الدخول');
      }

      if (params.batchId) {
        const { error } = await db.rpc('respond_stock_transfer_requests_batch', {
          p_batch_id: params.batchId,
          p_action: params.action,
          p_items_approved: params.itemsApproved?.map(it => ({
            request_id: it.requestId,
            approved_quantity: it.approvedQuantity,
          })) ?? null,
          p_review_notes: params.reviewNotes ?? null,
          p_user_id: user.id,
        });
        if (error) throw new Error(error.message);
      } else if (params.requestIds && params.requestIds.length > 0) {
        for (const reqId of params.requestIds) {
          const approvedQty = params.itemsApproved?.find(i => i.requestId === reqId)?.approvedQuantity;
          const { error } = await db.rpc('respond_stock_transfer_request', {
            p_request_id: reqId,
            p_action: params.action,
            p_review_notes: params.reviewNotes ?? null,
            p_user_id: user.id,
            p_approved_quantity: approvedQty ?? null,
          });
          if (error) throw new Error(error.message);
        }
      }
    },
    onSuccess: (_data, vars) => {
      const label =
        vars.action === 'approve' ? 'موافقة وشحن' : vars.action === 'reject' ? 'رفض' : 'إلغاء';
      showToast(`تمت ${label} الأصناف المطلوبة بنجاح`, 'success');
      void qc.invalidateQueries({ queryKey: ['stock_transfer_requests'] });
      if (vars.action === 'approve') {
        void qc.invalidateQueries({ queryKey: ['products'] });
        void qc.invalidateQueries({ queryKey: ['warehouse_distribution'] });
        void qc.invalidateQueries({ queryKey: ['branches'] });
        void qc.invalidateQueries({ queryKey: ['branch_inventory'] });
        void qc.invalidateQueries({ queryKey: ['inventory_movements_feed'] });
        void qc.invalidateQueries({ queryKey: ['item_movement'] });
        void qc.invalidateQueries({ queryKey: ['transfers'] });
        void qc.invalidateQueries({ queryKey: ['dashboard_summary'] });
      }

      if (user?.company_id) {
        const isApprove = vars.action === 'approve';
        void broadcastCrossBranchActivity(user.company_id, {
          id: `batch_resp_${Date.now()}`,
          company_id: user.company_id,
          branch_id: user.branch_id ?? null,
          target_branch_id: vars.requesterBranchId ?? null,
          type: isApprove ? 'transfer_approved' : 'transfer_rejected',
          title: isApprove ? 'اعتماد وشحن مناقلة' : 'رفض طلب مناقلة',
          message: isApprove ? 'تمت الموافقة وشحن الأصناف المطلوبة بنجاح' : 'تم رفض طلب المناقلة',
          link: '/inventory',
          created_by: user.id,
        });
      }
    },
    onError: (err: Error) => {
      showToast(err.message || 'فشلت العملية', 'error');
    },
  });
}
