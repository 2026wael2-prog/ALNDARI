/* eslint-disable @typescript-eslint/no-base-to-string, @typescript-eslint/no-unsafe-enum-comparison */
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/core/utils/logger';

export type CrossBranchActivityType =
  | 'transfer_request'
  | 'transfer_approved'
  | 'transfer_rejected'
  | 'sale_created'
  | 'purchase_created'
  | 'bond_created'
  | 'quotation_created'
  | 'requisition_created'
  | 'chat_message'
  | 'internal_sale';

export interface CrossBranchActivityPayload {
  id: string;
  company_id: string;
  branch_id?: string | null | undefined;
  branch_name?: string | undefined;
  target_branch_id?: string | null | undefined;
  target_branch_name?: string | undefined;
  type: CrossBranchActivityType;
  title: string;
  message: string;
  amount?: number | undefined;
  currency_code?: string | undefined;
  document_number?: string | undefined;
  item_count?: number | undefined;
  link?: string | undefined;
  created_by?: string | null | undefined;
  created_at?: string | undefined;
}

// ─── Deduplication Cache (60s TTL) ──────────────────────────────────────────
const processedEventIds = new Map<string, number>();
const DEDUP_TTL_MS = 60_000;

const cleanupDedupCache = (): void => {
  const now = Date.now();
  for (const [id, timestamp] of processedEventIds.entries()) {
    if (now - timestamp > DEDUP_TTL_MS) {
      processedEventIds.delete(id);
    }
  }
};

const isDuplicate = (id: string): boolean => {
  cleanupDedupCache();
  if (processedEventIds.has(id)) {
    return true;
  }
  processedEventIds.set(id, Date.now());
  return false;
};

// ─── Broadcast Cross-Branch Activity ────────────────────────────────────────
export const broadcastCrossBranchActivity = async (
  companyId: string,
  activity: CrossBranchActivityPayload
): Promise<void> => {
  if (!companyId) return;
  try {
    const channelName = `cross-branch-broadcast-${companyId}`;
    const channel = supabase.channel(channelName);
    
    // Mark as processed locally before sending to prevent self-echo
    processedEventIds.set(activity.id, Date.now());

    await channel.send({
      type: 'broadcast',
      event: 'branch_activity',
      payload: activity,
    });
  } catch (err) {
    logger.warn('CrossBranchActivity', 'Failed to broadcast activity', err);
  }
};

// ─── Realtime Cross-Branch Subscription ─────────────────────────────────────
export const subscribeToCrossBranchActivity = (
  companyId: string,
  currentUserId: string | null | undefined,
  onActivity: (activity: CrossBranchActivityPayload) => void
): (() => void) => {
  const channelName = `cross-branch-activity-${companyId}`;

  const channel = supabase
    .channel(channelName)
    // 1. Listen for instant client broadcasts (sub-50ms cross-branch latency)
    .on(
      'broadcast',
      { event: 'branch_activity' },
      ({ payload }: { payload: CrossBranchActivityPayload }) => {
        if (!payload || !payload.id) return;
        if (isDuplicate(payload.id)) return;
        if (currentUserId && payload.created_by === currentUserId) return;
        onActivity(payload);
      }
    )
    // 2. Database WAL: Stock Transfer Requests
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'stock_transfer_requests',
        filter: `company_id=eq.${companyId}`,
      },
      payload => {
        const row = (payload.new || {}) as Record<string, unknown>;
        const id = String(row.id || '');
        if (!id || isDuplicate(id)) return;

        const createdBy = typeof row.created_by === 'string' ? row.created_by : null;
        if (currentUserId && createdBy === currentUserId && payload.eventType === 'INSERT') return;

        const status = String(row.status || 'pending');
        const requesterBranchId = typeof row.requester_branch_id === 'string' ? row.requester_branch_id : null;
        const sourceBranchId = typeof row.source_branch_id === 'string' ? row.source_branch_id : null;
        const qty = Number(row.requested_quantity || 1);

        if (status === 'pending') {
          onActivity({
            id,
            company_id: companyId,
            branch_id: requesterBranchId,
            target_branch_id: sourceBranchId,
            type: 'transfer_request',
            title: 'طلب مناقلة مخزون وارد',
            message: `طلب مناقلة جديد لكمية (${qty}) قطعة`,
            item_count: qty,
            link: '/inventory',
            created_by: createdBy,
            created_at: String(row.created_at || new Date().toISOString()),
          });
        } else if (status === 'approved' || status === 'completed') {
          onActivity({
            id: `${id}_approved`,
            company_id: companyId,
            branch_id: sourceBranchId,
            target_branch_id: requesterBranchId,
            type: 'transfer_approved',
            title: 'اعتماد وشحن مناقلة',
            message: `تمت الموافقة وشحن طلب المناقلة بنجاح`,
            item_count: qty,
            link: '/inventory',
            created_by: createdBy,
            created_at: String(row.updated_at || new Date().toISOString()),
          });
        } else if (status === 'rejected') {
          onActivity({
            id: `${id}_rejected`,
            company_id: companyId,
            branch_id: sourceBranchId,
            target_branch_id: requesterBranchId,
            type: 'transfer_rejected',
            title: 'رفض طلب مناقلة',
            message: `تم رفض طلب المناقلة`,
            link: '/inventory',
            created_by: createdBy,
            created_at: String(row.updated_at || new Date().toISOString()),
          });
        }
      }
    )
    // 3. Database WAL: Invoices (Sales & Purchases)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'invoices',
        filter: `company_id=eq.${companyId}`,
      },
      payload => {
        const row = (payload.new || {}) as Record<string, unknown>;
        const id = String(row.id || '');
        if (!id || isDuplicate(id)) return;

        const createdBy = typeof row.created_by === 'string' ? row.created_by : null;
        if (currentUserId && createdBy === currentUserId) return;

        const type = String(row.type || 'sale');
        const invoiceNum = typeof row.invoice_number === 'string' ? row.invoice_number : '';
        const total = Number(row.total_amount || 0);
        const currency = String(row.currency_code || 'YER');
        const branchId = typeof row.branch_id === 'string' ? row.branch_id : null;

        if (type === 'sale' || type === 'sale_return') {
          const isReturn = type === 'sale_return';
          onActivity({
            id,
            company_id: companyId,
            branch_id: branchId,
            type: 'sale_created',
            title: isReturn ? 'مرتجع مبيعات جديد' : 'فاتورة مبيعات جديدة',
            message: `تم تسجيل ${isReturn ? 'مرتجع مبيعات' : 'فاتورة مبيعات'} ${invoiceNum ? `رقم ${invoiceNum}` : ''}`,
            amount: total,
            currency_code: currency,
            document_number: invoiceNum,
            link: '/sales',
            created_by: createdBy,
            created_at: String(row.created_at || new Date().toISOString()),
          });
        } else if (type === 'purchase' || type === 'purchase_return') {
          const isReturn = type === 'purchase_return';
          onActivity({
            id,
            company_id: companyId,
            branch_id: branchId,
            type: 'purchase_created',
            title: isReturn ? 'مرتجع مشتريات جديد' : 'فاتورة مشتريات جديدة',
            message: `تم تسجيل ${isReturn ? 'مرتجع مشتريات' : 'فاتورة مشتريات'} ${invoiceNum ? `رقم ${invoiceNum}` : ''}`,
            amount: total,
            currency_code: currency,
            document_number: invoiceNum,
            link: '/purchases',
            created_by: createdBy,
            created_at: String(row.created_at || new Date().toISOString()),
          });
        }
      }
    )
    // 4. Database WAL: Financial Bonds (Payments & Receipts)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'payments',
        filter: `company_id=eq.${companyId}`,
      },
      payload => {
        const row = (payload.new || {}) as Record<string, unknown>;
        const id = String(row.id || '');
        if (!id || isDuplicate(id)) return;

        const createdBy = typeof row.created_by === 'string' ? row.created_by : null;
        if (currentUserId && createdBy === currentUserId) return;

        const type = String(row.type || 'receipt');
        const isReceipt = type === 'receipt';
        const paymentNum = typeof row.payment_number === 'string' ? row.payment_number : '';
        const amount = Number(row.amount || 0);
        const currency = String(row.currency_code || 'YER');
        const branchId = typeof row.branch_id === 'string' ? row.branch_id : null;

        onActivity({
          id,
          company_id: companyId,
          branch_id: branchId,
          type: 'bond_created',
          title: isReceipt ? 'سند قبض جديد' : 'سند صرف جديد',
          message: `تم إصدار ${isReceipt ? 'سند قبض' : 'سند صرف'} ${paymentNum ? `رقم ${paymentNum}` : ''}`,
          amount,
          currency_code: currency,
          document_number: paymentNum,
          link: '/bonds',
          created_by: createdBy,
          created_at: String(row.created_at || new Date().toISOString()),
        });
      }
    )
    // 5. Database WAL: Quotations
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'quotations',
        filter: `company_id=eq.${companyId}`,
      },
      payload => {
        const row = (payload.new || {}) as Record<string, unknown>;
        const id = String(row.id || '');
        if (!id || isDuplicate(id)) return;

        const createdBy = typeof row.created_by === 'string' ? row.created_by : null;
        if (currentUserId && createdBy === currentUserId) return;

        const quoteNum = typeof row.quotation_number === 'string' ? row.quotation_number : '';
        const total = Number(row.total_amount || 0);
        const currency = String(row.currency_code || 'YER');
        const branchId = typeof row.branch_id === 'string' ? row.branch_id : null;

        onActivity({
          id,
          company_id: companyId,
          branch_id: branchId,
          type: 'quotation_created',
          title: 'عرض أسعار جديد',
          message: `تم إصدار عرض أسعار جديد ${quoteNum ? `رقم ${quoteNum}` : ''}`,
          amount: total,
          currency_code: currency,
          document_number: quoteNum,
          link: '/sales',
          created_by: createdBy,
          created_at: String(row.created_at || new Date().toISOString()),
        });
      }
    )
    // 6. Database WAL: Demanded Products / Sales Requisitions
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'prc_purchase_requests',
        filter: `company_id=eq.${companyId}`,
      },
      payload => {
        const row = (payload.new || {}) as Record<string, unknown>;
        const id = String(row.pr_id || row.id || '');
        if (!id || isDuplicate(id)) return;

        const requesterId = typeof row.requester_id === 'string' ? row.requester_id : null;
        if (currentUserId && requesterId === currentUserId) return;

        const prNum = typeof row.pr_number === 'string' ? row.pr_number : '';
        const branchId = typeof row.branch_id === 'string' ? row.branch_id : null;

        onActivity({
          id,
          company_id: companyId,
          branch_id: branchId,
          type: 'requisition_created',
          title: 'طلب منتجات مطلوبة جديد',
          message: `تم تسجيل طلب توفير قطع ومنتجات مطلوبة ${prNum ? `رقم ${prNum}` : ''}`,
          document_number: prNum,
          link: '/sales',
          created_by: requesterId,
          created_at: String(row.created_at || new Date().toISOString()),
        });
      }
    )
    // 7. Database WAL: Internal Cross-Branch Sales Notifications
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'branch_notifications',
        filter: `company_id=eq.${companyId}`,
      },
      payload => {
        const row = (payload.new || {}) as Record<string, unknown>;
        const id = String(row.id || '');
        if (!id || isDuplicate(id)) return;

        const targetBranchId = typeof row.target_branch_id === 'string' ? row.target_branch_id : null;
        const message = String(row.message || '');

        onActivity({
          id,
          company_id: companyId,
          target_branch_id: targetBranchId,
          type: 'internal_sale',
          title: 'تنبيه مبيعات داخلية بين الفروع',
          message,
          link: '/sales',
          created_at: String(row.created_at || new Date().toISOString()),
        });
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        logger.debug('CrossBranchActivity', `Subscribed to live cross-branch activity for company [${companyId}]`);
      } else if (err) {
        logger.warn('CrossBranchActivity', 'Cross-branch activity subscription error:', err);
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
};

