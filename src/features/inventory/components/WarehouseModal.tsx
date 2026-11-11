import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Package, MapPin, Hash } from 'lucide-react';
import Modal from '../../../ui/base/Modal';
import Button from '../../../ui/base/Button';
import Input from '../../../ui/base/Input';
import { useBranches } from '../../settings/hooks';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';

interface WarehouseFormValues {
  id?: string;
  name_ar: string;
  location: string;
  branch_id?: string | null;
  code?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: WarehouseFormValues) => void;
  isSaving: boolean;
  initialData?: WarehouseFormValues | null;
}

const WarehouseModal: React.FC<Props> = ({ isOpen, onClose, onSave, isSaving, initialData }) => {
  const { register, handleSubmit, reset } = useForm<WarehouseFormValues>();
  const { data: branches = [] } = useBranches();
  const { branchId: activeBranchId, isManager } = useBranchFilter();

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        reset({
          ...initialData,
          branch_id: initialData.branch_id ?? activeBranchId ?? '',
        });
      } else {
        reset({
          name_ar: '',
          location: '',
          branch_id: activeBranchId ?? branches[0]?.id ?? '',
          code: '',
        });
      }
    }
  }, [isOpen, initialData, activeBranchId, branches, reset]);

  const handleFormSubmit = (values: WarehouseFormValues): void => {
    const trimmedBranch = values.branch_id !== undefined && values.branch_id !== null
      ? values.branch_id.trim()
      : '';
    onSave({
      ...values,
      branch_id: trimmedBranch !== '' ? trimmedBranch : null,
    });
  };

  const footer = (
    <>
      <Button variant="outline" onClick={onClose} className="flex-1">إلغاء</Button>
      <Button
        onClick={() => void handleSubmit(handleFormSubmit)()}
        isLoading={isSaving}
        className="flex-1"
      >
        {initialData ? 'حفظ التعديلات' : 'إضافة مستودع'}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      icon={Package}
      title={initialData ? "تعديل بيانات المستودع" : "مستودع جديد"}
      description="إدارة مواقع تخزين البضاعة وتخصيصها للفروع"
      footer={footer}
    >
      <form className="space-y-4 text-right">
        <Input
          label="اسم المستودع"
          placeholder="مثال: المستودع الرئيسي / مستودع قطع المحركات"
          {...register('name_ar', { required: true })}
          icon={<Package size={16} />}
        />

        <div className="space-y-1">
          <span className="block text-xs font-bold text-[var(--app-text)]">
            الفرع المالك للمستودع
          </span>
          <div className="relative">
            <select
              {...register('branch_id')}
              disabled={!isManager && Boolean(activeBranchId)}
              className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-xs text-[var(--app-text)] outline-none focus:border-[var(--accent)] disabled:opacity-60"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {(b as { name_ar?: string; name: string }).name_ar ?? b.name} {b.is_main === true ? '(المركز الرئيسي)' : ''}
                </option>
              ))}
              <option value="">مستودع عام للشركة (كافة الفروع)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="رمز / كود المستودع (اختياري)"
            placeholder="WH-01"
            dir="ltr"
            {...register('code')}
            icon={<Hash size={16} />}
          />
          <Input
            label="الموقع / العنوان (اختياري)"
            placeholder="المنطقة الصناعية - بوابة 2"
            {...register('location')}
            icon={<MapPin size={16} />}
          />
        </div>
      </form>
    </Modal>
  );
};
export default WarehouseModal;