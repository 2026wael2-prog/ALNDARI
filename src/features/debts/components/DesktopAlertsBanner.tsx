/**
 * شريط تفعيل إشعارات سطح المكتب.
 *
 * لماذا: `showDesktopNotification` تعود بصمت إذا لم تكن الصلاحية ممنوحة،
 * ولم يكن قسم الديون يطلبها إطلاقاً ⇒ المحرك يعمل في الفراغ. المتصفحات
 * الحديثة تُلزم طلب الصلاحية من إيماءة مستخدم حقيقية (نقرة)، لذا لا يصح
 * طلبها تلقائياً عند التحميل.
 */
import React, { useState } from 'react';
import { BellRing, ShieldAlert, X } from 'lucide-react';
import {
  getDesktopNotificationPermission,
  isDesktopNotificationSupported,
  requestDesktopNotificationPermission,
} from '../../notifications/desktopNotificationService';

/** إخفاء الشريط مؤقتاً (يُعاد بعد مسح التخزين المحلي). */
const DISMISS_KEY = 'alzhra:desktop-alert-banner-dismissed';

/** نص الشريط بحسب حالة الصلاحية — مفصول ليبقى المكوّن قصيراً وسهل المراجعة. */
const BannerText: React.FC<{ permission: NotificationPermission }> = ({ permission }) => (
  <div className="flex-1">
    <p className="text-[11px] font-bold">
      {permission === 'denied'
        ? 'إشعارات سطح المكتب محظورة في المتصفح'
        : 'تنبيهات التحصيل لن تصلك خارج التطبيق حتى تسمح بالإشعارات'}
    </p>
    <p className="mt-0.5 text-[10px] leading-relaxed">
      {permission === 'denied'
        ? 'افتح إعدادات الموقع في المتصفح (أيقونة القفل بجانب العنوان) واسمح بالإشعارات، ثم أعد تحميل الصفحة.'
        : 'بدونها تظهر التنبيهات داخل التطبيق فقط، ولن ترى تنبيهاً عندما تكون النافذة مغلقة أو مصغّرة.'}
    </p>
  </div>
);

const readDismissed = (): boolean => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

export const DesktopAlertsBanner: React.FC = () => {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    getDesktopNotificationPermission()
  );
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);

  if (!isDesktopNotificationSupported() || permission === 'granted' || dismissed) return null;

  const handleDismiss = (): void => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // لا شيء: التخزين المحلي قد يكون معطّلاً — الشريط يختفي لهذه الجلسة فقط.
    }
  };

  const handleRequest = async (): Promise<void> => {
    const result = await requestDesktopNotificationPermission();
    setPermission(result);
  };

  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      <span className="mt-0.5 shrink-0">
        {permission === 'denied' ? <ShieldAlert size={15} /> : <BellRing size={15} />}
      </span>
      <BannerText permission={permission} />
      {permission === 'default' && (
        <button
          type="button"
          onClick={() => void handleRequest()}
          className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700"
        >
          تفعيل الإشعارات
        </button>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded-lg p-1 text-amber-700 hover:bg-amber-500/10"
        title="إخفاء"
        aria-label="إخفاء الشريط"
      >
        <X size={13} />
      </button>
    </div>
  );
};

export default DesktopAlertsBanner;
