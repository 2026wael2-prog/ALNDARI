import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '../../core/utils';
import { useTableKeyboardNavigation } from './useTableKeyboardNavigation';
import { useTableDragDrop } from './hooks/useTableDragDrop';
import { useTableSelection } from './hooks/useTableSelection';
import { useColumnResize } from './hooks/useColumnResize';
import { useExcelTableData, type TableSortConfig } from './hooks/useExcelTableData';
import { useTableDrag } from './hooks/useTableDrag';
import { useTableWrapperResize } from './hooks/useTableWrapperResize';
import {
  buildDefaultColumnWidths,
  getColumnIds,
  migrateLegacyIndexWidths,
  toIndexedWidths,
  type ColumnWidths,
} from './excelTableColumnWidths';
import { ExcelTableHeader } from './ExcelTableHeader';
import { ExcelTableBody } from './ExcelTableBody';
import { ExcelTablePagination } from './ExcelTablePagination';
import { ExcelTableResizeHandles } from './ExcelTableResizeHandles';
import FullscreenContainer from '../base/FullscreenContainer';
import ExcelTableToolbar from './ExcelTableToolbar';
import { EXCEL_TABLE_THEMES, type ExcelTableColorTheme } from './excelTableThemes';
import { exportGenericTableToExcel } from '../../core/utils/genericExcelExporter';

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
  /** External search value for a "main" search box (bypasses internal client-side filtering). */
  searchValue?: string;
  /** Callback when the toolbar search input changes. If provided, internal search is disabled. */
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
  /** مفتاح تخصيص حفظ عروض الأعمدة في localStorage (افتراضياً يُشتق من title) */
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
  const [isZoomed, setIsZoomed] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(pageSize);

  useEffect(() => {
    setItemsPerPage(pageSize);
  }, [pageSize]);

  // ── الفلترة + الفرز (معزولة في هوك مع اختبارات مستقلة) ────────────
  const { effectiveSearch, handleSearchInput, searchTerm, processedData } = useExcelTableData({
    data,
    columns,
    searchValue,
    onSearchChange,
    sortConfig,
  });

  // ── سحب الجدول وتغيير حجمه (مستمعات `document` منظَّفة دائماً) ────
  const { isDragging, position, handleTableDragStart, resetPosition } = useTableDrag({
    enableDrag,
    isZoomed,
  });
  const {
    customSize,
    handleWrapperResizeStart,
    resetSize: resetWrapperSize,
  } = useTableWrapperResize({ tableWrapperRef });

  const currentTheme = EXCEL_TABLE_THEMES[colorTheme];
  const [zoomLevel, setZoomLevel] = useState(1);

  // ── Column Resize (موحّدة + محفوظة + ناعمة) ──────────────────────
  const tableResizeStorageKey =
    resizeStorageKey ?? (title ? `excel-table-cols:${title.trim()}` : undefined);
  // هوية كل عمود (لا ترتيبه) — فيبقى عرض المستخدم على العمود نفسه عند إخفاء/إظهار أعمدة
  const columnIds = useMemo(() => getColumnIds(columns), [columns]);
  const defaultColWidths = useMemo(() => buildDefaultColumnWidths(columns), [columns]);
  // ترحيل العروض المحفوظة قديماً بترتيب الأعمدة إلى هوية العمود
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
  // العروض بصيغة الترتيب التي تستهلكها الترويسة و colgroup
  const indexedColWidths = useMemo(
    () => toIndexedWidths(colWidths, columnIds),
    [colWidths, columnIds]
  );


  // Reset page when search/data changes or when currentPage exceeds totalPages
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

  // Custom Hooks
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
    copyCells: _copyCells,
    copySelection: _copySelection,
    pasteCells: _pasteCells,
    handleCellClick,
    startSelection,
    updateSelection: _updateSelection,
    endSelection,
    pageSizeRef,
    moveFocus: _moveFocus,
  } = useTableKeyboardNavigation({
    tableRef: tableRef as React.RefObject<HTMLDivElement>,
    orderedData,
    columns,
    isRTL,
    onRowDoubleClick,
    onCellUpdate,
  });

  // Update page size ref
  useEffect(() => {
    pageSizeRef.current = itemsPerPage;
  }, [itemsPerPage, pageSizeRef]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig?.key === key && sortConfig?.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleResetSize = useCallback((): void => {
    resetWrapperSize();
    resetPosition();
    setIsZoomed(false);
    resetWidths();
  }, [resetWrapperSize, resetPosition, resetWidths]);

  const handleEditInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await saveEdit();
      if (editingCell) {
        const nextRow = Math.min(orderedData.length - 1, editingCell.row + 1);
        setFocusedCell({ row: nextRow, col: editingCell.col });
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
          : Math.min(columns.length - 1, editingCell.col + 1);
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

  // Handle mouse selection
  const handleMouseDownCell = (e: React.MouseEvent, rowIdx: number, colIdx: number) => {
    if (e.shiftKey) {
      handleCellClick(rowIdx, colIdx, true);
    } else {
      startSelection(rowIdx, colIdx);
    }
  };

  const handleExport = useCallback(() => {
    if (onExport) {
      onExport();
      return;
    }
    if (processedData.length === 0) return;
    const exportHeaders = columns
      .map(c => c.header)
      .filter(h => typeof h === 'string' && h.trim() !== '');

    const exportRows = processedData.map(row => {
      return columns
        .filter(c => typeof c.header === 'string' && c.header.trim() !== '')
        .map(col => {
          if (col.accessorKey) {
            const raw = (row as Record<string, unknown>)[String(col.accessorKey)];
            if (raw === null || raw === undefined) return '';
            if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
              return raw;
            }
            return String(raw);
          }
          const val = col.accessor(row);
          if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
            return val;
          }
          return '';
        });
    });

    const safeTitle = title?.trim() ? title : 'بيانات_الجدول';
    void exportGenericTableToExcel({
      title: safeTitle,
      subtitle: subtitle?.trim() ? subtitle : undefined,
      headers: exportHeaders,
      rows: exportRows,
      colorTheme,
    });
  }, [onExport, processedData, columns, title, subtitle, colorTheme]);

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
          isZoomed ? 'h-full bg-[var(--app-surface)] p-4' : 'h-full min-h-[420px]'
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
        />

        {/* Table Wrapper with Resize Handles */}
        <div
          ref={tableWrapperRef}
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm"
          style={{
            ...(customSize.width ? { width: customSize.width } : {}),
            ...(customSize.height ? { maxHeight: customSize.height } : {}),
            ...(position.x !== 0 || position.y !== 0
              ? { transform: `translate(${position.x}px, ${position.y}px)` }
              : {}),
            ...(isDragging ? { cursor: 'grabbing', opacity: 0.9 } : {}),
          }}
          onMouseDown={handleTableDragStart}
        >
          {enableResize && !isZoomed && (
            <ExcelTableResizeHandles onResizeStart={handleWrapperResizeStart} />
          )}
          {/* Drag Handle in Title */}
          {enableDrag && !isZoomed && (
            <div className="absolute left-2 top-2 z-20 cursor-grab text-[var(--app-text-secondary)] hover:text-blue-500 active:cursor-grabbing">
              <GripVertical size={14} />
            </div>
          )}
          <div
            ref={tableRef}
            tabIndex={0}
            className="custom-scrollbar scroll-x-hint-surface min-h-0 flex-1 overflow-auto overscroll-contain outline-none"
            onMouseUp={endSelection}
            onMouseLeave={endSelection}
          >
            <table
              role="table"
              aria-label={title || 'جدول البيانات'}
              style={{ fontSize: `${zoomLevel * 11}px` }}
              className={cn(
                'w-full min-w-[640px] table-fixed border-collapse border-l border-t border-[var(--app-border)] md:min-w-[800px]',
                isRTL ? 'text-right' : 'text-left'
              )}
            >
              <colgroup>
                {enableSelection && <col style={{ width: 40 }} />}
                <col style={{ width: 40 }} />
                {columns.map((col, idx) => {
                  const savedWidth = indexedColWidths[String(idx)];
                  const colStyle = savedWidth
                    ? { width: `${savedWidth}px` }
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
                columns={columns}
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
                columns={columns}
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
              {columns.some(c => c.footer) && (
                <tfoot className="border-t-2 border-[var(--app-border)] bg-[var(--app-bg)]">
                  <tr>
                    {enableSelection && (
                      <td className="border-r border-[var(--app-border)] p-2"></td>
                    )}
                    <td className="border-r border-[var(--app-border)] p-2 text-center text-[10px] font-bold text-[var(--app-text-secondary)]">
                      الإجمالي
                    </td>
                    {columns.map((col, idx) => (
                      <td
                        key={idx}
                        className={cn(
                          'border-r border-[var(--app-border)] p-2 text-[11px] font-bold',
                          col.align === 'center' && 'text-center',
                          col.align === 'left' && 'text-left',
                          col.align === 'right' && 'text-right',
                          col.className
                        )}
                      >
                        {col.footer
                          ? (col.footer as (pageData: T[], fullData: T[]) => React.ReactNode)(
                              orderedData,
                              processedData
                            )
                          : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Pagination Footer */}
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

export default ExcelTable;
