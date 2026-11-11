/**
 * Web Push — تسجيل Service Worker وإدارة اشتراك المتصفح.
 *
 * الفرق عن إشعارات سطح المكتب: `new Notification()` يعيش داخل الصفحة ويموت
 * بإغلاق التبويب. Web Push يمرّ عبر Service Worker ونقطة نهاية دفع، فيصل
 * التنبيه والتطبيق مغلق — وهذا ما يطلبه التشغيل الفعلي للتحصيل.
 *
 * طبقة الخدمة هي المكان المسموح فيه بالوصول إلى Supabase (Component → Hook →
 * Service → API → Supabase)؛ لا تستوردها أي شاشة مباشرة بل عبر خطّاف.
 */
import { supabase } from '../../../lib/supabaseClient';
import { logger } from '../../../core/utils/logger';

const SW_PATH = '/sw.js';
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();

export type PushFailureReason =
  | 'unsupported'
  | 'not-configured'
  | 'permission-denied'
  | 'network'
  | 'storage';

export type PushSubscribeResult = { ok: true } | { ok: false; reason: PushFailureReason };

/** هل المتصفح يدعم Service Worker + PushManager + الإشعارات؟ */
export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** هل المفتاح العام لـ VAPID مضبوط في بيئة البناء؟ */
export const isPushConfigured = (): boolean => VAPID_PUBLIC_KEY.length > 0;

/** تحويل مفتاح VAPID (base64url) إلى البايتات التي يتوقعها PushManager. */
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  // البناء من ArrayBuffer صريح (لا من طول) كي يكون الناتج BufferSource مقبولاً
  // دون كسر صرامة الأنواع في إصدارات TypeScript التي تُعمّم Uint8Array على
  // ArrayBufferLike (يتضمن SharedArrayBuffer غير المقبول في PushManager).
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
};

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
    if (existing !== undefined && existing !== null) return existing;
    return await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
  } catch (err) {
    logger.warn('Push', 'Service worker registration failed', err);
    return null;
  }
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const registration = await registerPushServiceWorker();
  if (registration === null) return null;
  return registration.pushManager.getSubscription();
}

/**
 * جدول جديد غير موجود في الأنواع المولَّدة بعد (هجرة 20261103000005).
 * توقيع ضيّق بدل `any` للحفاظ على صرامة الأنواع في بقية الملف.
 */
interface PushTableClient {
  upsert(
    values: Record<string, unknown>,
    options: { onConflict: string }
  ): PromiseLike<{ error: Error | null }>;
  delete(): { eq(column: string, value: string): PromiseLike<{ error: Error | null }> };
}

const pushTable = (): PushTableClient =>
  (supabase.from as unknown as (table: string) => PushTableClient)('push_subscriptions');

export async function subscribeToPush(
  companyId: string,
  userId: string
): Promise<PushSubscribeResult> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  if (!isPushConfigured()) return { ok: false, reason: 'not-configured' };

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'permission-denied' };

  const registration = await registerPushServiceWorker();
  if (registration === null) return { ok: false, reason: 'unsupported' };

  try {
    await navigator.serviceWorker.ready;

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // تضييق مقصود: TypeScript يُعمّم Uint8Array على ArrayBufferLike بينما
        // PushManager يقبل ArrayBufferView<ArrayBuffer> فقط. البايتات هنا مبنية
        // من ArrayBuffer صريح، فالتوافق وقت التشغيل مضمون.
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      }));

    const json = subscription.toJSON();
    const endpoint = json.endpoint ?? null;
    const p256dh = json.keys?.p256dh ?? null;
    const auth = json.keys?.auth ?? null;
    if (endpoint === null || p256dh === null || auth === null) {
      return { ok: false, reason: 'storage' };
    }

    const { error } = await pushTable().upsert(
      {
        company_id: companyId,
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent.slice(0, 300),
        revoked_at: null,
      },
      { onConflict: 'endpoint' }
    );

    if (error) {
      logger.error('Push', 'Failed to persist push subscription', error);
      return { ok: false, reason: 'storage' };
    }
    return { ok: true };
  } catch (err) {
    logger.error('Push', 'Push subscription failed', err);
    return { ok: false, reason: 'network' };
  }
}

/** إلغاء الاشتراك: إبطال المتصفح ثم حذف الصف (RLS تسمح لصاحبه فقط). */
export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (subscription === null) return;
  const endpoint = subscription.endpoint;
  try {
    await subscription.unsubscribe();
    const { error } = await pushTable().delete().eq('endpoint', endpoint);
    if (error) logger.warn('Push', 'Failed to delete push subscription row', error);
  } catch (err) {
    logger.warn('Push', 'Unsubscribe failed', err);
  }
}
