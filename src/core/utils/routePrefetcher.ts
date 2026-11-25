/**
 * routePrefetcher.ts
 *
 * Professional route prefetching strategy:
 * - Preloads route code chunks BEFORE the user clicks
 * - Maps each route path to its dynamic import function
 * - Called on hover/focus of sidebar nav items
 */

type PrefetchFn = () => Promise<unknown>;

// Map each route path to its dynamic import
// Must match the lazy() imports in routes.tsx exactly
const ROUTE_PREFETCH_MAP: Record<string, PrefetchFn> = {
  '/': () => import('../../features/dashboard/DashboardPage'),
  '/inventory': () => import('../../features/inventory/InventoryPage'),
  '/inventory/quick-audit': () => import('../../features/inventory/pages/QuickAuditPage'),
  '/inventory/audit-session': () => import('../../features/inventory/pages/AuditSessionPage'),
  '/pos': () => import('../../features/pos/pages/POSPage'),
  '/sales': () => import('../../features/sales/pages/SalesPage'),
  '/accounting': () => import('../../features/accounting/AccountingPage'),
  '/purchases': () => import('../../features/purchases/pages/PurchasesPage'),
  '/expenses': () => import('../../features/expenses/pages/ExpensesPage'),
  '/settings': () => import('../../features/settings/SettingsPage'),
  '/bonds': () => import('../../features/bonds/BondsPage'),
  '/clients': () => import('../../features/parties/PartiesPage'),
  '/suppliers': () => import('../../features/parties/PartiesPage'),
  '/employees': () => import('../../features/parties/PartiesPage'),
  '/reports': () => import('../../features/reports/ReportsPage'),
  '/debts': async () => {
    await Promise.all([
      import('../../features/debts/pages/DebtsLayout'),
      import('../../features/debts/pages/OverviewPage'),
    ]);
  },
  '/appearance': () => import('../../features/appearance/AppearancePage'),
  '/commissions': () => import('../../features/commissions/pages/CommissionDashboardPage'),
  '/commissions/config': () =>
    import('../../features/commissions/pages/CommissionConfigurationPage'),
  '/commissions/assignments': () =>
    import('../../features/commissions/pages/CommissionAssignmentsPage'),
  '/commissions/periods': () => import('../../features/commissions/pages/CommissionPeriodsPage'),
  '/commissions/reports': () => import('../../features/commissions/pages/CommissionReportsPage'),
  '/daily-reconciliation': () =>
    import('../../features/reconciliation/pages/DailyReconciliationPage'),
  '/vin': () => import('../../features/vin-intelligence/pages/VINPage'),
  '/supplier-portal': () => import('../../features/supplier-portal/pages/SupplierPortalPage'),
  '/customer-service': () => import('../../features/integrations/chatwoot/ChatwootWidgetPage'),
  '/chat': () => import('../../features/chat'),
  '/inventory-intelligence': () =>
    import('../../features/inventory-intelligence/components/InventoryIntelligencePage'),
  '/admin': () => import('../../features/admin/pages/AdminHubPage'),
  '/admin/hub': () => import('../../features/admin/pages/AdminHubPage'),
};

// Track which routes have already been prefetched to avoid duplicate fetches
const prefetched = new Set<string>();

/**
 * Prefetch a route's JS chunk immediately when the user hovers/focuses a nav item.
 * Safe to call multiple times — deduplicates automatically.
 */
export function prefetchRoute(path: string): void {
  if (prefetched.has(path)) return;

  const prefetchFn = ROUTE_PREFETCH_MAP[path];
  if (!prefetchFn) return;

  prefetched.add(path);

  // ⚡ تنفيذ الجلب المسبق فوراً عند تمرير المؤشر (Hover/Focus) لضمان تحميل الـ Chunk قبل النقر الفعلي
  prefetchFn().catch(() => {
    prefetched.delete(path);
  });
}

/**
 * Prefetch commonly visited routes after the app is completely loaded and idle.
 * Respects Save-Data / slow 2G connections so it never competes with active traffic.
 */
let criticalPrefetchScheduled = false;

export function prefetchCriticalRoutes(): void {
  if (criticalPrefetchScheduled || typeof window === 'undefined') return;

  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  if (
    nav.connection?.saveData ||
    nav.connection?.effectiveType === 'slow-2g' ||
    nav.connection?.effectiveType === '2g'
  ) {
    return;
  }

  criticalPrefetchScheduled = true;

  // Only prefetch when browser is completely idle to preserve typing & rendering performance
  const startPrefetch = () => {
    const criticalRoutes = [
      '/sales',
      '/inventory',
      '/pos',
      '/clients',
      '/purchases',
      '/bonds',
      '/accounting',
    ];
    criticalRoutes.forEach((path, index) => {
      setTimeout(
        () => {
          if ('requestIdleCallback' in window) {
            window.requestIdleCallback(
              () => {
                prefetchRoute(path);
              },
              { timeout: 5000 }
            );
          } else {
            prefetchRoute(path);
          }
        },
        (index + 1) * 1200
      );
    });
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(startPrefetch, { timeout: 6000 });
  } else {
    setTimeout(startPrefetch, 4000);
  }
}
