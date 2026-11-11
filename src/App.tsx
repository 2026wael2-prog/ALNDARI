import React from 'react';
import { HashRouter } from 'react-router-dom';
import { AppRoutes } from './app/routes';
import FeedbackToast from './ui/base/FeedbackToast';
import { ErrorBoundary } from './core/components/ErrorBoundary';
import CommandPalette from './ui/base/CommandPalette';
import { useSystemInitialization } from './core/hooks/useSystemInitialization';
import { prefetchCriticalRoutes } from './core/utils/routePrefetcher';
import { DebtAlertsRunner } from './features/debts/components/DebtAlertsRunner';
import { BranchTransferAlertRunner } from './features/inventory/components/transfers/BranchTransferAlertRunner';

const App: React.FC = () => {
  // Centralized system bootstrapping (Auth, I18n, Sync, Shortcuts)
  useSystemInitialization();

  React.useEffect(() => {
    // Start prefetching chunks when app becomes idle
    prefetchCriticalRoutes();
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
        {/* محرك تنبيهات التحصيل مركزي: يعمل خارج قسم الديون (مبوّب بصلاحية debts:read) */}
        <DebtAlertsRunner />
        {/* محرك تنبيهات طلبات المناقلة اللحظية بين الفروع */}
        <BranchTransferAlertRunner />
        <FeedbackToast />
        <CommandPalette />
      </HashRouter>
    </ErrorBoundary>
  );
};

export default App;
