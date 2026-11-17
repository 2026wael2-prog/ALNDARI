import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateByPreset } from '../../../lib/invalidation';
import { supabase } from '../../../lib/supabaseClient';
import { useFeedbackStore } from '../../feedback/store';

interface GlobalDashboardWindow extends Window {
  __ALZ_DASHBOARD_CHANNELS__?: Map<string, unknown>;
}

/** Subscribes synchronously to realtime invoice and expense inserts for the dashboard. */
export function useDashboardRealtime(companyId: string | undefined, branchId: string | null) {
  const queryClient = useQueryClient();
  const { showToast } = useFeedbackStore();
  const branchIdRef = useRef<string | null>(branchId);

  useEffect(() => {
    branchIdRef.current = branchId;
  }, [branchId]);

  useEffect(() => {
    if (!companyId) return;
    const channelKey = `dashboard_sales_${companyId}`;
    const globalWin = window as GlobalDashboardWindow;
    if (!globalWin.__ALZ_DASHBOARD_CHANNELS__) {
      globalWin.__ALZ_DASHBOARD_CHANNELS__ = new Map<string, unknown>();
    }
    const registry = globalWin.__ALZ_DASHBOARD_CHANNELS__;

    if (!registry.has(channelKey)) {
      const channel = supabase
        .channel(channelKey)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'invoices',
            filter: `company_id=eq.${companyId}`,
          },
          (payload: { new?: { branch_id?: string | null; type?: string; total_amount?: number } }) => {
            const activeBr = branchIdRef.current;
            const matchesBranch =
              activeBr === null || activeBr === '' || payload.new?.branch_id === activeBr;
            if (payload.new?.type === 'sale') {
              if (matchesBranch) {
                showToast(`مبيعات جديدة بقيمة ${payload.new.total_amount} ر.س`, 'success');
              }
              invalidateByPreset(queryClient, 'sale', { primaryOnlyRefetch: true });
            } else if (
              payload.new?.type === 'purchase' ||
              payload.new?.type === 'purchase_return'
            ) {
              invalidateByPreset(queryClient, 'purchase', { primaryOnlyRefetch: true });
            } else {
              invalidateByPreset(queryClient, 'sale', { primaryOnlyRefetch: true });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'expenses',
            filter: `company_id=eq.${companyId}`,
          },
          () => {
            invalidateByPreset(queryClient, 'expense', { primaryOnlyRefetch: true });
          }
        )
        .subscribe();
      registry.set(channelKey, channel);
    }

    return () => {
      /* channel intentionally kept alive per company session */
    };
  }, [companyId, queryClient, showToast]);
}
