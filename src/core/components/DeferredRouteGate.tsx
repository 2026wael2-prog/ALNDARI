import React, { useEffect, useState } from 'react';
import PageLoader, { type PageLoaderVariant } from '../../ui/base/PageLoader';

interface DeferredRouteGateProps {
  children: React.ReactNode;
  /** Delay in milliseconds before mounting the page and firing its data queries. Default 450ms. */
  delayMs?: number;
  variant?: PageLoaderVariant;
}

/**
 * DeferredRouteGate — بوابة تأخير جلب البيانات للشاشات غير الأساسية.
 *
 * تؤخّر تركيب الصفحة وإطلاق استعلامات البيانات لفترة وجيزة حتى يستقر التنقل والرسم،
 * وإذا انتقل المستخدم سريعاً إلى إحدى الشاشات الأساسية (المبيعات، المشتريات، المنتجات،
 * السندات، العملاء، كشف الحسابات) لا تُطلق أي طلبات شبكة غير ضرورية للشاشات العابرة.
 */
export const DeferredRouteGate: React.FC<DeferredRouteGateProps> = ({
  children,
  delayMs = 450,
  variant = 'default',
}) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let idleId: number | undefined;
    const timer = window.setTimeout(() => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(
          () => {
            setReady(true);
          },
          { timeout: 300 }
        );
      } else {
        setReady(true);
      }
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      if (idleId !== undefined && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [delayMs]);

  if (!ready) {
    return <PageLoader variant={variant} />;
  }

  return <>{children}</>;
};
