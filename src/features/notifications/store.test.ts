import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * انحدار: عيب «الإشعار يظهر مرة واحدة ثم يصمت للأبد».
 *
 * السبب الجذري كان في `store.addNotification`: فرع منع التكرار بالوسم يُرجع
 * قبل استدعاء showDesktopNotification، والوسوم ثابتة (debt_critical_summary)
 * ⇒ أي تحديث لاحق للحالة نفسها لا يُظهر إشعار نظام إطلاقاً.
 */

const showDesktopNotification = vi.fn((_payload?: unknown) => null);

vi.mock('./desktopNotificationService', () => ({
  showDesktopNotification: (...args: unknown[]) => showDesktopNotification(...args),
}));

import { useNotificationStore, useSoundStore } from './store';

const COMPANY_ID = 'company-1';

const addCritical = (message: string, priority?: 'high' | 'urgent'): void => {
  useNotificationStore.getState().addNotification({
    companyId: COMPANY_ID,
    tag: 'debt_critical_summary',
    category: 'debt',
    ...(priority !== undefined ? { priority } : {}),
    title: 'ديون حرجة تحتاج تدخلاً فورياً',
    message,
    type: 'warning',
  });
};

const desktopCalls = (): Array<Record<string, unknown>> =>
  showDesktopNotification.mock.calls.map(call => call[0] as Record<string, unknown>);

describe('useNotificationStore.addNotification — إشعار سطح المكتب', () => {
  beforeEach(() => {
    showDesktopNotification.mockClear();
    useNotificationStore.setState({ notifications: [], unreadCount: 0, desktopEnabled: true });
    // jsdom بلا AudioContext — نُطفئ الصوت كي لا يتشعّب الاختبار عن هدفه.
    useSoundStore.setState({ isSoundEnabled: false });
  });

  it('يُظهر إشعار نظام عند وصول تنبيه جديد', () => {
    addCritical('٢ عميل تجاوزوا الحد الحرج.');

    expect(showDesktopNotification).toHaveBeenCalledTimes(1);
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it('لا يُزعج المستخدم عندما يُعيد نفس المحتوى (كل 5 دقائق)', () => {
    addCritical('٢ عميل تجاوزوا الحد الحرج.');
    addCritical('٢ عميل تجاوزوا الحد الحرج.');

    expect(showDesktopNotification).toHaveBeenCalledTimes(1);
    // الصف لا يتكرر في القائمة
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it('يُظهر إشعاراً جديداً عندما يتغيّر المحتوى رغم تطابق الوسم (العيب الأصلي)', () => {
    addCritical('٢ عميل تجاوزوا الحد الحرج.');
    addCritical('٥ عملاء تجاوزوا الحد الحرج (أقصى تأخير 62 يوماً).');

    expect(showDesktopNotification).toHaveBeenCalledTimes(2);
    // يبقى صف واحد في القائمة (تحديث لا تكرار)
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it('يولّد وسماً متمايزاً لكل محتوى كي لا يبتلع نظام التشغيل التحديث', () => {
    addCritical('٢ عميل.');
    addCritical('٣ عملاء.');

    const [first, second] = desktopCalls();
    expect(String(first.tag)).toMatch(/^debt_critical_summary:/);
    expect(String(second.tag)).toMatch(/^debt_critical_summary:/);
    expect(first.tag).not.toBe(second.tag);
  });

  it('يمرر requireInteraction فقط للأولوية الحرجة', () => {
    addCritical('٢ عميل.', 'high');
    expect(desktopCalls()[0]?.requireInteraction).toBe(false);

    showDesktopNotification.mockClear();
    useNotificationStore.setState({ notifications: [], unreadCount: 0 });
    addCritical('٢ عميل.', 'urgent');
    expect(desktopCalls()[0]?.requireInteraction).toBe(true);
  });

  it('يحترم إيقاف إشعارات سطح المكتب من الإعدادات', () => {
    useNotificationStore.setState({ desktopEnabled: false });
    addCritical('٢ عميل.');
    expect(showDesktopNotification).not.toHaveBeenCalled();
  });
});
