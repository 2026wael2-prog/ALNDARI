/**
 * واجهة موحّدة لإجراءات أصناف الجرد.
 *
 * يجمع هوكَين صغيرين (إضافة/حذف) خلف واجهة واحدة كي تبقى الصفحة تقرأ من مصدر
 * واحد. فُصل المنطق إلى:
 *  • `useAuditItemAddition` — البحث/المسح ومجمّع الباركود.
 *  • `useAuditItemRemoval`  — الحذف المتفائل مع التراجع.
 * والدوال النقية في `utils/auditItemHelpers`.
 */
import type { UseFormReturn } from 'react-hook-form';
import type { Product } from '../types';
import type { AddItemToAudit, AuditItems, RemoveItemFromAudit } from '../utils/auditItemHelpers';
import { useAuditItemAddition } from './useAuditItemAddition';
import { useAuditItemRemoval, type AuditItemTarget } from './useAuditItemRemoval';
import type { AuditFormValues } from './useAuditSessionForm';

export type { AuditItemTarget };

export interface AuditItemActionsOptions {
  sessionId: string | undefined;
  isCompleted: boolean;
  warehouseId: string | undefined;
  getValues: UseFormReturn<AuditFormValues>['getValues'];
  /** يحدّث النموذج + المسودة + البصمة في خطوة واحدة. */
  syncItems: (items: AuditItems) => void;
  addItemToAudit: AddItemToAudit;
  removeItemFromAudit: RemoveItemFromAudit;
}

export interface AuditItemActionsReturn {
  filter: string;
  setFilter: (value: string) => void;
  showResults: boolean;
  setShowResults: (value: boolean) => void;
  itemToDelete: AuditItemTarget | null;
  setItemToDelete: (target: AuditItemTarget | null) => void;
  handleAddItem: (product: Product) => void;
  confirmRemoveItem: () => void;
  resetSearch: () => void;
}

export const useAuditItemActions = (
  options: AuditItemActionsOptions
): AuditItemActionsReturn => {
  const addition = useAuditItemAddition({
    sessionId: options.sessionId,
    isCompleted: options.isCompleted,
    warehouseId: options.warehouseId,
    getValues: options.getValues,
    syncItems: options.syncItems,
    addItemToAudit: options.addItemToAudit,
  });
  const removal = useAuditItemRemoval({
    sessionId: options.sessionId,
    getValues: options.getValues,
    syncItems: options.syncItems,
    removeItemFromAudit: options.removeItemFromAudit,
  });

  return { ...addition, ...removal };
};
