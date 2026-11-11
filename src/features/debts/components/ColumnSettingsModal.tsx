import React from 'react';
import { SlidersHorizontal, Check, RotateCcw, Lock } from 'lucide-react';
import DebtsModalShell from './DebtsModalShell';
import { cn } from '../../../core/utils';

export interface ColumnDefItem {
  id: string;
  label: string;
  description: string;
  isLocked?: boolean;
}

export const ALL_COLUMNS: ColumnDefItem[] = [
  { id: 'party', label: 'العميل', description: 'اسم العميل ورقم هاتفه', isLocked: true },
  { id: 'outstanding_balance', label: 'الرصيد المستحق', description: 'المبلغ الأصلي بالعملة المقيدة' },
  { id: 'base_balance', label: 'المعادل بالعملة الأساسية', description: 'تحويل الرصيد لعملة المنشأة (SAR / YER)' },
  { id: 'critical', label: 'الديون الحرجة', description: 'تحديد الخطر والوعود المخلفة والتعثر الحرج' },
  { id: 'collector', label: 'المسؤول', description: 'المحصل المسند إليه متابعة العميل' },
  { id: 'status_days', label: 'الحالة وأيام التأخير', description: 'تصنيف المديونية وعدد أيام التأخير' },
  { id: 'reminder', label: 'المتابعة والتذكير', description: 'حالة التذكير وتاريخ آخر رسالة' },
  { id: 'promise', label: 'وعد السداد', description: 'تاريخ الوعد القادم وحالة الالتزام' },
  { id: 'oldest_due_date', label: 'أقدم استحقاق', description: 'تاريخ أقدم فاتورة مستحقة' },
  { id: 'last_contact_date', label: 'آخر تواصل', description: 'تاريخ آخر نشاط متابعة تم تسجيله' },
  { id: 'escalation_stage', label: 'مرحلة التصعيد', description: 'مرحلة الخطاب (ودي، رسمي، إنذار، قانوني)' },
  { id: 'actions', label: 'الإجراءات والتحصيل', description: 'أزرار السند، الواتساب، وكشف الحساب', isLocked: true },
];

export const DEFAULT_COLUMNS = [
  'party',
  'outstanding_balance',
  'base_balance',
  'critical',
  'collector',
  'status_days',
  'reminder',
  'promise',
  'actions',
];

export const COMPACT_PRESET = [
  'party',
  'outstanding_balance',
  'base_balance',
  'critical',
  'status_days',
  'actions',
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  visibleColumns: string[];
  onChangeColumns: (cols: string[]) => void;
  onResetDefaults: () => void;
}

export const ColumnSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  visibleColumns,
  onChangeColumns,
  onResetDefaults,
}) => {
  const toggleColumn = (colId: string) => {
    if (colId === 'party' || colId === 'actions') return; // Locked columns

    if (visibleColumns.includes(colId)) {
      onChangeColumns(visibleColumns.filter(id => id !== colId));
    } else {
      onChangeColumns([...visibleColumns, colId]);
    }
  };

  const handleSelectAll = () => {
    onChangeColumns(ALL_COLUMNS.map(c => c.id));
  };

  const handleSelectPreset = (preset: string[]) => {
    onChangeColumns(preset);
  };

  return (
    <DebtsModalShell
      isOpen={isOpen}
      onClose={onClose}
      icon={<SlidersHorizontal size={18} />}
      iconClassName="bg-blue-500/10 text-blue-600 dark:text-blue-400"
      title="تخصيص وإدارة أعمدة الجدول"
      description="حدد الأعمدة المطلوب إظهارها أو إخفاؤها في جدول الديون والمتابعة"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <button
            type="button"
            onClick={onResetDefaults}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]"
          >
            <RotateCcw size={13} />
            <span>إعادة الضبط للافتراضي</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700"
          >
            <Check size={13} />
            <span>حفظ وتطبيق</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4" dir="rtl">
        {/* Quick presets */}
        <div>
          <span className="mb-2 block text-xs font-bold text-[var(--app-text-muted)]">
            نماذج عرض سريعة:
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleSelectPreset(DEFAULT_COLUMNS)}
              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] px-2.5 py-1 text-xs font-bold text-[var(--app-text)] hover:border-blue-500/40"
            >
              العرض المتوازن (موصى به)
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset(COMPACT_PRESET)}
              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] px-2.5 py-1 text-xs font-bold text-[var(--app-text)] hover:border-blue-500/40"
            >
              العرض المركز (موجز)
            </button>
            <button
              type="button"
              onClick={handleSelectAll}
              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] px-2.5 py-1 text-xs font-bold text-[var(--app-text)] hover:border-blue-500/40"
            >
              إظهار كافة الأعمدة ({ALL_COLUMNS.length})
            </button>
          </div>
        </div>

        {/* Column toggles grid */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ALL_COLUMNS.map(col => {
            const isChecked = visibleColumns.includes(col.id);
            const isLocked = col.isLocked;

            return (
              <label
                key={col.id}
                className={cn(
                  'flex items-center justify-between rounded-xl border p-2.5 transition select-none',
                  isChecked
                    ? 'border-blue-500/40 bg-blue-500/5 dark:bg-blue-950/20'
                    : 'border-[var(--app-border)] bg-[var(--app-surface)] opacity-70 hover:opacity-100',
                  isLocked ? 'cursor-not-allowed' : 'cursor-pointer hover:border-blue-500/30'
                )}
                onClick={e => {
                  if (isLocked) {
                    e.preventDefault();
                    return;
                  }
                  toggleColumn(col.id);
                }}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isLocked}
                    onChange={() => {}}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--app-text)]">{col.label}</span>
                    <span className="block text-[10px] text-[var(--app-text-muted)]">
                      {col.description}
                    </span>
                  </div>
                </div>

                {isLocked && (
                  <span
                    className="flex items-center gap-1 rounded bg-[var(--app-surface)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--app-text-muted)]"
                    title="هذا العمود أساسي ولا يمكن إخفاؤه"
                  >
                    <Lock size={10} />
                    <span>أساسي</span>
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </DebtsModalShell>
  );
};
