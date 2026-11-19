import React, { useMemo, useState } from 'react';
import {
  X,
  Columns,
  Maximize2,
  Palette,
  Type,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  RotateCcw,
  Check,
  Copy,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  TABLE_COLOR_PRESETS,
  TABLE_FONT_OPTIONS,
  useTableSettingsStore,
  type TableDensity,
  type TableFontWeight,
} from './tableSettingsStore';

export interface TableColumnDescriptor {
  id: string;
  header: string;
  isCustom?: boolean;
  fieldKey?: string;
}

export interface TableSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  tableTitle?: string | undefined;
  /** قائمة الأعمدة الحالية في الجدول (الأصلية + المخصصة) */
  columns?: TableColumnDescriptor[] | undefined;
  /** مفاتيح الحقول المقترحة لإضافة أعمدة جديدة (مشتقة من بيانات الصف الأول) */
  availableFields?: string[] | undefined;
  /** رد فعل اختياري عند تغيير التكبير إذا كان الجدول يدير zoom محلياً */
  onZoomSync?: ((zoom: number) => void) | undefined;
  /** رد فعل اختياري لإعادة ضبط عروض الأعمدة */
  onResetWidths?: (() => void) | undefined;
}

type SettingsTab = 'columns' | 'layout' | 'colors' | 'fonts';

export const TableSettingsDrawer: React.FC<TableSettingsDrawerProps> = ({
  isOpen,
  onClose,
  tableId,
  tableTitle,
  columns = [],
  availableFields = [],
  onZoomSync,
  onResetWidths,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    columns.length > 0 ? 'columns' : 'layout'
  );
  const [newColHeader, setNewColHeader] = useState('');
  const [newColField, setNewColField] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);

  const tablesMap = useTableSettingsStore(s => s.tables);
  const globalStyleDefaults = useTableSettingsStore(s => s.globalStyleDefaults);
  const getSettings = useTableSettingsStore(s => s.getSettings);
  const updateTable = useTableSettingsStore(s => s.updateTable);
  const toggleColumnVisibility = useTableSettingsStore(s => s.toggleColumnVisibility);
  const moveColumn = useTableSettingsStore(s => s.moveColumn);
  const addCustomColumn = useTableSettingsStore(s => s.addCustomColumn);
  const removeCustomColumn = useTableSettingsStore(s => s.removeCustomColumn);
  const applyStyleToAllTables = useTableSettingsStore(s => s.applyStyleToAllTables);
  const resetTable = useTableSettingsStore(s => s.resetTable);

  const settings = useMemo(
    () => getSettings(tableId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tableId, tablesMap, globalStyleDefaults]
  );

  // دمج الأعمدة الأصلية مع الأعمدة المخصصة وترتيبها حسب columnOrder
  const orderedColumns = useMemo(() => {
    const customDescs: TableColumnDescriptor[] = settings.customColumns.map(c => ({
      id: c.id,
      header: c.header,
      isCustom: true,
      fieldKey: c.fieldKey,
    }));
    const existingIds = new Set(columns.map(c => c.id));
    const merged = [...columns, ...customDescs.filter(c => !existingIds.has(c.id))];
    if (settings.columnOrder.length === 0) return merged;

    const orderMap = new Map(settings.columnOrder.map((id, idx) => [id, idx]));
    return [...merged].sort((a, b) => {
      const ia = orderMap.get(a.id) ?? 9999;
      const ib = orderMap.get(b.id) ?? 9999;
      return ia - ib;
    });
  }, [columns, settings.customColumns, settings.columnOrder]);

  const orderedIds = useMemo(() => orderedColumns.map(c => c.id), [orderedColumns]);

  if (!isOpen) return null;

  const visibleCount = orderedColumns.filter(c => !settings.hiddenColumns.includes(c.id)).length;

  const handleAddColumn = () => {
    const field = newColField.trim();
    const header = newColHeader.trim() || field;
    if (!field) return;
    addCustomColumn(tableId, {
      id: `custom:${field}`,
      header,
      fieldKey: field,
    });
    setNewColHeader('');
    setNewColField('');
  };

  const handleZoomChange = (nextZoom: number) => {
    const clamped = Math.round(Math.min(1.5, Math.max(0.75, nextZoom)) * 100) / 100;
    updateTable(tableId, { zoom: clamped });
    onZoomSync?.(clamped);
  };

  const handleReset = () => {
    resetTable(tableId);
    onZoomSync?.(1);
    onResetWidths?.();
  };

  const handleApplyAll = () => {
    applyStyleToAllTables(settings);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1800);
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-xs"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white text-right text-slate-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">
              إعدادات الجدول {tableTitle ? `— ${tableTitle}` : ''}
            </h3>
            <p className="text-[11px] text-slate-500">
              تخصيص الأعمدة، التكبير والكثافة، الألوان، والخطوط (يُحفظ تلقائياً)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-4 gap-1 border-b border-slate-200 bg-slate-100/70 p-1.5 text-xs font-bold">
          {(
            [
              { id: 'columns', label: 'الأعمدة', icon: Columns },
              { id: 'layout', label: 'الحجم والتكبير', icon: Maximize2 },
              { id: 'colors', label: 'الألوان', icon: Palette },
              { id: 'fonts', label: 'الخطوط', icon: Type },
            ] as const
          ).map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 transition-all ${
                  active
                    ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-300'
                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                }`}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 text-xs">
          {/* 1. الأعمدة */}
          {activeTab === 'columns' && (
            <div className="space-y-3">
              {orderedColumns.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-slate-500">
                  هذا الجدول يدعم تخصيص الحجم والتكبير والألوان والخطوط من التبويبات المجاورة.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">
                      الأعمدة الظاهرة ({visibleCount} / {orderedColumns.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => updateTable(tableId, { hiddenColumns: [], columnOrder: [] })}
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
                              onClick={() => toggleColumnVisibility(tableId, col.id)}
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
                              onClick={() => moveColumn(tableId, orderedIds, idx, idx - 1)}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                              title="تحريك للأعلى / اليمين"
                            >
                              <ArrowUp size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={idx === orderedColumns.length - 1}
                              onClick={() => moveColumn(tableId, orderedIds, idx, idx + 1)}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                              title="تحريك للأسفل / اليسار"
                            >
                              <ArrowDown size={13} />
                            </button>
                            {col.isCustom && (
                              <button
                                type="button"
                                onClick={() => removeCustomColumn(tableId, col.id)}
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

                  {/* إضافة عمود جديد */}
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
                            onChange={e => setNewColField(e.target.value)}
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
                            onChange={e => setNewColHeader(e.target.value)}
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
                </>
              )}
            </div>
          )}

          {/* 2. الحجم والتكبير والكثافة */}
          {activeTab === 'layout' && (
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between font-bold">
                  <span>نسبة التكبير والتصغير (Zoom)</span>
                  <span className="font-mono text-slate-700">{Math.round(settings.zoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.75}
                  max={1.5}
                  step={0.05}
                  value={settings.zoom}
                  onChange={e => handleZoomChange(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                  <span>75%</span>
                  <span>100%</span>
                  <span>125%</span>
                  <span>150%</span>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between font-bold">
                  <span>حجم الخط داخل الجدول</span>
                  <span className="font-mono text-slate-700">{settings.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={18}
                  step={1}
                  value={settings.fontSize}
                  onChange={e => updateTable(tableId, { fontSize: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div>
                <div className="mb-1.5 font-bold">كثافة وارتفاع الصفوف</div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'compact', label: 'مضغوط (محاسبي)' },
                      { id: 'normal', label: 'متوازن' },
                      { id: 'comfortable', label: 'واسع ومريح' },
                    ] as Array<{ id: TableDensity; label: string }>
                  ).map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => updateTable(tableId, { density: d.id })}
                      className={`rounded-xl border py-2 font-bold transition-all ${
                        settings.density === d.id
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-bold">
                <span>التفاف النصوص الطويلة تلقائياً داخل الخلايا</span>
                <input
                  type="checkbox"
                  checked={settings.wrapText}
                  onChange={e => updateTable(tableId, { wrapText: e.target.checked })}
                />
              </label>
            </div>
          )}

          {/* 3. الألوان */}
          {activeTab === 'colors' && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 font-bold">قوالب لونية جاهزة</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {TABLE_COLOR_PRESETS.map(preset => {
                    const isSelected =
                      settings.headerBg === preset.headerBg &&
                      settings.borderColor === preset.borderColor;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          updateTable(tableId, {
                            headerBg: preset.headerBg,
                            headerText: preset.headerText,
                            zebraBg: preset.zebraBg,
                            borderColor: preset.borderColor,
                            hoverBg: preset.hoverBg,
                          })
                        }
                        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-right font-bold transition-all ${
                          isSelected
                            ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className="h-4 w-4 shrink-0 rounded-full border border-slate-400"
                          style={{ backgroundColor: preset.headerBg || '#f1f5f9' }}
                        />
                        <span className="truncate text-[11px]">{preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(
                  [
                    { key: 'headerBg', label: 'خلفية الترويسة', fallback: '#e5e7eb' },
                    { key: 'headerText', label: 'نص الترويسة', fallback: '#0f172a' },
                    { key: 'zebraBg', label: 'الصفوف المتناوبة', fallback: '#f8fafc' },
                    { key: 'borderColor', label: 'حدود الشبكة', fallback: '#cbd5e1' },
                    { key: 'hoverBg', label: 'لون التمرير', fallback: '#f0f9ff' },
                  ] as const
                ).map(item => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 font-bold"
                  >
                    <span className="text-[11px]">{item.label}</span>
                    <input
                      type="color"
                      value={settings[item.key] || item.fallback}
                      onChange={e => updateTable(tableId, { [item.key]: e.target.value })}
                      className="h-6 w-8 cursor-pointer rounded border border-slate-300 bg-transparent"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 4. الخطوط */}
          {activeTab === 'fonts' && (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 font-bold">نوع الخط العربي للجدول</div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {TABLE_FONT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateTable(tableId, { fontFamily: opt.value })}
                      style={{ fontFamily: opt.value }}
                      className={`rounded-xl border px-3 py-2 text-right font-bold transition-all ${
                        settings.fontFamily === opt.value
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 font-bold">سماكة الخط</div>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      { value: '400', label: 'عادي' },
                      { value: '600', label: 'متوسط' },
                      { value: '700', label: 'عريض' },
                      { value: '800', label: 'سميك' },
                    ] as Array<{ value: TableFontWeight; label: string }>
                  ).map(w => (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() => updateTable(tableId, { fontWeight: w.value })}
                      className={`rounded-xl border py-1.5 font-bold ${
                        settings.fontWeight === w.value
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-bold">
                <span>محاذاة الأرقام المالية بدقة محاسبية (Tabular Nums)</span>
                <input
                  type="checkbox"
                  checked={settings.tabularNums}
                  onChange={e => updateTable(tableId, { tabularNums: e.target.checked })}
                />
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-slate-700 hover:bg-slate-100"
            >
              <RotateCcw size={13} />
              <span>استعادة الافتراضي</span>
            </button>
            <button
              type="button"
              onClick={handleApplyAll}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-slate-700 hover:bg-slate-100"
              title="نسخ الألوان والخط والتكبير إلى جميع جداول التطبيق"
            >
              {copiedAll ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
              <span>{copiedAll ? 'تم التعميم!' : 'تعميم على كل الجداول'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-1.5 font-bold text-white hover:bg-slate-800"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

export default TableSettingsDrawer;
