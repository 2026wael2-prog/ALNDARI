import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TABLE_SETTINGS, useTableSettingsStore } from './tableSettingsStore';

describe('useTableSettingsStore', () => {
  beforeEach(() => {
    useTableSettingsStore.setState({ tables: {}, globalStyleDefaults: null });
  });

  it('returns defaults for an unconfigured table', () => {
    const s = useTableSettingsStore.getState().getSettings('sales.invoices');
    expect(s).toEqual(DEFAULT_TABLE_SETTINGS);
  });

  it('toggles column visibility, reorders columns, and adds/removes custom columns', () => {
    const store = useTableSettingsStore.getState();
    store.toggleColumnVisibility('inv.list', 'sku');
    expect(useTableSettingsStore.getState().getSettings('inv.list').hiddenColumns).toEqual(['sku']);

    store.toggleColumnVisibility('inv.list', 'sku');
    expect(useTableSettingsStore.getState().getSettings('inv.list').hiddenColumns).toEqual([]);

    store.moveColumn('inv.list', ['a', 'b', 'c'], 0, 2);
    expect(useTableSettingsStore.getState().getSettings('inv.list').columnOrder).toEqual([
      'b',
      'c',
      'a',
    ]);

    store.addCustomColumn('inv.list', { id: 'custom:notes', header: 'ملاحظات', fieldKey: 'notes' });
    expect(useTableSettingsStore.getState().getSettings('inv.list').customColumns).toHaveLength(1);

    store.removeCustomColumn('inv.list', 'custom:notes');
    expect(useTableSettingsStore.getState().getSettings('inv.list').customColumns).toHaveLength(0);
  });

  it('applies style settings to all tables and resets cleanly', () => {
    const store = useTableSettingsStore.getState();
    store.updateTable('t1', {
      zoom: 1.2,
      fontSize: 14,
      headerBg: '#e0f2fe',
      fontFamily: "'Tajawal', sans-serif",
    });
    store.applyStyleToAllTables(useTableSettingsStore.getState().getSettings('t1'));

    const t2 = useTableSettingsStore.getState().getSettings('t2');
    expect(t2.zoom).toBe(1.2);
    expect(t2.fontSize).toBe(14);
    expect(t2.headerBg).toBe('#e0f2fe');
    expect(t2.fontFamily).toBe("'Tajawal', sans-serif");

    store.resetTable('t1');
    expect(useTableSettingsStore.getState().tables['t1']).toBeUndefined();
  });
});
