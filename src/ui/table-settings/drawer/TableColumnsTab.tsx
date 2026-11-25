import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import type { TableColumnDescriptor } from '../TableSettingsDrawer';
import type { TableSettings } from '../tableSettingsStore';

interface TableColumnsTabProps {
  tableId: string;
  orderedColumns: TableColumnDescriptor[];
  orderedIds: string[];
  availableFields: string[];
  settings: TableSettings;
  onResetColumns: () => void;
  onToggleVisibility: (tableId: string, colId: string) => void;
  onMoveColumn: (tableId: string, orderedIds: string[], from: number, to: number) => void;
  onAddCustomColumn: (tableId: string, col: { id: string; header: string; fieldKey: string }) => void;
  onRemoveCustomColumn: (tableId: string, colId: string) => void;
}

export const TableColumnsTab: React.FC<TableColumnsTabProps> = ({
  tableId,
  orderedColumns,
  orderedIds,
  availableFields,
  settings,
  onResetColumns,
  onToggleVisibility,
  onMoveColumn,
  onAddCustomColumn,
  onRemoveCustomColumn,
}) => {
  const [newColHeader, setNewColHeader] = useState('');
  const [newColField, setNewColField] = useState('');

  if (orderedColumns.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-slate-500">
        هذا الجدول يدعم تخصيص الحجم والتكبير والألوان والخطوط من التبويبات المجاورة.
      </div>
    );
  }

  const visibleCount = orderedColumns.filter(c => !settings.hiddenColumns.includes(c.id)).length;

  const handleAddColumn = () => {
    const field = newColField.trim();
    const header = newColHeader.trim() || field;
    if (!field) return;
    onAddCustomColumn(tableId, { id: `custom:${field}`, header, fieldKey: field });
    setNewColHeader('');
    setNewColField('');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-bold text-slate-700">
          الأعمدة الظاهرة ({visibleCount} / {orderedColumns.length})
        </span>
        <button
          type="button"
          onClick={onResetColumns}
          className="text-[11px] font-bold text-blue-600 hover:underline"
        >
          إظهار الكل وترتيب افتراضي
        </button>
      </div>

      <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
        {orderedColumns.map((col, idx) => {
          const isHidden = settings.hiddenColumns.includes(col.id);
          const disableHide = !isHidden && visibleCount <= 1;
          return (
            <div
              key={col.id}
              className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 ${
                isHidden
                  ? 'border-slate-200 bg-slate-50 text-slate-400'
                  : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={disableHide}
                  onClick={() => {
                    onToggleVisibility(tableId, col.id);
                  }}
                  className={`rounded p-1 ${
                    isHidden
                      ? 'text-slate-400 hover:bg-slate-200'
                      : 'text-emerald-600 hover:bg-emerald-50'
                  } disabled:opacity-40`}
                  title={isHidden ? 'إظهار العمود' : 'إخفاء العمود'}
                >
                  {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <span className="font-bold">{col.header}</span>
                {col.isCustom && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                    مضاف
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => {
                    onMoveColumn(tableId, orderedIds, idx, idx - 1);
                  }}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  title="تحريك للأعلى / اليمين"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  disabled={idx === orderedColumns.length - 1}
                  onClick={() => {
                    onMoveColumn(tableId, orderedIds, idx, idx + 1);
                  }}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  title="تحريك للأسفل / اليسار"
                >
                  <ArrowDown size={13} />
                </button>
                {col.isCustom && (
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveCustomColumn(tableId, col.id);
                    }}
                    className="rounded p-1 text-rose-500 hover:bg-rose-50"
                    title="حذف العمود المضاف"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 font-black text-slate-800">إضافة عمود إضافي للجدول</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-0.5 block text-[10px] font-bold text-slate-500">
              الحقل من البيانات
            </label>
            {availableFields.length > 0 ? (
              <select
                value={newColField}
                onChange={e => {
                  setNewColField(e.target.value);
                  if (!newColHeader) setNewColHeader(e.target.value);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold"
              >
                <option value="">اختر حقلاً...</option>
                {availableFields.map(f => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={newColField}
                onChange={e => {
                  setNewColField(e.target.value);
                }}
                placeholder="مثل: notes أو barcode"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
              />
            )}
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-bold text-slate-500">
              عنوان العمود الظاهر
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newColHeader}
                onChange={e => {
                  setNewColHeader(e.target.value);
                }}
                placeholder="مثل: ملاحظات إضافية"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold"
              />
              <button
                type="button"
                onClick={handleAddColumn}
                disabled={!newColField.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40"
              >
                <Plus size={13} />
                <span>إضافة</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
