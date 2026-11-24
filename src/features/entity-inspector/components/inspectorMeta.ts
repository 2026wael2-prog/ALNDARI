import {
  FileText,
  Landmark,
  Package,
  Receipt,
  Users,
} from 'lucide-react';
import type {
  InspectableEntityType,
  InspectedEntityData,
  InspectorHistoryRow,
  InspectorTabSheet,
  InspectorTone,
} from '../types';

export const ENTITY_ICON_MAP: Record<InspectableEntityType, typeof Package> = {
  product: Package,
  party: Users,
  invoice: FileText,
  bond: Receipt,
  account: Landmark,
};

export const ENTITY_TYPE_LABEL: Record<InspectableEntityType, string> = {
  product: 'منتج / صنف',
  party: 'عميل / مورد',
  invoice: 'فاتورة',
  bond: 'سند مالي',
  account: 'حساب محاسبي',
};

export const TONE_TEXT: Record<InspectorTone, string> = {
  default: 'text-[var(--app-text)]',
  emerald: 'text-emerald-700 dark:text-emerald-400',
  rose: 'text-rose-700 dark:text-rose-400',
  amber: 'text-amber-700 dark:text-amber-400',
  blue: 'text-blue-700 dark:text-blue-400',
  indigo: 'text-indigo-700 dark:text-indigo-400',
};

export const TONE_BADGE: Record<InspectorTone, string> = {
  default: 'border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text)]',
  emerald: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  rose: 'border-rose-500/35 bg-rose-500/15 text-rose-800 dark:text-rose-300',
  amber: 'border-amber-500/35 bg-amber-500/15 text-amber-800 dark:text-amber-300',
  blue: 'border-blue-500/35 bg-blue-500/15 text-blue-800 dark:text-blue-300',
  indigo: 'border-indigo-500/35 bg-indigo-500/15 text-indigo-800 dark:text-indigo-300',
};

const escapeCsvCell = (val: string): string => {
  const s = String(val ?? '').replace(/\r?\n/g, ' ');
  return `"${s.replace(/"/g, '""')}"`;
};

export function exportInspectorCsv(
  data: InspectedEntityData,
  entityType: InspectableEntityType,
  activeSheet: InspectorTabSheet | null,
  filteredSheetRows: InspectorHistoryRow[]
): void {
  const lines: string[] = [];
  if (activeSheet) {
    lines.push(['#', ...activeSheet.columns.map(c => c.label)].map(escapeCsvCell).join(','));
    filteredSheetRows.forEach((row, idx) => {
      lines.push(
        [String(idx + 1), ...activeSheet.columns.map(c => row.cells[c.key] ?? '')]
          .map(escapeCsvCell)
          .join(',')
      );
    });
  } else {
    lines.push(['القسم', 'البيان', 'القيمة'].map(escapeCsvCell).join(','));
    data.fields.forEach(f => {
      lines.push([f.section, f.label, f.value].map(escapeCsvCell).join(','));
    });
  }

  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeName = (data.title || entityType).replace(/[\\/:*?"<>|]+/g, '_');
  link.download = `${safeName}_${activeSheet ? activeSheet.label : 'البطاقة'}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
