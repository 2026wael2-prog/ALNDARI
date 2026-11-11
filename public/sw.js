/* ============================================================================
 * Al-Zahra Smart ERP — Service Worker (Web Push فقط)
 * ============================================================================
 * هذا العامل لا يعترض أي طلب شبكة (لا fetch handler) — غايته الوحيدة استقبال
 * دفعات Web Push من Edge Function `debt-push-dispatch` وإظهارها كنظام تنبيه
 * حتى لو كان التطبيق مغلقاً، ثم فتح الشاشة الصحيحة عند النقر.
 *
 * ملاحظة التوجيه: التطبيق يستخدم HashRouter، لذا الروابط تأتي بالشكل
 * `/debts/followup` ويجب تحويلها إلى `/#/debts/followup` حتى يعمل openWindow.
 * ========================================================================== */

const DEFAULT_ICON = '/pwa-icon-192.png';

/** يحوّل مسار التطبيق إلى رابط كامل متوافق مع HashRouter. */
function toHashUrl(link) {
  if (typeof link !== 'string' || link.length === 0) return `${self.location.origin}/#/`;
  if (link.startsWith('http')) return link;
  if (link.startsWith('/#')) return `${self.location.origin}${link}`;
  return `${self.location.origin}/#${link.startsWith('/') ? link : `/${link}`}`;
}

self.addEventListener('install', () => {
  // تنشيط فوري: الاشتراك في الدفع لا يجب أن ينتظر إغلاق كل تبويب.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let payload = {
    title: 'الجعفري ERP — تحصيل الديون',
    body: 'لديك مديونية تحتاج إجراءً اليوم.',
    link: '/debts',
    tag: 'alzhra-debt-push',
    requireInteraction: true,
  };

  try {
    if (event.data) {
      const incoming = event.data.json();
      payload = { ...payload, ...incoming };
    }
  } catch {
    // حمولة نصية أو تالفة: نبقى على النص الافتراضي بدل إسقاط التنبيه كلياً.
    const text = event.data ? event.data.text() : '';
    if (text) payload.body = text.slice(0, 300);
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || DEFAULT_ICON,
      badge: DEFAULT_ICON,
      tag: payload.tag,
      // التنبيهات الحرجة تبقى على الشاشة حتى يتفاعل المستخدم.
      requireInteraction: payload.requireInteraction !== false,
      dir: 'rtl',
      lang: 'ar',
      data: { link: payload.link },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const link = event.notification.data && event.notification.data.link;

  event.waitUntil(
    (async () => {
      const target = self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const windows = await target;

      for (const client of windows) {
        if (client.url.indexOf(self.location.origin) === 0) {
          await client.focus();
          // التطبيق مفتوح: نطلب منه الانتقال داخلياً بدل إعادة تحميل الصفحة.
          client.postMessage({ type: 'alzhra-navigate', link });
          return;
        }
      }
      await self.clients.openWindow(toHashUrl(link));
    })()
  );
});
