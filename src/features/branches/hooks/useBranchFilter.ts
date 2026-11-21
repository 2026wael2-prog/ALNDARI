import { useEffect } from 'react';
import { useAuthStore } from '../../auth/store';
import { canUserSwitchBranches, useBranchFilterStore } from '../store';

/**
 * useBranchFilter
 *
 * Hook مركزي يُعيد `branch_id` الصحيح للاستخدام في فلترة البيانات.
 *
 * السلوك (العزل الصارم بين الفروع):
 * - owner/admin (أو مدير عام غير مرتبط بفرع) → يمكنه التبديل بين الفروع أو اختيار "جميع الفروع"
 * - مدير فرع مقيد بفرع (role === 'manager' + branch_id) أو أي موظف فرعي → يُقيّد تلقائياً وصارماً بـ branch_id الخاص به فقط
 *
 * [AUDIT C-1/M-6] لا كتابة في المتجر المُPersist من هذا الـhook:
 * - فرع الموظف/مدير الفرع يُقرأ من بيانات المصادقة مباشرة في كل استدعاء.
 * - الفرع المحفوظ للمدير العام يُهمل فوراً إذا كان يعود لشركة أخرى (قيمة قديمة)،
 *   ويُعاد ضبط المتجر عبر ensureCompany.
 */
export const useBranchFilter = () => {
  const { user } = useAuthStore();
  const activeBranchId = useBranchFilterStore(s => s.activeBranchId);
  const activeBranchName = useBranchFilterStore(s => s.activeBranchName);
  const activeWarehouseId = useBranchFilterStore(s => s.activeWarehouseId);
  const activeWarehouseName = useBranchFilterStore(s => s.activeWarehouseName);
  const activeCompanyId = useBranchFilterStore(s => s.activeCompanyId);
  const allBranchesSelected = useBranchFilterStore(s => s.allBranchesSelected);
  const ensureCompany = useBranchFilterStore(s => s.ensureCompany);
  const setActiveWarehouse = useBranchFilterStore(s => s.setActiveWarehouse);
  const resetWarehouse = useBranchFilterStore(s => s.resetWarehouse);

  const canSwitchBranches = canUserSwitchBranches(user);
  const userBranchId = user?.branch_id ?? null;
  const userCompanyId = user?.company_id ?? null;

  // فرع محفوظ من شركة أخرى = قديم ويُهمل فوراً (بدون وميض بيانات خاطئة)
  const isStaleStore = activeCompanyId !== null && activeCompanyId !== userCompanyId;
  const managerBranchId = isStaleStore ? null : activeBranchId;
  const managerBranchName = isStaleStore ? null : activeBranchName;
  const managerWarehouseId = isStaleStore ? null : activeWarehouseId;
  const managerWarehouseName = isStaleStore ? null : activeWarehouseName;

  // تهيئة الشركة الحالية / إعادة الضبط عند تبديل الشركة أو تسجيل الخروج
  useEffect(() => {
    ensureCompany(userCompanyId);
  }, [ensureCompany, userCompanyId]);

  // المدير العام (owner/admin): «جميع الفروع» فقط عند اختيارها صراحةً، وإلا فرعه هو الافتراضي.
  // مدير الفرع والموظف الفرعي: مقيدان دائماً بفرعهما فقط.
  const managerEffectiveBranchId = allBranchesSelected
    ? null
    : (managerBranchId ?? userBranchId);
  const managerEffectiveBranchName = allBranchesSelected
    ? null
    : (managerBranchId !== null ? managerBranchName : (user?.branch_name ?? null));

  const effectiveBranchId = canSwitchBranches ? managerEffectiveBranchId : userBranchId;
  const effectiveBranchName = canSwitchBranches
    ? managerEffectiveBranchName
    : (user?.branch_name ?? null);
  const effectiveWarehouseId = canSwitchBranches ? managerWarehouseId : null;
  const effectiveWarehouseName = canSwitchBranches ? managerWarehouseName : null;

  return {
    /** branch_id المُستخدم للفلترة — null يعني "جميع الفروع" (للمدير العام فقط) */
    branchId: effectiveBranchId,
    branchName: effectiveBranchName,
    /** warehouse_id المُستخدم للفلترة — null يعني "جميع مستودعات الفرع" */
    warehouseId: effectiveWarehouseId,
    warehouseName: effectiveWarehouseName,
    setActiveWarehouse,
    resetWarehouse,
    /** هل المستخدم مدير عام يمكنه تبديل الفرع والمستودع؟ */
    isManager: canSwitchBranches,
    /** اسم صريح لصلاحية تبديل الفروع (تطابقاً مع العزل الصارم) */
    canSwitchBranches,
    /** هل المستخدم مقيد بصرامة بفرعه الحالي؟ */
    isBranchLocked: !canSwitchBranches && userBranchId !== null && userBranchId !== '',
    /** هل يُعرض الكل (لا فلترة بفرع) */
    showingAll: canSwitchBranches && effectiveBranchId === null,
    /** هل يُعرض كل المستودعات (لا فلترة بمستودع محدد) */
    showingAllWarehouses: effectiveWarehouseId === null,
  };
};
