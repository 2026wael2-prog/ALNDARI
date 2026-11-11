import React, { useState } from 'react';
import {
  Activity,
  Radio,
  Power,
  ShieldCheck,
  Clock,
  Smartphone,
  RefreshCw,
  Zap,
  QrCode,
} from 'lucide-react';
import type { AgentTelemetry } from '../../services/debtAgentService';
import { WhatsAppSessionModal } from './WhatsAppSessionModal';

interface Props {
  telemetry?: AgentTelemetry | undefined;
  isLoading: boolean;
  isToggling: boolean;
  onToggleAutonomous: (enabled: boolean) => void;
  onRefresh: () => void;
}

export const AgentMissionControl: React.FC<Props> = ({
  telemetry,
  isLoading,
  isToggling,
  onToggleAutonomous,
  onRefresh,
}) => {
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const isAutonomous = telemetry?.autoSendEnabled ?? false;
  const isQuietHours = telemetry?.isQuietHours ?? false;

  let statusBadge = {
    label: 'نشط ويعمل تلقائياً',
    bg: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400',
    dot: 'bg-emerald-500 animate-pulse',
  };

  if (!isAutonomous) {
    statusBadge = {
      label: 'الوضع اليدوي (متوقف مؤقتاً)',
      bg: 'bg-slate-500/10 text-slate-600 border-slate-500/30 dark:text-slate-400',
      dot: 'bg-slate-400',
    };
  } else if (isQuietHours) {
    const endHour = String(telemetry?.quietHoursWindow.end ?? 8).padStart(2, '0');
    statusBadge = {
      label: `ساعات الهدوء (حتى ${endHour}:00 ص)`,
      bg: 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400',
      dot: 'bg-amber-500',
    };
  }

  return (
    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3.5 shadow-xs md:p-4">
      {/* Top Bar: Identity, Status, Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-cyan-400 dark:bg-black">
            <Radio size={18} className={isAutonomous && !isQuietHours ? 'animate-pulse' : ''} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-extrabold text-[var(--app-text)]">الوكيل الذكي للتحصيل</h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusBadge.bg}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
              {statusBadge.label}
            </span>

            <span className="inline-flex items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--app-text-muted)]">
              <Smartphone size={11} className="text-emerald-500" />
              <span>{telemetry?.storePhone || '967771147694'}</span>
            </span>

            <button
              type="button"
              onClick={() => setIsQrModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
              title="فحص جلسة واتساب ومسح رمز الاستجابة السريعة QR"
            >
              <QrCode size={11} />
              <span>جلسة واتساب (QR)</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--app-text)] hover:bg-[var(--app-surface-hover)] disabled:opacity-50"
            title="تحديث البيانات"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">تحديث</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleAutonomous(!isAutonomous)}
            disabled={isToggling}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold text-white transition disabled:opacity-50 ${
              isAutonomous
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <Power size={13} />
            <span>{isAutonomous ? 'إيقاف المتابعة الآلية' : 'تفعيل المتابعة الآلية'}</span>
          </button>
        </div>
      </div>

      {/* KPI Row (4 Compact Metrics) */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-2.5">
          <div className="flex items-center justify-between text-[11px] text-[var(--app-text-muted)]">
            <span>مراسلات اليوم</span>
            <Activity size={13} className="text-blue-500" />
          </div>
          <div className="mt-1 font-mono text-lg font-black text-[var(--app-text)]">
            {telemetry?.metrics.sentToday ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-2.5">
          <div className="flex items-center justify-between text-[11px] text-[var(--app-text-muted)]">
            <span>الردود الواردة</span>
            <Zap size={13} className="text-purple-500" />
          </div>
          <div className="mt-1 font-mono text-lg font-black text-[var(--app-text)]">
            {telemetry?.metrics.inboundReplies ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-2.5">
          <div className="flex items-center justify-between text-[11px] text-[var(--app-text-muted)]">
            <span>وعود السداد</span>
            <ShieldCheck size={13} className="text-emerald-500" />
          </div>
          <div className="mt-1 font-mono text-lg font-black text-[var(--app-text)]">
            {telemetry?.metrics.promisesDetected ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-2.5">
          <div className="flex items-center justify-between text-[11px] text-[var(--app-text-muted)]">
            <span>طابور الانتظار</span>
            <Clock size={13} className="text-cyan-500" />
          </div>
          <div className="mt-1 font-mono text-lg font-black text-[var(--app-text)]">
            {telemetry?.metrics.pendingQueue ?? 0}
          </div>
        </div>
      </div>

      <WhatsAppSessionModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        onConnected={onRefresh}
      />
    </div>
  );
};
