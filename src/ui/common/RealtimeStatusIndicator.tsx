import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useConnectionStore } from '../../core/store/connectionStore';
import { useOfflineQueueStatus } from '../../core/sync/offlineMutationQueue';
import { syncStore, SYNC_STORE_CHANGED_EVENT } from '../../core/lib/sync-store';
import { cn } from '../../core/utils';

/**
 * RealtimeStatusIndicator
 * ─────────────────────────────────────────────────────────────
 * Always-visible live-sync and offline-queue health indicator in the app header.
 *
 *  - connected    → emerald pulsing dot  (live sync active)
 *  - connecting   → amber pulsing dot    (establishing channel)
 *  - disconnected → rose dot + label     (60s fallback polling)
 *  - pending sync → amber badge with counter (offline operations awaiting sync)
 * ─────────────────────────────────────────────────────────────
 */
type SyncDisplayStatus = 'connected' | 'connecting' | 'disconnected';

interface StatusVisualConfig {
  dot: string;
  pulse: boolean;
  label: string;
  title: string;
}

const getStatusConfig = (status: SyncDisplayStatus): StatusVisualConfig => {
  switch (status) {
    case 'connected':
      return {
        dot: 'bg-emerald-500',
        pulse: true,
        label: 'مباشر',
        title: 'المزامنة المباشرة متصلة — البيانات تُحدَّث لحظيًا',
      };
    case 'connecting':
      return {
        dot: 'bg-amber-400',
        pulse: true,
        label: 'جارٍ الاتصال',
        title: 'جارٍ الاتصال بقناة المزامنة المباشرة…',
      };
    case 'disconnected':
      return {
        dot: 'bg-rose-500',
        pulse: false,
        label: 'تحديث دوري',
        title: 'المزامنة المباشرة منقطعة — يتم تحديث البيانات كل 60 ثانية تلقائيًا',
      };
  }
};

const useSyncStorePendingCount = (): number => {
  const [syncStorePending, setSyncStorePending] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = (): void => {
      syncStore
        .getPending()
        .then(items => {
          if (active) setSyncStorePending(items.length);
        })
        .catch(() => undefined);
    };

    refresh();
    window.addEventListener(SYNC_STORE_CHANGED_EVENT, refresh);
    window.addEventListener('online', refresh);
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      window.removeEventListener(SYNC_STORE_CHANGED_EVENT, refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return syncStorePending;
};

const PendingSyncBadge: React.FC<{ count: number; isSyncing: boolean }> = ({ count, isSyncing }) => {
  if (count <= 0) return null;
  const countText = String(count);
  return (
    <div
      className="animate-in fade-in flex select-none items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-600 dark:text-amber-400"
      title={`يوجد ${countText} عملية مخزنة محلياً في انتظار المزامنة مع الخادم`}
    >
      <RefreshCw size={10} className={cn('shrink-0', isSyncing && 'animate-spin')} />
      <span>{countText} قيد المزامنة</span>
    </div>
  );
};

const RealtimeStatusIndicator: React.FC = () => {
  const realtimeStatus = useConnectionStore(s => s.realtimeStatus);
  const { pendingCount: queuePendingCount, isSyncing } = useOfflineQueueStatus();
  const syncStorePending = useSyncStorePendingCount();
  const pendingCount = Math.max(queuePendingCount, syncStorePending);
  const { dot, pulse, label, title } = getStatusConfig(realtimeStatus);

  return (
    <div className="flex items-center gap-1.5">
      {/* Realtime Live Sync Status */}
      <div
        className="flex select-none items-center gap-1 rounded-full border border-[var(--app-border)] bg-[var(--app-bg)] px-1.5 py-1 transition-colors sm:gap-1.5 sm:px-2"
        title={title}
        role="status"
        aria-live="polite"
        aria-label={title}
      >
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span
              className={cn(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                dot
              )}
            />
          )}
          <span className={cn('relative inline-flex h-2 w-2 rounded-full', dot)} />
        </span>
        <span
          className={cn(
            'text-[10px] font-bold',
            realtimeStatus === 'disconnected'
              ? 'text-rose-500'
              : 'hidden text-[var(--app-text-secondary)] sm:inline'
          )}
        >
          {label}
        </span>
      </div>

      <PendingSyncBadge count={pendingCount} isSyncing={isSyncing} />
    </div>
  );
};

export default RealtimeStatusIndicator;
