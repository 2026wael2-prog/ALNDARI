import React, { useState, useEffect } from 'react';
import { Sliders, Moon, ShieldAlert, Save, BellRing } from 'lucide-react';
import type { DebtFollowupConfig, DebtFollowupConfigUpdate } from '../../types';

interface Props {
  config: DebtFollowupConfig | null | undefined;
  isSaving: boolean;
  onSave: (updates: DebtFollowupConfigUpdate) => void;
}

export const AgentGovernancePanel: React.FC<Props> = ({ config, isSaving, onSave }) => {
  const [quietStart, setQuietStart] = useState<number>(config?.quiet_start_hour ?? 21);
  const [quietEnd, setQuietEnd] = useState<number>(config?.quiet_end_hour ?? 8);
  const [dailyCap, setDailyCap] = useState<number>(config?.daily_cap_per_party ?? 1);
  const [reminderWindowDays, setReminderWindowDays] = useState<number>(
    config?.reminder_window_days ?? 3
  );
  const [dueSoonDays, setDueSoonDays] = useState<number>(config?.due_soon_days ?? 7);
  const [criticalDays, setCriticalDays] = useState<number>(config?.critical_days ?? 30);
  const [preferredChannel, setPreferredChannel] = useState<'whatsapp' | 'sms'>(
    config?.preferred_channel === 'sms' ? 'sms' : 'whatsapp'
  );

  useEffect(() => {
    if (config) {
      setQuietStart(config.quiet_start_hour ?? 21);
      setQuietEnd(config.quiet_end_hour ?? 8);
      setDailyCap(config.daily_cap_per_party ?? 1);
      setReminderWindowDays(config.reminder_window_days ?? 3);
      setDueSoonDays(config.due_soon_days ?? 7);
      setCriticalDays(config.critical_days ?? 30);
      setPreferredChannel(config.preferred_channel === 'sms' ? 'sms' : 'whatsapp');
    }
  }, [config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      quiet_start_hour: quietStart,
      quiet_end_hour: quietEnd,
      daily_cap_per_party: dailyCap,
      reminder_window_days: reminderWindowDays,
      due_soon_days: dueSoonDays,
      critical_days: criticalDays,
      preferred_channel: preferredChannel,
    });
  };

  return (
    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-xs md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] pb-3">
        <div className="flex items-center gap-2">
          <Sliders size={16} className="text-blue-500" />
          <h3 className="text-sm font-extrabold text-[var(--app-text)]">
            سياسات وقواعد عمل الوكيل
          </h3>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={13} />
          <span>{isSaving ? 'جارٍ الحفظ...' : 'حفظ السياسات'}</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* Controls Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Quiet Hours */}
          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
              <Moon size={13} className="text-amber-500" />
              <span>ساعات الهدوء الليلي</span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-[var(--app-text-muted)]">من الساعة:</label>
                <select
                  value={quietStart}
                  onChange={e => setQuietStart(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 font-mono text-xs font-bold text-[var(--app-text)] focus:outline-none"
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, '0')}:00 {i >= 12 ? 'مساءً' : 'صباحاً'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-[var(--app-text-muted)]">إلى الساعة:</label>
                <select
                  value={quietEnd}
                  onChange={e => setQuietEnd(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 font-mono text-xs font-bold text-[var(--app-text)] focus:outline-none"
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, '0')}:00 {i >= 12 ? 'مساءً' : 'صباحاً'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Anti-Spam Daily Cap */}
          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
              <ShieldAlert size={13} className="text-blue-500" />
              <span>سقف التكرار (Anti-Spam)</span>
            </div>
            <div className="mt-2.5">
              <label className="block text-[10px] text-[var(--app-text-muted)]">
                الحد الأقصى للرسائل يومياً لكل عميل:
              </label>
              <select
                value={dailyCap}
                onChange={e => setDailyCap(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 font-mono text-xs font-bold text-[var(--app-text)] focus:outline-none"
              >
                <option value={1}>رسالة واحدة فقط (موصى به)</option>
                <option value={2}>رسالتان كحد أقصى</option>
                <option value={3}>3 رسائل (حالات حرجة)</option>
              </select>
            </div>
          </div>

          {/* Cooldown Window */}
          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
              <BellRing size={13} className="text-emerald-500" />
              <span>نافذة التهدئة بين التذكيرات</span>
            </div>
            <div className="mt-2.5">
              <label className="block text-[10px] text-[var(--app-text-muted)]">
                الفاصل الزمني بين كل تذكير وآخر:
              </label>
              <select
                value={reminderWindowDays}
                onChange={e => setReminderWindowDays(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 font-mono text-xs font-bold text-[var(--app-text)] focus:outline-none"
              >
                <option value={1}>يوم واحد</option>
                <option value={2}>يومان</option>
                <option value={3}>3 أيام (افتراضي متوازن)</option>
                <option value={5}>5 أيام</option>
                <option value={7}>أسبوع كامل</option>
              </select>
            </div>
          </div>

          {/* Channel & Threshold */}
          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
              <Sliders size={13} className="text-purple-500" />
              <span>قناة المراسلة والتعثر</span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-[var(--app-text-muted)]">القناة:</label>
                <select
                  value={preferredChannel}
                  onChange={e => setPreferredChannel(e.target.value as 'whatsapp' | 'sms')}
                  className="mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-xs font-bold text-[var(--app-text)] focus:outline-none"
                >
                  <option value="whatsapp">واتساب (UltraMsg)</option>
                  <option value="sms">رسائل SMS</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-[var(--app-text-muted)]">أيام التعثر الحرج:</label>
                <input
                  type="number"
                  value={criticalDays}
                  onChange={e => setCriticalDays(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 font-mono text-xs font-bold text-[var(--app-text)] focus:outline-none"
                  min={1}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Compact Escalation Stepper (No verbose paragraphs) */}
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
          <div className="mb-2 text-xs font-bold text-[var(--app-text)]">
            مراحل التذكير والتصعيد حسب عمر المديونية
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                1
              </span>
              <div className="text-[11px]">
                <div className="font-bold text-emerald-700 dark:text-emerald-300">تذكير ودي</div>
                <div className="text-[10px] text-[var(--app-text-muted)]">قبل الاستحقاق بـ {dueSoonDays} أيام</div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-2.5 py-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                2
              </span>
              <div className="text-[11px]">
                <div className="font-bold text-blue-700 dark:text-blue-300">متابعة رسمية</div>
                <div className="text-[10px] text-[var(--app-text-muted)]">تأخير 1 - 15 يوماً</div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                3
              </span>
              <div className="text-[11px]">
                <div className="font-bold text-amber-700 dark:text-amber-300">إنذار مالي</div>
                <div className="text-[10px] text-[var(--app-text-muted)]">تأخير 16 - {criticalDays} يوماً</div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-2.5 py-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                4
              </span>
              <div className="text-[11px]">
                <div className="font-bold text-rose-700 dark:text-rose-300">إجراء حرج</div>
                <div className="text-[10px] text-[var(--app-text-muted)]">أكثر من {criticalDays} يوماً</div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
