import React, { useMemo, useState } from 'react';
import { Settings2 } from 'lucide-react';
import {
  TableSettingsDrawer,
  type TableColumnDescriptor,
} from './TableSettingsDrawer';
import { useTableSettingsStore } from './tableSettingsStore';
import { buildTableCustomStyle, hasActiveTableCustomization } from './tableSettingsStyles';

interface TableSettingsButtonProps {
  tableId: string;
  tableTitle?: string | undefined;
  columns?: TableColumnDescriptor[] | undefined;
  availableFields?: string[] | undefined;
  onZoomSync?: ((zoom: number) => void) | undefined;
  onResetWidths?: (() => void) | undefined;
  compact?: boolean | undefined;
  className?: string | undefined;
}

/**
 * أيقونة إعدادات موحّدة تُضاف لشريط أدوات أي جدول في التطبيق.
 */
export const TableSettingsButton: React.FC<TableSettingsButtonProps> = ({
  tableId,
  tableTitle,
  columns,
  availableFields,
  onZoomSync,
  onResetWidths,
  compact = true,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const tables = useTableSettingsStore(s => s.tables);
  const globalDefaults = useTableSettingsStore(s => s.globalStyleDefaults);
  const getSettings = useTableSettingsStore(s => s.getSettings);

  const isCustomized = useMemo(
    () => hasActiveTableCustomization(getSettings(tableId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tableId, tables, globalDefaults]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`no-print relative inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors ${
          isCustomized
            ? 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100'
            : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]'
        } ${className}`}
        title="إعدادات الجدول (الأعمدة، التكبير، الألوان، الخطوط)"
      >
        <Settings2 size={14} />
        {!compact && <span>إعدادات الجدول</span>}
        {isCustomized && (
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" aria-hidden="true" />
        )}
      </button>

      {open && (
        <TableSettingsDrawer
          isOpen={open}
          onClose={() => setOpen(false)}
          tableId={tableId}
          tableTitle={tableTitle}
          columns={columns}
          availableFields={availableFields}
          onZoomSync={onZoomSync}
          onResetWidths={onResetWidths}
        />
      )}
    </>
  );
};

/**
 * هوك خفيف لأي جدول مستقل (`<table>`) يوفّر له خصائص الـ CSS المخصّصة وحالة التخصيص فوراً.
 */
export function useTableCustomization(tableId: string) {
  const tables = useTableSettingsStore(s => s.tables);
  const globalDefaults = useTableSettingsStore(s => s.globalStyleDefaults);
  const getSettings = useTableSettingsStore(s => s.getSettings);

  return useMemo(() => {
    const settings = getSettings(tableId);
    const customized = hasActiveTableCustomization(settings);
    const style = customized ? buildTableCustomStyle(settings) : undefined;
    return {
      settings,
      customized,
      containerProps: {
        'data-table-customized': customized ? 'true' : undefined,
        style,
      } as React.HTMLAttributes<HTMLDivElement>,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, tables, globalDefaults]);
}

/**
 * غلاف جاهز لأي جدول مستقل: يضيف شريطاً رفيعاً بأيقونة الإعدادات ⚙ ويطبّق الألوان والخطوط والتكبير فوراً.
 */
export const CustomizableTableWrapper: React.FC<{
  tableId: string;
  tableTitle?: string;
  columns?: TableColumnDescriptor[];
  children: React.ReactNode;
  className?: string;
}> = ({ tableId, tableTitle, columns, children, className = '' }) => {
  const { settings, customized, containerProps } = useTableCustomization(tableId);

  return (
    <div className={`relative w-full ${className}`} {...containerProps}>
      <div className="no-print mb-1 flex items-center justify-end px-1">
        <TableSettingsButton
          tableId={tableId}
          tableTitle={tableTitle}
          columns={columns}
          compact={false}
        />
      </div>
      <div
        style={
          customized && settings.zoom !== 1
            ? { fontSize: `${Math.round(settings.fontSize * settings.zoom)}px` }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
};

export default TableSettingsButton;
