/**
 * خطّاف اشتراك Web Push — يغلّف pushService بحالة قابلة للعرض ورسائل عربية.
 *
 * فصل الرسائل هنا (لا في المكوّن) يحفظ قاعدة «لا تفاصيل بنيوية للمستخدم»:
 * كل سبب فشل يُترجم إلى جملة واحدة مفهومة بدل رمز تقني.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../auth/store';
import { useFeedbackStore } from '../feedback/store';
import {
  getExistingSubscription,
  isPushConfigured,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  type PushFailureReason,
} from './services/pushService';

const failureMessage = (reason: PushFailureReason): string => {
  switch (reason) {
    case 'unsupported':
      return 'هذا المتصفح لا يدعم التنبيهات مع إغلاق المتصفح. استخدم Chrome أو Edge أو Firefox حديثاً.';
    case 'not-configured':
      return 'مفتاح الدفع العام (VAPID) غير مضبوط في هذه النسخة، فالتنبيهات الخارجية معطّلة. راجع مسؤول النظام.';
    case 'permission-denied':
      return 'لم يُسمح بالإشعارات. افتح إعدادات الموقع في المتصفح واسمح بها ثم أعد المحاولة.';
    case 'storage':
      return 'تم الاشتراك في المتصفح لكن تعذّر حفظه في الحساب. تحقّق من الاتصال وأعد المحاولة.';
    default:
      return 'تعذّر الاتصال بخدمة الدفع. تحقّق من الاتصال وأعد المحاولة.';
  }
};

/**
 * يقرأ الاشتراك القائم في المتصفح ويحدّث الحالة، مع حماية من التحديث بعد
 * إلغاء التركيب (المستخدم قد ينتقل لصفحة أخرى قبل وصول الوعد).
 */
const syncExistingSubscription = (setSubscribed: (value: boolean) => void): (() => void) => {
  let active = true;
  void getExistingSubscription()
    .then(subscription => {
      if (active) setSubscribed(subscription !== null);
    })
    .catch(() => {
      if (active) setSubscribed(false);
    });
  return () => {
    active = false;
  };
};

export interface PushSubscriptionState {
  supported: boolean;
  configured: boolean;
  subscribed: boolean;
  busy: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

export const usePushSubscription = (): PushSubscriptionState => {
  const { user } = useAuthStore();
  const showToast = useFeedbackStore(state => state.showToast);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  const supported = isPushSupported();
  const configured = isPushConfigured();

  useEffect(() => {
    if (!supported) return () => undefined;
    return syncExistingSubscription(setSubscribed);
  }, [supported]);

  const enable = useCallback(async (): Promise<void> => {
    const companyId = user?.company_id;
    if (companyId === undefined || companyId === '') {
      showToast('لا توجد منشأة مرتبطة بالجلسة.', 'warning');
      return;
    }
    setBusy(true);
    const result = await subscribeToPush(companyId, user?.id ?? '');
    setBusy(false);
    if (result.ok) {
      setSubscribed(true);
      showToast('تم تفعيل تنبيهات التحصيل — ستصل حتى والمتصفح مغلق.', 'success');
      return;
    }
    showToast(failureMessage(result.reason), 'warning');
  }, [showToast, user?.company_id, user?.id]);

  const disable = useCallback(async (): Promise<void> => {
    setBusy(true);
    await unsubscribeFromPush();
    setBusy(false);
    setSubscribed(false);
    showToast('تم إيقاف تنبيهات التحصيل على هذا الجهاز.', 'info');
  }, [showToast]);

  return { supported, configured, subscribed, busy, enable, disable };
};
