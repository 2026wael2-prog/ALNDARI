import React from 'react';
import { ClipboardCheck, Save, CheckCircle, Loader2, PackageSearch, Plus } from 'lucide-react';
import MicroHeader from '../../../../ui/base/MicroHeader';
import Button from '../../../../ui/base/Button';

interface AuditSessionHeaderProps {
  title: string;
  isCompleted: boolean;
  isRestoring: boolean;
  saveStatus: string;
  canManageAudit: boolean;
  isSavingProgress: boolean;
  isFinalizing: boolean;
  isPopulatingWarehouse: boolean;
  onOpenAddProduct: () => void;
  onOpenBulkConfirm: () => void;
  onSave: () => void;
  onFinalize: () => void;
}

/**
 * حالة الحفظ — خانة ثابتة العرض تمنع قفز أزرار الرأس أفقياً عند تبدّل النص
 * بين «استعادة...» و«حفظ...» و«لا شيء».
 */
const SaveStatusHint: React.FC<{ isRestoring: boolean; saveStatus: string }> = ({
  isRestoring,
  saveStatus,
}) => (
  <span className="ml-2 hidden w-14 select-none self-center text-center text-[10px] md:inline-block">
    {isRestoring ? (
      <span className="animate-pulse text-blue-500">استعادة...</span>
    ) : saveStatus === 'saving' ? (
      <span className="text-amber-500">حفظ...</span>
    ) : null}
  </span>
);

/** «منتج جديد» — إضافة صنف دون مغادرة الجلسة. */
const AddProductAction: React.FC<{ onOpenAddProduct: () => void }> = ({ onOpenAddProduct }) => (
  <Button
    variant="outline"
    size="sm"
    onClick={onOpenAddProduct}
    leftIcon={<Plus size={14} className="text-emerald-600" />}
    title="إضافة منتج جديد دون مغادرة الجلسة"
    className="border-emerald-300 bg-emerald-50 px-2.5 font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 sm:px-3"
  >
    <span>منتج جديد</span>
  </Button>
);

/** «جرد كامل» — تعبئة أصناف المستودع (يتطلب صلاحية إدارة الجرد). */
const BulkPopulateAction: React.FC<{
  isPopulatingWarehouse: boolean;
  onOpenBulkConfirm: () => void;
}> = ({ isPopulatingWarehouse, onOpenBulkConfirm }) => (
  <Button
    variant="outline"
    size="sm"
    onClick={onOpenBulkConfirm}
    isLoading={isPopulatingWarehouse}
    leftIcon={
      isPopulatingWarehouse ? <Loader2 size={12} className="animate-spin" /> : <PackageSearch size={12} />
    }
    title="جرد كامل للمستودع"
    className="px-2 sm:px-3"
  >
    <span className="hidden sm:inline">جرد كامل</span>
  </Button>
);

/** «حفظ» — حفظ مسودة التقدّم. */
const SaveProgressAction: React.FC<{ isSavingProgress: boolean; onSave: () => void }> = ({
  isSavingProgress,
  onSave,
}) => (
  <Button
    variant="outline"
    size="sm"
    onClick={onSave}
    isLoading={isSavingProgress}
    leftIcon={<Save size={12} />}
    title="حفظ مسودة"
    className="px-2 sm:px-3"
  >
    <span className="hidden sm:inline">حفظ</span>
  </Button>
);

/** «إنهاء وترحيل» — الإغلاق النهائي للجلسة. */
const FinalizeAction: React.FC<{
  isCompleted: boolean;
  canManageAudit: boolean;
  isFinalizing: boolean;
  onFinalize: () => void;
}> = ({ isCompleted, canManageAudit, isFinalizing, onFinalize }) => (
  <Button
    variant="success"
    size="sm"
    onClick={onFinalize}
    isLoading={isFinalizing}
    disabled={isCompleted || !canManageAudit}
    leftIcon={<CheckCircle size={12} />}
    className="border-none bg-emerald-600 px-2 hover:bg-emerald-700 sm:px-3"
    title={canManageAudit ? 'إنهاء وترحيل' : 'يتطلب صلاحية مدير/مالك'}
  >
    <span className="hidden sm:inline">{isCompleted ? 'تم الإغلاق' : 'إنهاء وترحيل'}</span>
  </Button>
);

const AuditHeaderActions: React.FC<Omit<AuditSessionHeaderProps, 'title'>> = props => (
  <div className="flex items-center gap-1 sm:gap-2">
    <SaveStatusHint isRestoring={props.isRestoring} saveStatus={props.saveStatus} />
    {!props.isCompleted && <AddProductAction onOpenAddProduct={props.onOpenAddProduct} />}
    {!props.isCompleted && props.canManageAudit && (
      <BulkPopulateAction
        isPopulatingWarehouse={props.isPopulatingWarehouse}
        onOpenBulkConfirm={props.onOpenBulkConfirm}
      />
    )}
    <SaveProgressAction isSavingProgress={props.isSavingProgress} onSave={props.onSave} />
    <FinalizeAction
      isCompleted={props.isCompleted}
      canManageAudit={props.canManageAudit}
      isFinalizing={props.isFinalizing}
      onFinalize={props.onFinalize}
    />
  </div>
);

export const AuditSessionHeader: React.FC<AuditSessionHeaderProps> = ({
  title,
  ...actionsProps
}) => {
  return (
    <MicroHeader
      title={title || 'جلسة جرد'}
      icon={ClipboardCheck}
      actions={<AuditHeaderActions {...actionsProps} />}
    />
  );
};
