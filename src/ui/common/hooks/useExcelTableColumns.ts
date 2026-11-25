import { useCallback, useMemo } from 'react';
import type { Column } from '../ExcelTable';
import {
  buildDefaultColumnWidths,
  getColumnIds,
  migrateLegacyIndexWidths,
  toIndexedWidths,
  type ColumnWidths,
} from '../excelTableColumnWidths';
import { useColumnResize } from './useColumnResize';
import type { TableColumnDescriptor } from '../../table-settings/TableSettingsDrawer';
import type { TableSettings } from '../../table-settings/tableSettingsStore';

interface UseExcelTableColumnsParams<T> {
  columns: Array<Column<T>>;
  data: T[];
  tableSettings: TableSettings;
  resizeStorageKey?: string | undefined;
  title?: string | undefined;
  isRTL: boolean;
}

export function useExcelTableColumns<T>({
  columns,
  data,
  tableSettings,
  resizeStorageKey,
  title,
  isRTL,
}: UseExcelTableColumnsParams<T>) {
  const baseColumnDescriptors = useMemo<TableColumnDescriptor[]>(() => {
    const ids = getColumnIds(columns);
    return columns.map((col, idx) => ({
      id: ids[idx] ?? String(idx),
      header: col.header,
    }));
  }, [columns]);

  const availableFields = useMemo<string[]>(() => {
    const sample = data[0];
    if (!sample || typeof sample !== 'object') return [];
    return Object.keys(sample as Record<string, unknown>).filter(
      k => !k.startsWith('_') && k !== 'id' && k !== 'company_id'
    );
  }, [data]);

  const effectiveColumns = useMemo<Array<Column<T>>>(() => {
    const baseIds = getColumnIds(columns);
    const tagged: Array<{ id: string; col: Column<T> }> = columns.map((col, idx) => ({
      id: baseIds[idx] ?? String(idx),
      col,
    }));

    for (const custom of tableSettings.customColumns) {
      if (!tagged.some(t => t.id === custom.id)) {
        tagged.push({
          id: custom.id,
          col: {
            header: custom.header,
            accessorKey: custom.fieldKey,
            accessor: row => {
              const raw = (row as Record<string, unknown>)[custom.fieldKey];
              if (raw === null || raw === undefined || raw === '') return '—';
              if (typeof raw === 'object') return JSON.stringify(raw);
              return String(raw);
            },
            align: 'center',
          },
        });
      }
    }

    const ordered =
      tableSettings.columnOrder.length > 0
        ? [...tagged].sort((a, b) => {
            const ia = tableSettings.columnOrder.indexOf(a.id);
            const ib = tableSettings.columnOrder.indexOf(b.id);
            return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
          })
        : tagged;

    const visible = ordered.filter(item => !tableSettings.hiddenColumns.includes(item.id));
    return (visible.length > 0 ? visible : ordered).map(item => item.col);
  }, [columns, tableSettings.customColumns, tableSettings.columnOrder, tableSettings.hiddenColumns]);

  const tableResizeStorageKey =
    resizeStorageKey ?? (title ? `excel-table-cols:${title.trim()}` : undefined);
  const columnIds = useMemo(() => getColumnIds(effectiveColumns), [effectiveColumns]);
  const defaultColWidths = useMemo(
    () => buildDefaultColumnWidths(effectiveColumns),
    [effectiveColumns]
  );
  const migrateLegacyWidths = useCallback(
    (raw: ColumnWidths) => migrateLegacyIndexWidths(raw, columnIds, defaultColWidths),
    [columnIds, defaultColWidths]
  );

  const {
    colWidths,
    isResizing: isColumnResizing,
    onResizeMouseDown,
    resetWidths,
  } = useColumnResize({
    ...(tableResizeStorageKey ? { storageKey: tableResizeStorageKey } : {}),
    defaultWidths: defaultColWidths,
    minWidth: 40,
    isRTL,
    migrateRaw: migrateLegacyWidths,
  });

  const indexedColWidths = useMemo(
    () => toIndexedWidths(colWidths, columnIds),
    [colWidths, columnIds]
  );

  return {
    baseColumnDescriptors,
    availableFields,
    effectiveColumns,
    columnIds,
    indexedColWidths,
    isColumnResizing,
    onResizeMouseDown,
    resetWidths,
  };
}
