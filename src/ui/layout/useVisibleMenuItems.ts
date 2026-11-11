import { useMemo } from 'react';
import { MENU_ITEMS } from '../../core/constants';
import { useAllPermissions } from '../../core/hooks/usePermission';
import { useAuthStore } from '../../features/auth/store';
import type { MenuItem } from '../../core/types';

/**
 * عناصر القائمة المرئية للمستخدم الحالي.
 * فلترة الصلاحيات تبقى حارساً في الواجهة فقط — الحماية الحقيقية عبر RLS والخدمات.
 */
export const useVisibleMenuItems = (): MenuItem[] => {
  const { user } = useAuthStore();
  const { permissions, isLoading } = useAllPermissions();
  const isOwner = user?.role?.toLowerCase() === 'owner';

  return useMemo(
    () =>
      MENU_ITEMS.filter(item => {
        if (!item.requiredPermission) return true;
        if (isOwner) return true;
        if (isLoading) return false;
        return permissions.includes(item.requiredPermission);
      }),
    [isOwner, isLoading, permissions]
  );
};
