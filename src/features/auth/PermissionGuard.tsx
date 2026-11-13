import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { usePermission } from '../../core/hooks/usePermission';
import type { Permission } from '../../core/types/common';

interface PermissionGuardProps {
  permission: Permission;
  label?: string;
  children: React.ReactNode;
}

/**
 * Route-level permission guard backed by `usePermission` (server `has_permission()` RPC
 * with offline role map fallback). Shows a clear Arabic access-denied state when unauthorized.
 */
export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  permission,
  label,
  children,
}) => {
  const { hasPermission, isLoading } = usePermission(permission);

  if (isLoading) {
    return null;
  }

  if (!hasPermission) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-rose-50/70 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/30">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
            <ShieldAlert size={24} />
          </div>
          <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">
            لا توجد صلاحية للوصول
          </h2>
          <p className="mt-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
            عذراً، لا تمتلك صلاحية عرض {label || 'هذه الصفحة'} ({permission}). يرجى مراجعة مدير
            النظام.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default PermissionGuard;

