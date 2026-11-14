import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MaintenanceModeConfig } from '../../../core/config/platformDefaults';
import { adminService } from '../services/adminService';
import { useIsSuperAdmin } from '../../auth/hooks';
import { useAuth } from '../../auth/hooks';
import { AlertTriangle, Wrench, ShieldCheck } from 'lucide-react';
import { ROUTES } from '../../../core/routes/paths';

/**
 * MaintenanceGuard — يحجب المستخدمين العاديين عند تفعيل وضع الصيانة.
 * السوبر أدمنز يُسمح لهم بالدخول دائماً.
 * يقرأ مفتاح 'maintenance_mode' من system_platform_configs عبر adminService.
 */

interface MaintenanceGuardProps {
  children: React.ReactNode;
}

const useMaintenanceMode = (): UseQueryResult<MaintenanceModeConfig> => {
  return useQuery({
    queryKey: ['platform_maintenance_mode'],
    queryFn: () => adminService.getMaintenanceConfig(),
    staleTime: 5 * 60_000, // 5 دقائق — تقليل الضغط على الشبكة أثناء الإقلاع والتنقل
    gcTime: 10 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
};

interface MaintenanceScreenProps {
  config: MaintenanceModeConfig;
}

const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({ config }) => {
  const navigate = useNavigate();

  const handleAdminLogin = (): void => {
    void navigate(ROUTES.AUTH.LANDING);
  };

  const hasEstimatedEnd =
    config.estimated_end !== null &&
    config.estimated_end !== undefined &&
    config.estimated_end.trim() !== '';

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-[var(--app-bg)] px-4 text-center"
      dir="rtl"
    >
      <div className="max-w-md space-y-6">
        {/* أيقونة الصيانة */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 shadow-lg shadow-amber-500/10">
          <Wrench size={36} className="text-amber-500" />
        </div>

        {/* العنوان */}
        <h1 className="text-xl font-black text-[var(--app-text)]">النظام تحت الصيانة</h1>

        {/* رسالة الصيانة المخصصة */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle size={16} />
            <span className="text-xs font-black">إشعار صيانة</span>
          </div>
          <p className="text-sm leading-relaxed text-[var(--app-text-secondary)]">
            {config.message !== ''
              ? config.message
              : 'النظام يخضع حالياً لأعمال صيانة مجدولة لتحسين الخدمات. سنعود قريباً.'}
          </p>
        </div>

        {/* الموعد المتوقع */}
        {hasEstimatedEnd && (
          <p className="text-xs text-[var(--app-text-secondary)]">
            الموعد المتوقع للعودة:{' '}
            <span className="font-bold text-[var(--app-text)]">
              {new Date(config.estimated_end!).toLocaleString('ar-SA')}
            </span>
          </p>
        )}

        {/* شريط الزخم */}
        <div className="mx-auto h-1 w-32 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900/30">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-amber-500" />
        </div>

        <p className="text-[10px] text-[var(--app-text-secondary)]">
          نعتذر عن أي إزعاج. نعمل على تحسين النظام لتقديم تجربة أفضل.
        </p>

        {/* رابط وصول مشرفي النظام */}
        <div className="pt-2">
          <button
            onClick={handleAdminLogin}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-bold text-[var(--app-text)] shadow-xs transition-colors hover:bg-[var(--app-surface-hover)] hover:text-blue-600"
          >
            <ShieldCheck size={14} className="text-blue-600" />
            <span>تسجيل الدخول كمسؤول النظام</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const MaintenanceGuard: React.FC<MaintenanceGuardProps> = ({ children }) => {
  const { isAuthenticated, isReady } = useAuth();
  const { data: maintenanceConfig } = useMaintenanceMode();
  const isMaintenanceActive = maintenanceConfig?.enabled === true;
  const { data: isSuperAdmin, isLoading: isSuperAdminLoading } = useIsSuperAdmin(isMaintenanceActive);

  // ⚡ Fail-open: لا نحجب رندر الواجهة أثناء التحقق من وضع الصيانة في الخلفية
  // لتجنب تأخير فتح التطبيق بانتظار طلبي شبكة متتاليين.
  if (!isReady) {
    return null;
  }

  // إذا لم يكن وضع الصيانة مفعلاً، اسمح بالمرور فوراً
  if (!isMaintenanceActive) {
    return <>{children}</>;
  }

  // أثناء تفعيل الصيانة فقط: انتظر التحقق من صلاحية السوبر أدمن
  if (isAuthenticated && isSuperAdminLoading) {
    return null;
  }

  // إذا كان المستخدم سوبر أدمن، اسمح له بالدخول حتى في وضع الصيانة
  if (isAuthenticated && isSuperAdmin === true) {
    return <>{children}</>;
  }

  // عرض شاشة الصيانة
  return <MaintenanceScreen config={maintenanceConfig} />;
};
