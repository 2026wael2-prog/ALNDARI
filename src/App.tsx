import React, { Suspense, lazy } from 'react';
import { HashRouter } from 'react-router-dom';
import { AppRoutes } from './app/routes';
import FeedbackToast from './ui/base/FeedbackToast';
import { ErrorBoundary } from './core/components/ErrorBoundary';
import { useSystemInitialization } from './core/hooks/useSystemInitialization';

const CommandPalette = lazy(() => import('./ui/base/CommandPalette'));
const DebtAlertsRunner = lazy(() =>
  import('./features/debts/components/DebtAlertsRunner').then(m => ({ default: m.DebtAlertsRunner }))
);
const BranchTransferAlertRunner = lazy(() =>
  import('./features/inventory/components/transfers/BranchTransferAlertRunner').then(m => ({
    default: m.BranchTransferAlertRunner,
  }))
);

const App: React.FC = () => {
  // Centralized system bootstrapping (Auth, I18n, Sync, Shortcuts)
  useSystemInitialization();
  const [mountBackgroundRunners, setMountBackgroundRunners] = React.useState(false);

  // تأجيل تشغيل محركات التنبيه الخلفية (الديون والمناقلات) حتى تستقر الشاشات الأساسية بالكامل
  React.useEffect(() => {
    let idleId: number | undefined;
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(
          () => {
            setMountBackgroundRunners(true);
          },
          { timeout: 5000 }
        );
      } else {
        setMountBackgroundRunners(true);
      }
    }, 15000);
    return () => {
      clearTimeout(timer);
      if (idleId !== undefined && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, []);

  // جسر تنقّل من Service Worker: عند النقر على تنبيه دفع والتطبيق مفتوح،
  // العامل يرسل رسالة بدل إعادة تحميل الصفحة — نطبّقها على HashRouter.
  React.useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: string; link?: string } | null;
      if (data !== null && data.type === 'alzhra-navigate' && typeof data.link === 'string') {
        window.location.hash = data.link;
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  return (
    <ErrorBoundary>
      <HashRouter>
        <AppRoutes />
        <Suspense fallback={null}>
          {mountBackgroundRunners && (
            <>
              {/* محرك تنبيهات التحصيل مركزي: يعمل خارج قسم الديون (مبوّب بصلاحية debts:read) */}
              <DebtAlertsRunner />
              {/* محرك تنبيهات طلبات المناقلة اللحظية بين الفروع */}
              <BranchTransferAlertRunner />
            </>
          )}
          <CommandPalette />
        </Suspense>
        <FeedbackToast />
      </HashRouter>
    </ErrorBoundary>
  );
};

export default App;
