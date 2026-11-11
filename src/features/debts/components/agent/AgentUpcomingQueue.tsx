import React from 'react';
import { ListOrdered, Play, CheckCircle2, Clock, Smartphone } from 'lucide-react';
import type { AgentQueueItem } from '../../services/debtAgentService';

interface Props {
  queue: AgentQueueItem[];
  isLoading: boolean;
  isDraining: boolean;
  onDrainNow: () => void;
}

export const AgentUpcomingQueue: React.FC<Props> = ({
  queue,
  isLoading,
  isDraining,
  onDrainNow,
}) => {
  return (
    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-xs md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] pb-3">
        <div className="flex items-center gap-2">
          <ListOrdered size={16} className="text-cyan-500" />
          <h3 className="text-sm font-extrabold text-[var(--app-text)]">
            طابور المراسلات المجدولة القادمة
          </h3>
          <span className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--app-text-muted)]">
            {queue.length} مستهدف
          </span>
        </div>

        <button
          type="button"
          onClick={onDrainNow}
          disabled={isDraining || queue.length === 0}
          className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-cyan-700 disabled:opacity-50"
          title="تنفيذ الإرسال فوراً لجميع العملاء في الطابور"
        >
          <Play size={13} className={isDraining ? 'animate-spin' : ''} />
          <span>{isDraining ? 'جارٍ الإرسال...' : 'تنفيذ الإرسال الآن'}</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Clock size={20} className="animate-spin text-[var(--app-text-muted)]" />
        </div>
      ) : queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <CheckCircle2 size={28} className="text-emerald-500/80" />
          <h4 className="mt-2 text-xs font-bold text-[var(--app-text)]">
            الطابور فارغ حالياً — لا توجد مراسلات معلقة
          </h4>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-[var(--app-border)] font-mono text-[10px] uppercase text-[var(--app-text-muted)]">
                <th className="py-2.5 font-bold">العميل</th>
                <th className="py-2.5 font-bold">رقم الواتساب</th>
                <th className="py-2.5 font-bold">القناة</th>
                <th className="py-2.5 font-bold">موعد الإرسال</th>
                <th className="py-2.5 font-bold">الحالة</th>
                <th className="py-2.5 font-bold">الرسالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--app-border)]">
              {queue.map(item => (
                <tr
                  key={item.id}
                  className="transition-colors hover:bg-[var(--app-surface-hover)]"
                >
                  <td className="py-2.5 font-bold text-[var(--app-text)]">{item.partyName}</td>
                  <td className="py-2.5 font-mono text-[11px] text-[var(--app-text-muted)]" dir="ltr">
                    {item.partyPhone}
                  </td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <Smartphone size={10} />
                      {item.channel}
                    </span>
                  </td>
                  <td className="py-2.5 font-mono text-[11px] text-[var(--app-text-muted)]" dir="ltr">
                    {item.scheduledFor ? new Date(item.scheduledFor).toLocaleDateString('ar-EG') : 'الدفعة القادمة'}
                  </td>
                  <td className="py-2.5">
                    <span className="rounded-md bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-600 dark:text-cyan-400">
                      {item.status === 'queued' ? 'مجدولة' : item.status}
                    </span>
                  </td>
                  <td className="max-w-xs truncate py-2.5 font-mono text-[11px] text-[var(--app-text-muted)]">
                    {item.messageText}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
