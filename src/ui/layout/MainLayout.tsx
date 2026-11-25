import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense, lazy } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useLayoutVariant } from './useLayoutVariant';
import { prefetchCriticalRoutes } from '../../core/utils/routePrefetcher';

const ClassicChrome = lazy(() => import('./classic/ClassicChrome'));
import { WorkspaceTabBar, MultiViewContainer } from './tabs';
import { ROUTES } from '../../core/routes/paths';
import { useI18nStore } from '../../lib/i18nStore';
import { useThemeStore } from '../../lib/themeStore';
import { cn } from '../../core/utils';
import {
  getBreakpointValue,
  useBreakpoint,
  useCurrentBreakpoint,
} from '../../lib/hooks/useBreakpoint';
import { useTranslation } from '../../lib/hooks/useTranslation';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';
import { useDevice } from '../../lib/hooks/useDevice';
import { useOrientation } from '../../lib/hooks/useOrientation';
import {
  getCollapsedSidebarWidth,
  getMainLayoutOffsetClasses,
  shouldPersistExpandedSidebar,
} from './sidebarSizing';
import { useConnectionStore } from '../../core/store/connectionStore';
import { NetworkStatusPill } from './NetworkStatusPill';
import { MobileBottomNav } from './mobile/MobileBottomNav';
import { EntityInspectorHost } from '../../features/entity-inspector';
import { useGlobalShortcuts } from '../../core/shortcuts/useGlobalShortcuts';
const ShortcutsHelpModal = lazy(() => import('../components/ShortcutsHelpModal'));
/**
 * ⚡ Lazy floating overlays — لا تنتمي لمسار الإقلاع الحرج.
 * برميل `features/chat` يصدّر وحدات المحادثات كاملة (خدمات، متاجر، هوكات صوتية،
 * عشرات المكوّنات) وبرميل `accompanying-info` يجرّ framer-motion؛ كان استيرادهما
 * الثابت من MainLayout يسحبها كلها إلى حزمة الدخول (~100KB+) ويجعل التحميل
 * الكسلي لـ ChatHubPage في routes.tsx بلا معنى.
 */
const FloatingChatWidget = lazy(() =>
  import('../../features/chat').then(m => ({ default: m.FloatingChatWidget }))
);
const AccompanyingInfoWindow = lazy(() =>
  import('../../features/accompanying-info').then(m => ({
    default: m.AccompanyingInfoWindow,
  }))
);

const MainLayout: React.FC = () => {
  const isDesktop = useBreakpoint('md');
  const breakpoint = useCurrentBreakpoint();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    // On wide desktops (1920px+), sidebar starts expanded by default
    const width = window.innerWidth;
    if (width >= getBreakpointValue('3xl')) return false; // expanded
    return width >= getBreakpointValue('md'); // collapsed on tablet+
  });
  const previousIsDesktop = useRef(isDesktop);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);
  const [mountSecondaryOverlays, setMountSecondaryOverlays] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setMountSecondaryOverlays(true);
      prefetchCriticalRoutes();
    }, 2000);
    return () => clearTimeout(t);
  }, []);
  const { isOnline } = useNetworkStatus();
  const { isHelpOpen, closeHelp, shortcuts } = useGlobalShortcuts();
  const isUnstable = useConnectionStore(s => s.isUnstable);
  const { isIPad } = useDevice();
  const { isTabletLandscape, isTabletPortrait } = useOrientation();

  const dir = useI18nStore(s => s.dir);
  const location = useLocation();
  const initializeTheme = useThemeStore(s => s.initializeTheme);
  const { t } = useTranslation();
  // القشرة الكلاسيكية (قوائم + شريط أوامر) تُفعَّل من الثيم/التفضيل وعلى سطح المكتب فقط
  const isClassicShell = useLayoutVariant() === 'classic';

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev);
  }, []);
  const handleCloseMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen(false);
  }, []);
  const handleOpenMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen(true);
  }, []);
  const handleOpenMoreSheet = useCallback(() => {
    setIsMoreSheetOpen(true);
  }, []);
  const handleCloseMoreSheet = useCallback(() => {
    setIsMoreSheetOpen(false);
  }, []);

  // Dynamic sidebar width based on screen size and device
  const sidebarWidth = useMemo(
    () =>
      getCollapsedSidebarWidth({
        breakpoint,
        isIPad,
        isTabletLandscape,
      }),
    [breakpoint, isIPad, isTabletLandscape]
  );

  // Dynamic content max-width for large screens — removed; handled by ContentContainer per-page
  const contentMaxWidth = useMemo(() => {
    return 'max-w-none px-0';
  }, []);

  // Padding bottom for main content: always synchronized with md:hidden MobileBottomNav + iOS safe area
  const mainPaddingBottom = useMemo(() => {
    if (isIPad && isTabletPortrait) return 'pb-[calc(3.6rem_+_env(safe-area-inset-bottom))]';
    return 'pb-[calc(3.6rem_+_env(safe-area-inset-bottom))] md:pb-2';
  }, [isIPad, isTabletPortrait]);

  useEffect(() => {
    if (previousIsDesktop.current !== isDesktop) {
      const isWide = shouldPersistExpandedSidebar(breakpoint);
      // On wide screens: expand; on smaller: collapse
      setIsSidebarCollapsed(isWide ? false : isDesktop);
      previousIsDesktop.current = isDesktop;
    }
  }, [isDesktop, breakpoint]);

  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  // تحديث تلقائي للقائمة الجانبية في الموبايل عند تغيير المسار
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div
      data-theme-scope="app"
      className="h-[100dvh] overflow-hidden bg-[var(--app-bg)] font-sans"
      dir={dir}
    >
      {/* Network Alert Overlay */}
      {!isOnline && (
        <div className="fixed left-0 right-0 top-0 z-[300] h-1 animate-pulse bg-rose-500"></div>
      )}

      {/* Skip to Content — Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[400] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white focus:shadow-lg"
      >
        {t('skip_to_content') || 'تخطي إلى المحتوى'}
      </a>

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="bg-[var(--app-text)]/60 animate-in fade-in fixed inset-0 z-50 backdrop-blur-sm duration-300 md:hidden"
          onClick={() => {
            setIsMobileSidebarOpen(false);
          }}
        ></div>
      )}

      {!isClassicShell && (
        <Sidebar
          className="no-print"
          isCollapsed={isSidebarCollapsed}
          toggleSidebar={handleToggleSidebar}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={handleCloseMobileSidebar}
          sidebarWidth={sidebarWidth}
        />
      )}

      <div
        className={cn(
          'relative flex h-full flex-1 flex-col overflow-hidden transition-[margin] duration-150 ease-out print:!m-0 print:!block print:!w-full print:!overflow-visible print:!p-0',
          contentMaxWidth,
          isDesktop &&
            !isClassicShell &&
            getMainLayoutOffsetClasses({
              breakpoint,
              dir,
              isCollapsed: isSidebarCollapsed,
              isIPad,
              isTabletLandscape,
            })
        )}
      >
        <div className="no-print">
          {isClassicShell ? (
            <Suspense fallback={null}>
              <ClassicChrome />
            </Suspense>
          ) : (
            <Header onMenuClick={handleOpenMobileSidebar} />
          )}
          {isDesktop && <WorkspaceTabBar />}
        </div>

        <NetworkStatusPill isOnline={isOnline} isUnstable={isUnstable} />

        <main
          id="main-content"
          className={cn(
            'custom-scrollbar relative flex min-h-0 flex-1 flex-col overflow-y-auto print:!m-0 print:!block print:!w-full print:!overflow-visible print:!p-0',
            mainPaddingBottom
          )}
        >
          <MultiViewContainer />
        </main>

        <MobileBottomNav
          isMoreSheetOpen={isMoreSheetOpen}
          onOpenMoreSheet={handleOpenMoreSheet}
          onCloseMoreSheet={handleCloseMoreSheet}
        />

        {/* Global Realtime Floating Chat & Collaboration Dock (deferred until main view settles) */}
        {mountSecondaryOverlays && location.pathname !== ROUTES.DASHBOARD.CHAT && (
          <Suspense fallback={null}>
            <FloatingChatWidget />
          </Suspense>
        )}

        {/* Global Accompanying Information (المعلومات المرافقة) HUD */}
        {mountSecondaryOverlays && (
          <Suspense fallback={null}>
            <AccompanyingInfoWindow />
          </Suspense>
        )}

        {/* Global Universal Entity Inspector (نقطة الاستعلام الفوري — لا يُحمَّل إلا عند النقر) */}
        <EntityInspectorHost />

        {/* Global Keyboard Shortcuts Cheat Sheet */}
        {isHelpOpen && (
          <Suspense fallback={null}>
            <ShortcutsHelpModal
              isOpen={isHelpOpen}
              onClose={closeHelp}
              shortcuts={shortcuts}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default MainLayout;
