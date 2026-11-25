import React from 'react';
import type { Column } from './ExcelTable';
import { exportGenericTableToExcel } from '../../core/utils/genericExcelExporter';
import type { ExcelTableColorTheme } from './excelTableThemes';

export const extractTextFromReactNode = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    return node.map(extractTextFromReactNode).filter(Boolean).join(' ').trim();
  }
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode } | null;
    return extractTextFromReactNode(props?.children);
  }
  return '';
};

export function exportExcelTableData<T>(params: {
  processedData: T[];
  effectiveColumns: Array<Column<T>>;
  title?: string | undefined;
  subtitle?: string | undefined;
  colorTheme: ExcelTableColorTheme;
}): void {
  const { processedData, effectiveColumns, title, subtitle, colorTheme } = params;
  if (processedData.length === 0) return;

  const validColumns = effectiveColumns.filter(
    c => typeof c.header === 'string' && c.header.trim() !== ''
  );
  const exportHeaders = validColumns.map(c => c.header);

  const exportRows = processedData.map(row =>
    validColumns.map(col => {
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
      return extractTextFromReactNode(val);
    })
  );

  const safeTitle = title?.trim() ? title : 'بيانات_الجدول';
  void exportGenericTableToExcel({
    title: safeTitle,
    subtitle: subtitle?.trim() ? subtitle : undefined,
    headers: exportHeaders,
    rows: exportRows,
    colorTheme,
  });
}
