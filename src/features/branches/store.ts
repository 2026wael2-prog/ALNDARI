import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * useBranchFilterStore
 *
 * متجر مركزي لحالة "الفرع النشط" (Active Branch Context).
 * - المدير العام (owner/admin) يمكنه تبديل الفرع عبر BranchSwitcher.
 * - الموظف المقيد بفرع يُحدد من بيانات Auth مباشرة (قراءة فقط — بلا كتابة هنا).
 * - القيمة null تعني "عرض جميع الفروع" (للمديرين فقط).
 *
 * [AUDIT C-1] الفرع النشط مُقيَّد بالشركة (activeCompanyId): أي فرع محفوظ
 * تعود لشركة أخرى يُعتبر قديماً ويُلغى فوراً عبر ensureCompany — يمنع تسريب
 * فلتر الفرع بين الشركات/الجلسات عند تبديل الحساب أو تسجيل الخروج.
 */
interface BranchFilterState {
  activeBranchId: string | null;
  activeBranchName: string | null;
  activeWarehouseId: string | null;
  activeWarehouseName: string | null;
  /** الشركة التي اختير لها الفرع النشط (عزل الفلتر بين الشركات) */
  activeCompanyId: string | null;
  /**
   * هل اختار المدير «جميع الفروع» صراحةً؟
   * الافتراضي false ⇒ يرى فرعه فقط (وليس كل الفروع).
   */
  allBranchesSelected: boolean;
  setActiveBranch: (id: string | null, name: string | null, companyId?: string | null) => void;
  setActiveWarehouse: (id: string | null, name: string | null) => void;
  resetWarehouse: () => void;
  resetToAll: () => void;
  /**
   * يضمن أن الفرع النشط يعود للشركة الحالية؛ يُلغيه إن كان قديماً.
   * @returns true إذا بقي فرع نشط صالح بعد الضبط.
   */
  ensureCompany: (companyId: string | null) => boolean;
}

export const useBranchFilterStore = create<BranchFilterState>()(
  persist(
    (set, get) => ({
      activeBranchId: null,
      activeBranchName: null,
      activeWarehouseId: null,
      activeWarehouseName: null,
      activeCompanyId: null,
      allBranchesSelected: false,
      setActiveBranch: (id, name, companyId) =>
        set(state => ({
          activeBranchId: id,
          activeBranchName: id ? name : null,
          allBranchesSelected: false,
          // تفريغ المستودع النشط عند تغيير الفرع لتفادي تداخل المستودعات بين الفروع
          activeWarehouseId: state.activeBranchId === id ? state.activeWarehouseId : null,
          activeWarehouseName: state.activeBranchId === id ? state.activeWarehouseName : null,
          activeCompanyId: companyId ?? state.activeCompanyId,
        })),
      setActiveWarehouse: (id, name) =>
        set({
          activeWarehouseId: id,
          activeWarehouseName: id ? name : null,
        }),
      resetWarehouse: () =>
        set({
          activeWarehouseId: null,
          activeWarehouseName: null,
        }),
      resetToAll: () =>
        set({
          activeBranchId: null,
          activeBranchName: null,
          activeWarehouseId: null,
          activeWarehouseName: null,
          allBranchesSelected: true,
        }),
      ensureCompany: companyId => {
        const { activeCompanyId, activeBranchId } = get();
        if (activeCompanyId === companyId) return activeBranchId !== null;
        set({
          activeBranchId: null,
          activeBranchName: null,
          activeWarehouseId: null,
          activeWarehouseName: null,
          activeCompanyId: companyId,
          allBranchesSelected: false,
        });
        return false;
      },
    }),
    {
      name: 'alzhra-active-branch',
      partialize: state => ({
        activeBranchId: state.activeBranchId,
        activeBranchName: state.activeBranchName,
        activeWarehouseId: state.activeWarehouseId,
        activeWarehouseName: state.activeWarehouseName,
        activeCompanyId: state.activeCompanyId,
        allBranchesSelected: state.allBranchesSelected,
      }),
    }
  )
);
