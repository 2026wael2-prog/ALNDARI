import React, { lazy } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
const MainLayout = lazy(() => import('../ui/layout/MainLayout'));
import { ROUTES } from '../core/routes/paths';
import { useTranslation } from '../lib/hooks/useTranslation';
import { AuthGuard } from '../features/auth/components/AuthGuard';
import { GuestGuard } from '../features/auth/components/GuestGuard';
import { FeatureBoundary } from '../core/components/FeatureBoundary';
import { DeferredRouteGate } from '../core/components/DeferredRouteGate';

// Auth Pages (Lazy-loaded so authenticated users do not download landing assets on startup)
const LandingPage = lazy(() => import('../features/auth/LandingPage'));
const ForgotPasswordPage = lazy(() => import('../features/auth/ForgotPasswordPage'));
const UpdatePasswordPage = lazy(() => import('../features/auth/UpdatePasswordPage'));

// Critical Dashboard Page (lazy-loaded so Auth/Landing pages don't download dashboard + charts)
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));

// Lazy Loaded Features — each isolated by FeatureBoundary
const InventoryPage = lazy(() => import('../features/inventory/InventoryPage'));
const InventoryIntelligencePage = lazy(
  () => import('../features/inventory-intelligence/components/InventoryIntelligencePage')
);
const AuditSessionPage = lazy(() => import('../features/inventory/pages/AuditSessionPage'));
const QuickAuditPage = lazy(() => import('../features/inventory/pages/QuickAuditPage'));

const POSPage = lazy(() => import('../features/pos/pages/POSPage'));
const DailyReconciliationPage = lazy(
  () => import('../features/reconciliation/pages/DailyReconciliationPage')
);
const VINPage = lazy(() => import('../features/vin-intelligence/pages/VINPage'));
const SalesPage = lazy(() => import('../features/sales/pages/SalesPage'));
const AccountingPage = lazy(() => import('../features/accounting/AccountingPage'));
const PurchasesPage = lazy(() => import('../features/purchases/pages/PurchasesPage'));
const ExpensesPage = lazy(() => import('../features/expenses/pages/ExpensesPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const AppearancePage = lazy(() => import('../features/appearance/AppearancePage'));
const BondsPage = lazy(() => import('../features/bonds/BondsPage'));
const PartiesPage = lazy(() => import('../features/parties/PartiesPage'));
const ReportsPage = lazy(() => import('../features/reports/ReportsPage'));
const CommissionDashboardPage = lazy(
  () => import('../features/commissions/pages/CommissionDashboardPage')
);
const CommissionConfigurationPage = lazy(
  () => import('../features/commissions/pages/CommissionConfigurationPage')
);
const CommissionAssignmentsPage = lazy(
  () => import('../features/commissions/pages/CommissionAssignmentsPage')
);
const CommissionPeriodsPage = lazy(
  () => import('../features/commissions/pages/CommissionPeriodsPage')
);
const CommissionReportsPage = lazy(
  () => import('../features/commissions/pages/CommissionReportsPage')
);

// Debts & Collection module — one lazy page per main service
const DebtsLayout = lazy(() => import('../features/debts/pages/DebtsLayout'));
const DebtOverviewPage = lazy(() => import('../features/debts/pages/OverviewPage'));
const DebtAgentPage = lazy(() => import('../features/debts/pages/AgentPage'));
const DebtFollowUpPage = lazy(() => import('../features/debts/pages/FollowUpPage'));
const DebtTasksPage = lazy(() => import('../features/debts/pages/TasksPage'));
const DebtPromisesPage = lazy(() => import('../features/debts/pages/PromisesPage'));
const DebtOutboxPage = lazy(() => import('../features/debts/pages/OutboxPage'));
const DebtStatementsPage = lazy(() => import('../features/debts/pages/StatementsPage'));
const DebtSettingsPage = lazy(() => import('../features/debts/pages/SettingsPage'));
const SupplierPortalPage = lazy(
  () => import('../features/supplier-portal/pages/SupplierPortalPage')
);
const PublicSupplierPortalPage = lazy(
  () => import('../features/supplier-portal/pages/PublicSupplierPortalPage')
);
const ChatHubPage = lazy(() => import('../features/chat').then(m => ({ default: m.ChatHubPage })));
const AdminHubPage = lazy(() => import('../features/admin/pages/AdminHubPage'));
const ChatwootWidgetPage = lazy(() => import('../features/integrations/chatwoot/ChatwootWidgetPage'));
import { SuperAdminGuard } from '../features/admin/components/SuperAdminGuard';
import { PermissionGuard } from '../features/auth/PermissionGuard';
import { MaintenanceGuard } from '../features/admin/components/MaintenanceGuard';
import { FeatureFlagGate } from '../core/components/FeatureFlagGate';

// ── 404 ──────────────────────────────────────────────────────────────────────

const NotFoundPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col items-center justify-center bg-[var(--app-bg)] py-20 text-[var(--app-text-secondary)]">
      <div className="mb-4 text-6xl opacity-20">🧭</div>
      <h2 className="text-2xl font-bold text-[var(--app-text)]">{t('page_not_found_title')}</h2>
      <p className="mt-2 text-sm text-[var(--app-text-secondary)]">{t('page_not_found_desc')}</p>
      <button
        onClick={() => {
          void navigate(ROUTES.DASHBOARD.ROOT);
        }}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white"
      >
        {t('back_to_home')}
      </button>
    </div>
  );
};

// ── Routes ───────────────────────────────────────────────────────────────────

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Auth Routes */}
      <Route
        path={ROUTES.AUTH.LANDING}
        element={
          <GuestGuard>
            <LandingPage />
          </GuestGuard>
        }
      />
      <Route path={ROUTES.AUTH.LOGIN} element={<Navigate to={ROUTES.AUTH.LANDING} replace />} />
      <Route path={ROUTES.AUTH.REGISTER} element={<Navigate to={ROUTES.AUTH.LANDING} replace />} />
      <Route
        path={ROUTES.AUTH.FORGOT_PASSWORD}
        element={
          <GuestGuard>
            <ForgotPasswordPage />
          </GuestGuard>
        }
      />
      {/*
        ⚡ بلا GuestGuard عن قصد: رابط استعادة كلمة المرور يُنشئ جلسة مصادَقة،
        وGuestGuard يطرد كل مستخدم مُصادَق إلى لوحة التحكم — فكان يمنع المستخدم
        من رؤية نموذج كلمة المرور الجديدة. الصفحة نفسها تتعامل مع غياب الجلسة.
      */}
      <Route path={ROUTES.AUTH.UPDATE_PASSWORD} element={<UpdatePasswordPage />} />

      {/* Public Dedicated Supplier Portal (Token-Based Access) */}
      <Route
        path={ROUTES.PUBLIC.SUPPLIER_PORTAL}
        element={
          <MaintenanceGuard>
            <FeatureFlagGate flag="supplier_portal" label="بوابة الموردين">
              <FeatureBoundary name="public-supplier-portal">
                <PublicSupplierPortalPage />
              </FeatureBoundary>
            </FeatureFlagGate>
          </MaintenanceGuard>
        }
      />

      {/* Chatwoot Dashboard App Sidebar Widget (Standalone without MainLayout) */}
      <Route
        path="/chatwoot-widget"
        element={
          <FeatureBoundary name="chatwoot-widget">
            <ChatwootWidgetPage />
          </FeatureBoundary>
        }
      />
      <Route
        path="/portal/supplier"
        element={
          <MaintenanceGuard>
            <FeatureFlagGate flag="supplier_portal" label="بوابة الموردين">
              <FeatureBoundary name="public-supplier-portal">
                <PublicSupplierPortalPage />
              </FeatureBoundary>
            </FeatureFlagGate>
          </MaintenanceGuard>
        }
      />
      <Route
        path="/portal/:token"
        element={
          <MaintenanceGuard>
            <FeatureFlagGate flag="supplier_portal" label="بوابة الموردين">
              <FeatureBoundary name="public-supplier-portal">
                <PublicSupplierPortalPage />
              </FeatureBoundary>
            </FeatureFlagGate>
          </MaintenanceGuard>
        }
      />
      <Route
        path="/supplier-portal/:token"
        element={
          <MaintenanceGuard>
            <FeatureFlagGate flag="supplier_portal" label="بوابة الموردين">
              <FeatureBoundary name="public-supplier-portal">
                <PublicSupplierPortalPage />
              </FeatureBoundary>
            </FeatureFlagGate>
          </MaintenanceGuard>
        }
      />

      {/* Super Admin Platform Cockpit (Protected by SuperAdminGuard) */}
      {/* `:tab?` مسار فرعي اختياري يحدد التبويب النشط من الـ URL (deep-linking)،
          بينما يبقى الحُرّاس وFeatureBoundary يغلّفان المسار كاملاً. */}
      <Route
        path={`${ROUTES.ADMIN.ROOT}/:tab?`}
        element={
          <SuperAdminGuard>
            <FeatureBoundary name="super-admin">
              <DeferredRouteGate variant="dashboard">
                <AdminHubPage />
              </DeferredRouteGate>
            </FeatureBoundary>
          </SuperAdminGuard>
        }
      />
      {/* المسارات العميقة داخل تبويب الأمان تُعاد لعنوان التبويب الرئيسي (تُدار داخلياً بالحالة). */}
      <Route
        path={ROUTES.ADMIN.ROOT + '/*'}
        element={<Navigate to={ROUTES.ADMIN.ROOT} replace />}
      />

      {/* Protected App Routes */}
      <Route
        path="/"
        element={
          <MaintenanceGuard>
            <AuthGuard>
              <MainLayout />
            </AuthGuard>
          </MaintenanceGuard>
        }
      >
        {/* Dashboard — مؤجّل جلب البيانات لإعطاء الأولوية القصوى للشاشات التشغيلية الأساسية */}
        <Route
          index
          element={
            <DeferredRouteGate delayMs={500} variant="dashboard">
              <DashboardPage />
            </DeferredRouteGate>
          }
        />

        {/* Inventory cluster — المنتجات (أولوية قصوى: جلب فوري) */}
        <Route
          path={ROUTES.DASHBOARD.INVENTORY}
          element={
            <PermissionGuard permission="inventory:read" label="المخزون">
              <FeatureBoundary name="inventory">
                <InventoryPage />
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.INVENTORY_INTELLIGENCE}
          element={
            <PermissionGuard permission="inventory:read" label="ذكاء المخزون">
              <FeatureBoundary name="inventory-intelligence">
                <DeferredRouteGate variant="table">
                  <InventoryIntelligencePage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.INVENTORY_AUDIT_SESSION}
          element={
            <PermissionGuard permission="inventory:update" label="جلسة الجرد">
              <FeatureBoundary name="audit-session">
                <DeferredRouteGate variant="table">
                  <AuditSessionPage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.INVENTORY_QUICK_AUDIT}
          element={
            <PermissionGuard permission="inventory:update" label="الجرد السريع">
              <FeatureBoundary name="quick-audit">
                <DeferredRouteGate variant="table">
                  <QuickAuditPage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />

        {/* Transactional — المبيعات (أولوية قصوى: جلب فوري) */}
        <Route
          path={ROUTES.DASHBOARD.SALES}
          element={
            <PermissionGuard permission="sales:read" label="المبيعات">
              <FeatureBoundary name="sales">
                <SalesPage />
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.POS}
          element={
            <PermissionGuard permission="sales:create" label="نقطة البيع">
              <FeatureBoundary name="pos">
                <DeferredRouteGate variant="grid">
                  <POSPage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.DAILY_RECONCILIATION}
          element={
            <PermissionGuard permission="accounting:read" label="المطابقة اليومية">
              <FeatureBoundary name="daily-reconciliation">
                <DeferredRouteGate variant="table">
                  <DailyReconciliationPage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.VIN}
          element={
            <FeatureBoundary name="vin-intelligence">
              <FeatureFlagGate flag="vin_intelligence" label="ذكاء الشاصي (VIN)">
                <DeferredRouteGate variant="form">
                  <VINPage />
                </DeferredRouteGate>
              </FeatureFlagGate>
            </FeatureBoundary>
          }
        />
        {/* المشتريات (أولوية قصوى: جلب فوري) */}
        <Route
          path={ROUTES.DASHBOARD.PURCHASES}
          element={
            <PermissionGuard permission="purchases:read" label="المشتريات">
              <FeatureBoundary name="purchases">
                <PurchasesPage />
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.EXPENSES}
          element={
            <PermissionGuard permission="expenses:read" label="المصروفات">
              <FeatureBoundary name="expenses">
                <DeferredRouteGate variant="table">
                  <ExpensesPage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        {/* السندات المالية (أولوية قصوى: جلب فوري) */}
        <Route
          path={ROUTES.DASHBOARD.BONDS}
          element={
            <PermissionGuard permission="bonds:read" label="السندات المالية">
              <FeatureBoundary name="bonds">
                <BondsPage />
              </FeatureBoundary>
            </PermissionGuard>
          }
        />

        {/* Finance — مؤجلة جلب البيانات */}
        <Route
          path={ROUTES.DASHBOARD.ACCOUNTING}
          element={
            <PermissionGuard permission="accounting:read" label="المحاسبة">
              <FeatureBoundary name="accounting">
                <DeferredRouteGate variant="table">
                  <AccountingPage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.REPORTS}
          element={
            <PermissionGuard permission="reports:read" label="التقارير">
              <FeatureBoundary name="reports">
                <DeferredRouteGate variant="dashboard">
                  <ReportsPage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.COMMISSIONS}
          element={
            <PermissionGuard permission="incentive:manage_plans" label="العمولات">
              <FeatureBoundary name="commissions">
                <DeferredRouteGate variant="dashboard">
                  <CommissionDashboardPage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.COMMISSIONS_CONFIG}
          element={
            <PermissionGuard permission="incentive:manage_plans" label="إعدادات العمولات">
              <FeatureBoundary name="commissions-config">
                <DeferredRouteGate variant="form">
                  <CommissionConfigurationPage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.COMMISSIONS_ASSIGNMENTS}
          element={
            <PermissionGuard permission="incentive:manage_plans" label="تعيينات العمولات">
              <FeatureBoundary name="commissions-assignments">
                <DeferredRouteGate variant="table">
                  <CommissionAssignmentsPage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.COMMISSIONS_PERIODS}
          element={
            <PermissionGuard permission="incentive:manage_plans" label="فترات العمولات">
              <FeatureBoundary name="commissions-periods">
                <DeferredRouteGate variant="table">
                  <CommissionPeriodsPage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.COMMISSIONS_REPORTS}
          element={
            <PermissionGuard permission="reports:read" label="تقارير العمولات">
              <FeatureBoundary name="commissions-reports">
                <DeferredRouteGate variant="table">
                  <CommissionReportsPage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />

        {/* Parties — العملاء والموردون وكشف الحسابات (أولوية قصوى: جلب فوري) */}
        <Route
          path={ROUTES.DASHBOARD.SUPPLIERS}
          element={
            <PermissionGuard permission="customers:read" label="الموردون">
              <FeatureBoundary name="suppliers">
                <PartiesPage partyType="supplier" />
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.CLIENTS}
          element={
            <PermissionGuard permission="customers:read" label="العملاء">
              <FeatureBoundary name="clients">
                <PartiesPage partyType="customer" />
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.EMPLOYEES}
          element={
            <PermissionGuard permission="customers:read" label="الموظفون">
              <FeatureBoundary name="employees">
                <DeferredRouteGate variant="table">
                  <PartiesPage partyType="employee" title="الموظفون" />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        {/* Legacy /parties/* routes → redirect to the unified /clients & /suppliers */}
        <Route
          path={ROUTES.DASHBOARD.LEGACY.PARTIES}
          element={<Navigate to={ROUTES.DASHBOARD.CLIENTS} replace />}
        />
        <Route
          path={ROUTES.DASHBOARD.LEGACY.PARTIES_CUSTOMERS}
          element={<Navigate to={ROUTES.DASHBOARD.CLIENTS} replace />}
        />
        <Route
          path={ROUTES.DASHBOARD.LEGACY.PARTIES_SUPPLIERS}
          element={<Navigate to={ROUTES.DASHBOARD.SUPPLIERS} replace />}
        />

        {/* Settings & Appearance — مؤجلة جلب البيانات */}
        <Route
          path={ROUTES.DASHBOARD.SETTINGS}
          element={
            <PermissionGuard permission="settings:manage" label="الإعدادات">
              <FeatureBoundary name="settings">
                <DeferredRouteGate variant="form">
                  <SettingsPage />
                </DeferredRouteGate>
              </FeatureBoundary>
            </PermissionGuard>
          }
        />
        <Route
          path={ROUTES.DASHBOARD.APPEARANCE}
          element={
            <FeatureBoundary name="appearance">
              <DeferredRouteGate variant="form">
                <AppearancePage />
              </DeferredRouteGate>
            </FeatureBoundary>
          }
        />

        {/* Debts & Collection module — كشف الحسابات فوري، والباقي مؤجّل */}
        <Route
          path={ROUTES.DASHBOARD.DEBTS}
          element={
            <PermissionGuard permission="debts:read" label="الديون والتحصيل">
              <FeatureBoundary name="debts">
                <DebtsLayout />
              </FeatureBoundary>
            </PermissionGuard>
          }
        >
          <Route index element={<DeferredRouteGate variant="dashboard"><DebtOverviewPage /></DeferredRouteGate>} />
          <Route path="agent" element={<DeferredRouteGate variant="table"><DebtAgentPage /></DeferredRouteGate>} />
          <Route path="followup" element={<DeferredRouteGate variant="table"><DebtFollowUpPage /></DeferredRouteGate>} />
          <Route path="tasks" element={<DeferredRouteGate variant="table"><DebtTasksPage /></DeferredRouteGate>} />
          <Route path="promises" element={<DeferredRouteGate variant="table"><DebtPromisesPage /></DeferredRouteGate>} />
          <Route path="outbox" element={<DeferredRouteGate variant="table"><DebtOutboxPage /></DeferredRouteGate>} />
          <Route path="statements" element={<DebtStatementsPage />} />
          <Route path="settings" element={<DeferredRouteGate variant="form"><DebtSettingsPage /></DeferredRouteGate>} />
        </Route>

        {/* Supplier Portal & Smart Procurement */}
        <Route
          path={ROUTES.DASHBOARD.SUPPLIER_PORTAL}
          element={
            <FeatureBoundary name="supplier-portal">
              <FeatureFlagGate flag="supplier_portal" label="بوابة الموردين">
                <DeferredRouteGate variant="table">
                  <SupplierPortalPage />
                </DeferredRouteGate>
              </FeatureFlagGate>
            </FeatureBoundary>
          }
        />

        {/* Enterprise Chat & Branch Collaboration */}
        <Route
          path={ROUTES.DASHBOARD.CHAT}
          element={
            <FeatureBoundary name="chat">
              <FeatureFlagGate flag="internal_chat" label="المحادثات والتواصل">
                <DeferredRouteGate variant="default">
                  <ChatHubPage />
                </DeferredRouteGate>
              </FeatureFlagGate>
            </FeatureBoundary>
          }
        />

        {/* Customer Service & WhatsApp Desk */}
        <Route
          path={ROUTES.DASHBOARD.CUSTOMER_SERVICE}
          element={
            <FeatureBoundary name="customer-service">
              <DeferredRouteGate variant="default">
                <ChatwootWidgetPage />
              </DeferredRouteGate>
            </FeatureBoundary>
          }
        />

        {/* 404 Fallback */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};
