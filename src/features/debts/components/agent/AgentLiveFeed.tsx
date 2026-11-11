import React, { useState } from 'react';
import { Terminal, Send, Handshake, Check, AlertCircle } from 'lucide-react';
import type { AgentActivityItem } from '../../services/debtAgentService';

interface Props {
  activities: AgentActivityItem[];
  isLoading: boolean;
}

export const AgentLiveFeed: React.FC<Props> = ({ activities, isLoading }) => {
  const [filter, setFilter] = useState<'all' | 'dispatch' | 'promise'>('all');

  const filtered = activities.filter(a => {
    if (filter === 'dispatch') return a.tag === 'DISPATCH';
    if (filter === 'promise') return a.tag === 'PROMISE';
    return true;
  });

  return (
    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-xs md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] pb-3">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-purple-500" />
          <h3 className="text-sm font-extrabold text-[var(--app-text)]">
            سجل المراقبة والرصد المباشر
          </h3>
          <span className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--app-text-muted)]">
            {activities.length} نشاط
          </span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-1 text-[11px] font-bold">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-lg px-2.5 py-1 transition ${
              filter === 'all'
                ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
            }`}
          >
            الكل ({activities.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('dispatch')}
            className={`rounded-lg px-2.5 py-1 transition ${
              filter === 'dispatch'
                ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
            }`}
          >
            المراسلات
          </button>
          <button
            type="button"
            onClick={() => setFilter('promise')}
            className={`rounded-lg px-2.5 py-1 transition ${
              filter === 'promise'
                ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
            }`}
          >
            وعود السداد
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 font-mono text-xs text-[var(--app-text-muted)]">
          جاري استدعاء السجل المباشر...
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center font-mono text-xs text-[var(--app-text-muted)]">
          لا توجد أنشطة مسجلة في هذا التصنيف.
        </div>
      ) : (
        <div className="mt-3 divide-y divide-[var(--app-border)] font-mono text-xs">
          {filtered.map(item => (
            <div
              key={item.id}
              className="flex flex-col gap-1.5 py-2.5 transition-colors hover:bg-[var(--app-surface-hover)] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-2">
                {item.tag === 'PROMISE' ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    <Handshake size={11} />
                    <span>وعد</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                    <Send size={11} />
                    <span>إرسال</span>
                  </span>
                )}

                <span className="font-bold text-[var(--app-text)]">{item.partyName}</span>
                <span className="text-[10px] text-[var(--app-text-muted)]" dir="ltr">
                  {item.partyPhone}
                </span>

                {item.intentNote && (
                  <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400">
                    {item.intentNote}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="max-w-xs truncate font-sans text-[11px] text-[var(--app-text-muted)] sm:max-w-md">
                  {item.message}
                </span>

                <div className="flex shrink-0 items-center gap-1 text-[10px]">
                  {item.status === 'delivered' ? (
                    <span className="inline-flex items-center gap-0.5 font-bold text-emerald-600 dark:text-emerald-400">
                      <Check size={11} />
                      <Check size={11} className="-mr-1.5" />
                    </span>
                  ) : item.status === 'sent' ? (
                    <span className="inline-flex items-center text-blue-500">
                      <Check size={11} />
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-rose-500">
                      <AlertCircle size={11} />
                    </span>
                  )}
                  <span className="text-[var(--app-text-muted)]" dir="ltr">
                    {new Date(item.timestamp).toLocaleTimeString('ar-EG', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
