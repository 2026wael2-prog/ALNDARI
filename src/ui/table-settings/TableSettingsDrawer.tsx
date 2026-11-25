import React, { useMemo, useState } from 'react';
import { X, Columns, Maximize2, Palette, Type, RotateCcw, Check, Copy } from 'lucide-react';
import { useTableSettingsStore, type TableSettings } from './tableSettingsStore';
import { TableColumnsTab } from './drawer/TableColumnsTab';
import { TableLayoutTab } from './drawer/TableLayoutTab';
import { TableColorsTab, TableFontsTab } from './drawer/TableAppearanceTabs';

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
  columns?: TableColumnDescriptor[] | undefined;
  availableFields?: string[] | undefined;
  onZoomSync?: ((zoom: number) => void) | undefined;
  onResetWidths?: (() => void) | undefined;
}

type SettingsTab = 'columns' | 'layout' | 'colors' | 'fonts';

const SETTINGS_TABS = [
  { id: 'columns', label: 'الأعمدة', icon: Columns },
  { id: 'layout', label: 'الحجم والتكبير', icon: Maximize2 },
  { id: 'colors', label: 'الألوان', icon: Palette },
  { id: 'fonts', label: 'الخطوط', icon: Type },
] as const;

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
    return [...merged].sort((a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999));
  }, [columns, settings.customColumns, settings.columnOrder]);

  const orderedIds = useMemo(() => orderedColumns.map(c => c.id), [orderedColumns]);

  if (!isOpen) return null;

  const handleUpdate = (patch: Partial<TableSettings>) => {
    updateTable(tableId, patch);
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
    setTimeout(() => {
      setCopiedAll(false);
    }, 1800);
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-xs sm:items-center sm:p-3"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-slate-300 bg-white pb-[env(safe-area-inset-bottom)] text-right text-slate-900 shadow-2xl sm:rounded-2xl sm:pb-0"
        onClick={e => {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4 sm:py-3">
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
            aria-label="إغلاق إعدادات الجدول"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 border-b border-slate-200 bg-slate-100/70 p-1.5 text-xs font-bold sm:grid-cols-4">
          {SETTINGS_TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                }}
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

        <div className="flex-1 overflow-y-auto p-4 text-xs">
          {activeTab === 'columns' && (
            <TableColumnsTab
              tableId={tableId}
              orderedColumns={orderedColumns}
              orderedIds={orderedIds}
              availableFields={availableFields}
              settings={settings}
              onResetColumns={() => {
                updateTable(tableId, { hiddenColumns: [], columnOrder: [] });
              }}
              onToggleVisibility={toggleColumnVisibility}
              onMoveColumn={moveColumn}
              onAddCustomColumn={addCustomColumn}
              onRemoveCustomColumn={removeCustomColumn}
            />
          )}
          {activeTab === 'layout' && (
            <TableLayoutTab
              settings={settings}
              onZoomChange={handleZoomChange}
              onUpdate={handleUpdate}
            />
          )}
          {activeTab === 'colors' && <TableColorsTab settings={settings} onUpdate={handleUpdate} />}
          {activeTab === 'fonts' && <TableFontsTab settings={settings} onUpdate={handleUpdate} />}
        </div>

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
