import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '../../core/utils';
import { useTableKeyboardNavigation } from './useTableKeyboardNavigation';
import { useTableDragDrop } from './hooks/useTableDragDrop';
import { useTableSelection } from './hooks/useTableSelection';
import { useExcelTableData, type TableSortConfig } from './hooks/useExcelTableData';
import { useTableDrag } from './hooks/useTableDrag';
import { useTableWrapperResize } from './hooks/useTableWrapperResize';
import { useExcelTableColumns } from './hooks/useExcelTableColumns';
import { useExcelTablePanZoom } from './hooks/useExcelTablePanZoom';
import { ExcelTableHeader } from './ExcelTableHeader';
import { ExcelTableBody } from './ExcelTableBody';
import { ExcelTableFooter } from './ExcelTableFooter';
import { ExcelTablePagination } from './ExcelTablePagination';
import { ExcelTableResizeHandles } from './ExcelTableResizeHandles';
import { exportExcelTableData } from './excelTableExport';
import FullscreenContainer from '../base/FullscreenContainer';
import ExcelTableToolbar from './ExcelTableToolbar';
import { EXCEL_TABLE_THEMES, type ExcelTableColorTheme } from './excelTableThemes';
import {
  TableSettingsButton,
  useTableCustomization,
} from '../table-settings/TableSettingsButton';

export interface Column<T> {
  header: string;
  accessor: (row: T) => React.ReactNode;
  accessorKey?: keyof T | string;
  sortKey?: keyof T | string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
  isEditable?: boolean;
  footer?: (data: T[]) => React.ReactNode;
}

interface ExcelTableProps<T> {
  columns: Array<Column<T>>;
  data: T[];
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  colorTheme?: ExcelTableColorTheme;
  onExport?: (() => void) | undefined;
  showSearch?: boolean;
  searchValue?: string;
  onSearchChange?: ((value: string) => void) | undefined;
  onRowClick?: ((row: T) => void) | undefined;
  onRowDoubleClick?: ((row: T) => void) | undefined;
  onOrderChange?: ((reorderedData: T[]) => void) | undefined;
  onCellUpdate?:
    | ((rowIndex: number, accessorKey: string, value: unknown, item?: T) => void | Promise<void>)
    | undefined;
  enablePagination?: boolean;
  pageSize?: number;
  enableSelection?: boolean;
  selectedRowIds?: Set<string>;
  onSelectionChange?: ((selectedIds: Set<string>) => void) | undefined;
  getRowId?: ((row: T) => string) | undefined;
  isRTL?: boolean;
  enableResize?: boolean;
  enableDrag?: boolean;
  resizeStorageKey?: string;
  isLoading?: boolean;
}

function ExcelTable<T>({
  columns,
  data,
  title,
  subtitle,
  emptyMessage,
  colorTheme = 'blue',
  onExport,
  showSearch = true,
  searchValue,
  onSearchChange,
  onRowClick,
  onRowDoubleClick,
  onOrderChange,
  onCellUpdate,
  enablePagination = true,
  pageSize = 20,
  enableSelection = false,
  selectedRowIds = new Set(),
  onSelectionChange,
  getRowId,
  isRTL = false,
  enableResize = true,
  enableDrag = false,
  resizeStorageKey,
  isLoading = false,
}: ExcelTableProps<T>) {
  const [sortConfig, setSortConfig] = useState<TableSortConfig | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(pageSize);
  const tableRef = useRef<HTMLDivElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItemsPerPage(pageSize);
  }, [pageSize]);

  const { effectiveSearch, handleSearchInput, searchTerm, processedData } = useExcelTableData({
    data,
    columns,
    searchValue,
    onSearchChange,
    sortConfig,
  });

  const currentTheme = EXCEL_TABLE_THEMES[colorTheme];
  const tableSettingsId = useMemo(
    () =>
      resizeStorageKey ??
      (title
        ? `excel:${title.trim()}`
        : `excel:${columns
            .slice(0, 3)
            .map(c => c.header)
            .join('|')}`),
    [resizeStorageKey, title, columns]
  );

  const {
    settings: tableSettings,
    customized: isTableCustomized,
    containerProps: tableCustomProps,
  } = useTableCustomization(tableSettingsId);

  const {
    baseColumnDescriptors,
    availableFields,
    effectiveColumns,
    columnIds,
    indexedColWidths,
    isColumnResizing,
    onResizeMouseDown,
    resetWidths,
  } = useExcelTableColumns({
    columns,
    data,
    tableSettings,
    resizeStorageKey,
    title,
    isRTL,
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, data]);

  const paginatedData = useMemo(() => {
    if (!enablePagination) return processedData;
    const startIndex = (currentPage - 1) * itemsPerPage;
    return processedData.slice(startIndex, startIndex + itemsPerPage);
  }, [processedData, currentPage, itemsPerPage, enablePagination]);

  const totalPages = Math.ceil(processedData.length / itemsPerPage);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const {
    orderedData,
    handlers: { handleDragStart, handleDragEnter, handleDragOver, handleDragEnd, handleDrop },
  } = useTableDragDrop(paginatedData, onOrderChange, tableRef);

  const { toggleAllSelection, toggleRowSelection, isAllVisibleSelected, hasSomeVisibleSelected } =
    useTableSelection(orderedData, selectedRowIds, onSelectionChange, getRowId);

  const {
    focusedCell,
    setFocusedCell,
    editingCell,
    setEditingCell,
    editValue,
    setEditValue,
    startEditing,
    saveEdit,
    selection,
    handleCellClick,
    startSelection,
    endSelection,
    pageSizeRef,
  } = useTableKeyboardNavigation({
    tableRef: tableRef as React.RefObject<HTMLDivElement>,
    orderedData,
    columns: effectiveColumns,
    isRTL,
    onRowDoubleClick,
    onCellUpdate,
  });

  useEffect(() => {
    pageSizeRef.current = itemsPerPage;
  }, [itemsPerPage, pageSizeRef]);

  const {
    isZoomed,
    setIsZoomed,
    zoomLevel,
    setZoomLevel,
    isPanMode,
    setIsPanMode,
    isPanning,
    handleWheel,
    handleContainerMouseDown,
    handleContainerMouseMove,
    stopPanAndSelection,
  } = useExcelTablePanZoom({
    initialZoom: tableSettings.zoom || 1,
    tableRef,
    endSelection,
  });

  const { isDragging, position, handleTableDragStart, resetPosition } = useTableDrag({
    enableDrag,
    isZoomed,
  });
  const {
    customSize,
    handleWrapperResizeStart,
    resetSize: resetWrapperSize,
  } = useTableWrapperResize({ tableWrapperRef });

  const handleSort = (key: string) => {
    const direction: 'asc' | 'desc' =
      sortConfig?.key === key && sortConfig?.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  const handleResetSize = useCallback((): void => {
    resetWrapperSize();
    resetPosition();
    setIsZoomed(false);
    resetWidths();
  }, [resetWrapperSize, resetPosition, setIsZoomed, resetWidths]);

  const handleEditInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await saveEdit();
      if (editingCell) {
        setFocusedCell({ row: Math.min(orderedData.length - 1, editingCell.row + 1), col: editingCell.col });
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingCell(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      await saveEdit();
      if (editingCell) {
        const nextCol = e.shiftKey
          ? Math.max(0, editingCell.col - 1)
          : Math.min(effectiveColumns.length - 1, editingCell.col + 1);
        const nextRow =
          nextCol !== editingCell.col
            ? editingCell.row
            : e.shiftKey
              ? Math.max(0, editingCell.row - 1)
              : Math.min(orderedData.length - 1, editingCell.row + 1);
        setFocusedCell({ row: nextRow, col: nextCol });
      }
    }
  };

  const handleMouseDownCell = (e: React.MouseEvent, rowIdx: number, colIdx: number) => {
    if (e.shiftKey) handleCellClick(rowIdx, colIdx, true);
    else startSelection(rowIdx, colIdx);
  };

  const handleExport = useCallback(() => {
    if (onExport) {
      onExport();
      return;
    }
    exportExcelTableData({ processedData, effectiveColumns, title, subtitle, colorTheme });
  }, [onExport, processedData, effectiveColumns, title, subtitle, colorTheme]);

  return (
    <FullscreenContainer
      isMaximized={isZoomed}
      onToggleMaximize={() => {
        setIsZoomed(false);
      }}
    >
      <div
        className={cn(
          'relative flex min-h-0 w-full flex-1 flex-col transition-all duration-300',
          isZoomed ? 'h-full bg-[var(--app-surface)] p-2 md:p-4' : 'h-full min-h-[260px] md:min-h-[420px]'
        )}
      >
        <ExcelTableToolbar
          title={title}
          currentTheme={currentTheme}
          showSearch={showSearch}
          internalSearch={effectiveSearch}
          setInternalSearch={handleSearchInput}
          isRTL={isRTL}
          onExport={onExport ?? handleExport}
          enableResize={enableResize}
          handleResetSize={handleResetSize}
          isZoomed={isZoomed}
          setIsZoomed={setIsZoomed}
          zoomLevel={zoomLevel}
          setZoomLevel={setZoomLevel}
          isPanMode={isPanMode}
          onTogglePanMode={() => setIsPanMode(p => !p)}
          settingsButton={
            <TableSettingsButton
              tableId={tableSettingsId}
              tableTitle={title}
              columns={baseColumnDescriptors}
              availableFields={availableFields}
              onZoomSync={setZoomLevel}
              onResetWidths={handleResetSize}
            />
          }
        />

        <div
          ref={tableWrapperRef}
          data-table-customized={isTableCustomized ? 'true' : undefined}
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm"
          style={{
            ...(tableCustomProps.style ?? {}),
            ...(customSize.width !== undefined && customSize.width !== '' ? { width: customSize.width } : {}),
            ...(customSize.height !== undefined && customSize.height !== '' ? { maxHeight: customSize.height } : {}),
            ...(position.x !== 0 || position.y !== 0
              ? { transform: `translate(${String(position.x)}px, ${String(position.y)}px)` }
              : {}),
            ...(isDragging ? { cursor: 'grabbing', opacity: 0.9 } : {}),
          }}
          onMouseDown={handleTableDragStart}
        >
          {enableResize && !isZoomed && (
            <ExcelTableResizeHandles onResizeStart={handleWrapperResizeStart} />
          )}
          {enableDrag && !isZoomed && (
            <div className="absolute left-2 top-2 z-20 cursor-grab text-[var(--app-text-secondary)] hover:text-blue-500 active:cursor-grabbing">
              <GripVertical size={14} />
            </div>
          )}

          <div
            ref={tableRef}
            tabIndex={0}
            className={cn(
              'custom-scrollbar scroll-x-hint-surface min-h-0 flex-1 overflow-auto overscroll-contain outline-none',
              isPanMode && (isPanning ? 'cursor-grabbing select-none' : 'cursor-grab select-none')
            )}
            onWheel={handleWheel}
            onMouseDown={handleContainerMouseDown}
            onMouseMove={handleContainerMouseMove}
            onMouseUp={stopPanAndSelection}
            onMouseLeave={stopPanAndSelection}
          >
            <table
              role="table"
              aria-label={title !== undefined && title !== '' ? title : 'جدول البيانات'}
              style={{
                fontSize: `${String(Math.round(zoomLevel * (tableSettings.fontSize || 11)))}px`,
              }}
              className={cn(
                'w-full min-w-[640px] table-fixed border-collapse border-l border-t border-[var(--app-border)] md:min-w-[800px]',
                isRTL ? 'text-right' : 'text-left'
              )}
            >
              <colgroup>
                {enableSelection && <col style={{ width: Math.round(40 * zoomLevel) }} />}
                <col style={{ width: Math.round(40 * zoomLevel) }} />
                {effectiveColumns.map((col, idx) => {
                  const savedWidth = indexedColWidths[String(idx)];
                  const colStyle = savedWidth
                    ? { width: `${String(Math.round(savedWidth * zoomLevel))}px` }
                    : col.width
                      ? { width: col.width }
                      : {};
                  return (
                    <col
                      key={idx}
                      style={colStyle}
                      className={isColumnResizing ? 'will-change-[width]' : undefined}
                    />
                  );
                })}
              </colgroup>
              <ExcelTableHeader
                columns={effectiveColumns}
                enableSelection={enableSelection}
                orderedDataLength={orderedData.length}
                selectedRowIdsSize={selectedRowIds.size}
                isAllSelected={isAllVisibleSelected}
                isPartiallySelected={hasSomeVisibleSelected}
                toggleAllSelection={toggleAllSelection}
                columnWidths={indexedColWidths}
                handleSort={handleSort}
                sortConfig={sortConfig}
                isRTL={isRTL}
                handleMouseDown={(e, idx) => {
                  onResizeMouseDown(e, columnIds[idx] ?? String(idx));
                }}
                isLoading={isLoading}
              />
              <ExcelTableBody
                isLoading={isLoading}
                orderedData={orderedData}
                columns={effectiveColumns}
                enableSelection={enableSelection}
                emptyMessage={emptyMessage}
                selectedRowIds={selectedRowIds}
                selection={selection}
                getRowId={getRowId}
                handleDragStart={handleDragStart}
                handleDragEnter={handleDragEnter}
                handleDragOver={handleDragOver}
                handleDragEnd={handleDragEnd}
                handleDrop={handleDrop}
                onRowClick={onRowClick}
                onOrderChange={onOrderChange}
                currentTheme={currentTheme}
                toggleRowSelection={toggleRowSelection}
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                focusedCell={focusedCell}
                editingCell={editingCell}
                handleCellClick={handleCellClick}
                handleMouseDownCell={handleMouseDownCell}
                onRowDoubleClick={onRowDoubleClick}
                startEditing={startEditing}
                editValue={editValue}
                setEditValue={setEditValue}
                saveEdit={saveEdit}
                handleEditInputKeyDown={handleEditInputKeyDown}
                isRTL={isRTL}
                scrollRef={tableRef as React.RefObject<HTMLDivElement>}
              />
              <ExcelTableFooter
                columns={effectiveColumns}
                enableSelection={enableSelection}
                orderedData={orderedData}
                processedData={processedData}
              />
            </table>
          </div>

          <ExcelTablePagination
            enablePagination={enablePagination}
            totalPages={totalPages}
            processedDataLength={processedData.length}
            itemsPerPage={itemsPerPage}
            setItemsPerPage={setItemsPerPage}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            isRTL={isRTL}
            currentTheme={currentTheme}
          />
        </div>
      </div>
    </FullscreenContainer>
  );
}

const MemoizedExcelTable = React.memo(ExcelTable) as typeof ExcelTable;
export default MemoizedExcelTable;
