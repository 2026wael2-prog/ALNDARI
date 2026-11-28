import { useEffect, useState, type ReactElement } from 'react';
import { RefreshCw, Server, CloudOff } from 'lucide-react';
import { useConnectionStore } from '../../core/store/connectionStore';
import { useOfflineQueueStatus } from '../../core/sync/offlineMutationQueue';
import { syncStore, SYNC_STORE_CHANGED_EVENT } from '../../core/lib/sync-store';
import { OfflineOutboxDrawer } from './OfflineOutboxDrawer';
import { cn } from '../../core/utils';

type SyncDisplayStatus = 'connected' | 'connecting' | 'disconnected' | 'local_failover' | 'syncing';

interface StatusVisualConfig {
  dot: string;
  pulse: boolean;
  label: string;
  title: string;
}

const getStatusConfig = (
  status: SyncDisplayStatus,
  branchCode: string | null,
  lastMirrorSyncAt: string | null
): StatusVisualConfig => {
  const code = branchCode ?? 'B1';
  const mirrorHint =
    typeof lastMirrorSyncAt === 'string' && lastMirrorSyncAt !== ''
      ? ` | مرآة ${code} محدّثة ${new Date(lastMirrorSyncAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
      : '';

  switch (status) {
    case 'local_failover':
      return {
        dot: 'bg-amber-500',
        pulse: true,
        label: `وضع محلي (${code})`,
        title: `العمل مستمر من الخادم المحلي لفرع ${code} أثناء انقطاع السحابة`,
      };
    case 'syncing':
      return {
        dot: 'bg-blue-500',
        pulse: true,
        label: 'مزامنة...',
        title: 'جاري ترحيل العمليات المحلية إلى السحابة بالترتيب',
      };
    case 'connected':
      return {
        dot: 'bg-emerald-500',
        pulse: true,
        label: 'مباشر',
        title: `المزامنة المباشرة متصلة — البيانات تُحدَّث لحظيًا${mirrorHint}`,
      };
    case 'connecting':
      return {
        dot: 'bg-amber-400',
        pulse: true,
        label: 'جارٍ الاتصال',
        title: `جارٍ الاتصال بقناة المزامنة المباشرة…${mirrorHint}`,
      };
    case 'disconnected':
      return {
        dot: 'bg-rose-500',
        pulse: false,
        label: 'تحديث دوري',
        title: `المزامنة المباشرة منقطعة — يتم تحديث البيانات كل 60 ثانية تلقائيًا${mirrorHint}`,
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

const PendingSyncBadge: React.FC<{
  count: number;
  isSyncing: boolean;
  onClick: () => void;
}> = ({ count, isSyncing, onClick }) => {
  if (count <= 0) return null;
  const countText = String(count);
  return (
    <button
      type="button"
      onClick={onClick}
      className="animate-in fade-in flex select-none items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
      title={`يوجد ${countText} عملية مخزنة محلياً في انتظار المزامنة مع الخادم — انقر للعرض`}
    >
      <RefreshCw size={10} className={cn('shrink-0', isSyncing && 'animate-spin')} />
      <span>{countText} قيد المزامنة</span>
    </button>
  );
};

const resolveDisplayStatus = (
  connectionMode: string,
  realtimeStatus: SyncDisplayStatus
): SyncDisplayStatus => {
  if (connectionMode === 'local_failover') return 'local_failover';
  if (connectionMode === 'syncing') return 'syncing';
  return realtimeStatus;
};

const StatusGlyph = ({
  displayStatus,
  pulse,
  dot,
}: {
  displayStatus: SyncDisplayStatus;
  pulse: boolean;
  dot: string;
}): ReactElement =>
  displayStatus === 'local_failover' ? (
    <CloudOff size={11} className="shrink-0 text-amber-600" />
  ) : (
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
  );

// eslint-disable-next-line max-lines-per-function
const RealtimeStatusIndicator = (): ReactElement => {
  const realtimeStatus = useConnectionStore(s => s.realtimeStatus);
  const connectionMode = useConnectionStore(s => s.connectionMode);
  const edgeAvailable = useConnectionStore(s => s.edgeAvailable);
  const edgeBranchCode = useConnectionStore(s => s.edgeBranchCode);
  const edgePendingOutbox = useConnectionStore(s => s.pendingOutboxCount);
  const lastMirrorSyncAt = useConnectionStore(s => s.lastMirrorSyncAt);

  const { pendingCount: queuePendingCount, isSyncing } = useOfflineQueueStatus();
  const syncStorePending = useSyncStorePendingCount();
  const pendingCount = Math.max(queuePendingCount, syncStorePending, edgePendingOutbox);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const displayStatus = resolveDisplayStatus(connectionMode, realtimeStatus);
  const code = edgeBranchCode ?? 'B1';
  const { dot, pulse, label, title } = getStatusConfig(displayStatus, edgeBranchCode, lastMirrorSyncAt);

  const labelColorClass =
    displayStatus === 'local_failover'
      ? 'text-amber-800 dark:text-amber-200'
      : displayStatus === 'disconnected'
        ? 'text-rose-500'
        : 'hidden text-[var(--app-text-secondary)] sm:inline';

  return (
    <>
      <div className="flex items-center gap-1.5" role="status" aria-live="polite">
        <button
          type="button"
          onClick={() => {
            setDrawerOpen(true);
          }}
          className={cn(
            'flex select-none items-center gap-1 rounded-full border px-1.5 py-1 transition-colors sm:gap-1.5 sm:px-2',
            displayStatus === 'local_failover'
              ? 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200'
              : 'border-[var(--app-border)] bg-[var(--app-bg)] hover:bg-[var(--app-surface-hover)]'
          )}
          title={title}
          aria-label={title}
        >
          <StatusGlyph displayStatus={displayStatus} pulse={pulse} dot={dot} />
          <span className={cn('text-[10px] font-bold', labelColorClass)}>{label}</span>
          {edgeAvailable && (
            <span
              className="hidden items-center gap-0.5 rounded bg-emerald-500/15 px-1 text-[9px] font-extrabold text-emerald-700 dark:text-emerald-300 md:inline-flex"
              title={`خادم فرع ${code} المحلي نشط`}
            >
              <Server size={9} />
              <span>{code}</span>
            </span>
          )}
        </button>

        <PendingSyncBadge
          count={pendingCount}
          isSyncing={isSyncing || connectionMode === 'syncing'}
          onClick={() => {
            setDrawerOpen(true);
          }}
        />
      </div>

      <OfflineOutboxDrawer
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
        }}
      />
    </>
  );
};

export default RealtimeStatusIndicator;
