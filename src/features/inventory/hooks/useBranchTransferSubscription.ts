import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * useBranchTransferSubscription
 *
 * اشتراك لحظي Realtime في جدول طلبات النقل stock_transfer_requests
 * لتحديث الواجهة فور حدوث أي طلب أو استجابة عبر الفروع.
 */
export function useBranchTransferSubscription(
  companyId: string | undefined,
  branchId: string | undefined | null,
  onUpdate: () => void
): void {
  useEffect(() => {
    if (typeof companyId !== 'string' || companyId.length === 0 || typeof branchId !== 'string' || branchId.length === 0) {
      return;
    }

    const channelName = `realtime_transfers_${companyId}_${branchId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_transfer_requests',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, branchId, onUpdate]);
}

