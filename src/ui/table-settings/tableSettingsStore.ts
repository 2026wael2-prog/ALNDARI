import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TableDensity = 'compact' | 'normal' | 'comfortable';
export type TableFontWeight = '400' | '600' | '700' | '800';

export interface CustomTableColumn {
  id: string;
  header: string;
  fieldKey: string;
}

export interface TableSettings {
  hiddenColumns: string[];
  columnOrder: string[];
  customColumns: CustomTableColumn[];
  zoom: number;
  fontSize: number;
  density: TableDensity;
  wrapText: boolean;
  fontFamily: string;
  fontWeight: TableFontWeight;
  tabularNums: boolean;
  headerBg: string;
  headerText: string;
  zebraBg: string;
  borderColor: string;
  hoverBg: string;
}

export const DEFAULT_TABLE_SETTINGS: TableSettings = {
  hiddenColumns: [],
  columnOrder: [],
  customColumns: [],
  zoom: 1,
  fontSize: 12,
  density: 'normal',
  wrapText: false,
  fontFamily: 'inherit',
  fontWeight: '600',
  tabularNums: true,
  headerBg: '',
  headerText: '',
  zebraBg: '',
  borderColor: '',
  hoverBg: '',
};

export interface TableColorPreset {
  id: string;
  name: string;
  headerBg: string;
  headerText: string;
  zebraBg: string;
  borderColor: string;
  hoverBg: string;
}

export const TABLE_COLOR_PRESETS: readonly TableColorPreset[] = [
  {
    id: 'theme-default',
    name: 'افتراضي الثيم',
    headerBg: '',
    headerText: '',
    zebraBg: '',
    borderColor: '',
    hoverBg: '',
  },
  {
    id: 'ice-sky',
    name: 'سماوي جليدي',
    headerBg: '#e0f2fe',
    headerText: '#0f172a',
    zebraBg: '#f8fafc',
    borderColor: '#cbd5e1',
    hoverBg: '#f0f9ff',
  },
  {
    id: 'luxury-beige',
    name: 'بيج محاسبي فخم',
    headerBg: '#ebe4d6',
    headerText: '#1c1917',
    zebraBg: '#faf7f2',
    borderColor: '#d6cbb8',
    hoverBg: '#f3ede2',
  },
  {
    id: 'classic-official',
    name: 'رسمي أبيض وأسود',
    headerBg: '#e5e7eb',
    headerText: '#000000',
    zebraBg: '#ffffff',
    borderColor: '#171717',
    hoverBg: '#f3f4f6',
  },
  {
    id: 'solar-warm',
    name: 'أصفر وبرتقالي هادئ',
    headerBg: '#fef9c3',
    headerText: '#0a0a0a',
    zebraBg: '#fffef7',
    borderColor: '#d4c9a8',
    hoverBg: '#fefce8',
  },
  {
    id: 'slate-dark',
    name: 'داكن احترافي',
    headerBg: '#1e293b',
    headerText: '#f8fafc',
    zebraBg: '#0f172a',
    borderColor: '#334155',
    hoverBg: '#1e293b',
  },
];

export const TABLE_FONT_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'خط النظام الافتراضي', value: 'inherit' },
  { label: 'Cairo (عصري واضح)', value: "'Cairo', sans-serif" },
  { label: 'Tajawal (أنيق ومريح)', value: "'Tajawal', sans-serif" },
  { label: 'IBM Plex Arabic (محاسبي)', value: "'IBM Plex Sans Arabic', sans-serif" },
  { label: 'Tahoma (مكتبي كلاسيكي)', value: "Tahoma, 'Segoe UI', Arial, sans-serif" },
  { label: 'Arial (رسمي بسيط)', value: 'Arial, sans-serif' },
];

interface TableSettingsStoreState {
  tables: Record<string, TableSettings>;
  globalStyleDefaults: Partial<TableSettings> | null;
  getSettings: (tableId: string) => TableSettings;
  updateTable: (tableId: string, patch: Partial<TableSettings>) => void;
  toggleColumnVisibility: (tableId: string, columnId: string) => void;
  moveColumn: (tableId: string, orderedIds: string[], fromIdx: number, toIdx: number) => void;
  addCustomColumn: (tableId: string, col: CustomTableColumn) => void;
  removeCustomColumn: (tableId: string, colId: string) => void;
  applyStyleToAllTables: (source: TableSettings) => void;
  resetTable: (tableId: string) => void;
}

const mergeWithDefaults = (
  saved: Partial<TableSettings> | undefined,
  globalStyle: Partial<TableSettings> | null
): TableSettings => ({
  ...DEFAULT_TABLE_SETTINGS,
  ...(globalStyle ?? {}),
  ...(saved ?? {}),
});

export const useTableSettingsStore = create<TableSettingsStoreState>()(
  persist(
    (set, get) => ({
      tables: {},
      globalStyleDefaults: null,

      getSettings: tableId => mergeWithDefaults(get().tables[tableId], get().globalStyleDefaults),

      updateTable: (tableId, patch) =>
        set(state => {
          const current = mergeWithDefaults(state.tables[tableId], state.globalStyleDefaults);
          return {
            tables: {
              ...state.tables,
              [tableId]: { ...current, ...patch },
            },
          };
        }),

      toggleColumnVisibility: (tableId, columnId) =>
        set(state => {
          const current = mergeWithDefaults(state.tables[tableId], state.globalStyleDefaults);
          const exists = current.hiddenColumns.includes(columnId);
          const nextHidden = exists
            ? current.hiddenColumns.filter(id => id !== columnId)
            : [...current.hiddenColumns, columnId];
          return {
            tables: {
              ...state.tables,
              [tableId]: { ...current, hiddenColumns: nextHidden },
            },
          };
        }),

      moveColumn: (tableId, orderedIds, fromIdx, toIdx) =>
        set(state => {
          if (toIdx < 0 || toIdx >= orderedIds.length) return state;
          const next = [...orderedIds];
          const [moved] = next.splice(fromIdx, 1);
          if (moved === undefined) return state;
          next.splice(toIdx, 0, moved);
          const current = mergeWithDefaults(state.tables[tableId], state.globalStyleDefaults);
          return {
            tables: {
              ...state.tables,
              [tableId]: { ...current, columnOrder: next },
            },
          };
        }),

      addCustomColumn: (tableId, col) =>
        set(state => {
          const current = mergeWithDefaults(state.tables[tableId], state.globalStyleDefaults);
          if (current.customColumns.some(c => c.id === col.id || c.fieldKey === col.fieldKey)) {
            return state;
          }
          return {
            tables: {
              ...state.tables,
              [tableId]: {
                ...current,
                customColumns: [...current.customColumns, col],
              },
            },
          };
        }),

      removeCustomColumn: (tableId, colId) =>
        set(state => {
          const current = mergeWithDefaults(state.tables[tableId], state.globalStyleDefaults);
          return {
            tables: {
              ...state.tables,
              [tableId]: {
                ...current,
                customColumns: current.customColumns.filter(c => c.id !== colId),
                hiddenColumns: current.hiddenColumns.filter(id => id !== colId),
                columnOrder: current.columnOrder.filter(id => id !== colId),
              },
            },
          };
        }),

      applyStyleToAllTables: source =>
        set(state => {
          const stylePatch: Partial<TableSettings> = {
            zoom: source.zoom,
            fontSize: source.fontSize,
            density: source.density,
            wrapText: source.wrapText,
            fontFamily: source.fontFamily,
            fontWeight: source.fontWeight,
            tabularNums: source.tabularNums,
            headerBg: source.headerBg,
            headerText: source.headerText,
            zebraBg: source.zebraBg,
            borderColor: source.borderColor,
            hoverBg: source.hoverBg,
          };
          const nextTables: Record<string, TableSettings> = {};
          for (const [id, tbl] of Object.entries(state.tables)) {
            nextTables[id] = { ...tbl, ...stylePatch };
          }
          return {
            globalStyleDefaults: stylePatch,
            tables: nextTables,
          };
        }),

      resetTable: tableId =>
        set(state => {
          const nextTables = { ...state.tables };
          delete nextTables[tableId];
          return { tables: nextTables };
        }),
    }),
    {
      name: 'alnadary-table-settings-v1',
    }
  )
);
