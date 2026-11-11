/**
 * بطاقة تفعيل تنبيهات Web Push.
 *
 * تُعرض في قسم الديون فقط (المكان الذي يهم فيه المحصّل)، وتحترم غياب الدعم أو
 * غياب تهيئة الخادم بدل إظهار زر يفشل دائماً.
 */
import React from 'react';
import { BellPlus, BellRing, Loader2, Power } from 'lucide-react';
import { cn } from '../../../core/utils';
import { usePushSubscription } from '../../notifications/usePushSubscription';

const cardClass = (subscribed: boolean): string =>
  cn(
    'flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2',
    subscribed
      ? 'border-emerald-300/60 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30'
      : 'border-[var(--app-border)] bg-[var(--app-surface)]'
  );

const actionClass = (subscribed: boolean): string =>
  cn(
    'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    subscribed
      ? 'border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-transparent dark:text-emerald-400'
      : 'bg-blue-600 text-white hover:bg-blue-700'
  );

const cardDescription = (configured: boolean, subscribed: boolean): string => {
  if (!configured) {
    return 'غير مهيّأة على الخادم بعد (مفتاح VAPID مطلوب) — التنبيهات داخل التطبيق تعمل طبيعياً.';
  }
  if (subscribed) {
    return 'مفعّلة على هذا الجهاز — يصلك تنبيه الديون الحرجة حتى ولو كان المتصفح مغلقاً.';
  }
  return 'غير مفعّلة — بعد إغلاق المتصفح لن يصلك أي تنبيه عن الديون الحرجة.';
};

const PushAlertsCard: React.FC = () => {
  const { supported, configured, subscribed, busy, enable, disable } = usePushSubscription();

  // متصفح بلا دعم: لا نُشغل مساحة بلا فائدة (شريط صلاحيات سطح المكتب يغطي البديل).
  if (!supported) return null;

  const handleToggle = (): void => {
    if (subscribed) {
      void disable();
      return;
    }
    void enable();
  };

  return (
    <div className={cardClass(subscribed)}>
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-0.5 shrink-0',
            subscribed ? 'text-emerald-600' : 'text-[var(--app-text-secondary)]'
          )}
        >
          {subscribed ? <BellRing size={15} /> : <BellPlus size={15} />}
        </span>
        <div>
          <p className="text-[11px] font-bold text-[var(--app-text)]">
            تنبيهات التحصيل مع إغلاق المتصفح
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--app-text-secondary)]">
            {cardDescription(configured, subscribed)}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={busy || !configured}
        onClick={handleToggle}
        className={actionClass(subscribed)}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
        {subscribed ? 'إيقاف على هذا الجهاز' : 'تفعيل التنبيهات'}
      </button>
    </div>
  );
};

export { PushAlertsCard };
export default PushAlertsCard;
