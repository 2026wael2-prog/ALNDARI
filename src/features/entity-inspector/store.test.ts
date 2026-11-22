import { describe, it, expect, beforeEach } from 'vitest';
import { useEntityInspectorStore } from './store';

describe('useEntityInspectorStore', () => {
  beforeEach(() => {
    useEntityInspectorStore.getState().close();
  });

  it('opens a target cleanly and resets previous stack', () => {
    const store = useEntityInspectorStore.getState();
    store.open({ type: 'product', id: 'prod-1', label: 'فلتر زيت' });
    expect(useEntityInspectorStore.getState().stack).toEqual([
      { type: 'product', id: 'prod-1', label: 'فلتر زيت' },
    ]);

    store.open({ type: 'party', id: 'party-1', label: 'شركة النور' });
    expect(useEntityInspectorStore.getState().stack).toEqual([
      { type: 'party', id: 'party-1', label: 'شركة النور' },
    ]);
  });

  it('supports drill-down navigation, deduplicates top target, and navigates back', () => {
    const store = useEntityInspectorStore.getState();
    store.open({ type: 'party', id: 'party-1', label: 'عميل 1' });
    store.drillDown({ type: 'invoice', id: 'inv-1', label: '#1001' });
    store.drillDown({ type: 'invoice', id: 'inv-1', label: '#1001' }); // duplicate top ignored
    store.drillDown({ type: 'product', id: 'prod-1', label: 'قطعة غيار' });

    expect(useEntityInspectorStore.getState().stack).toHaveLength(3);

    store.back();
    expect(useEntityInspectorStore.getState().stack).toHaveLength(2);
    expect(useEntityInspectorStore.getState().stack[1]?.id).toBe('inv-1');

    store.goToIndex(0);
    expect(useEntityInspectorStore.getState().stack).toHaveLength(1);
    expect(useEntityInspectorStore.getState().stack[0]?.id).toBe('party-1');

    store.close();
    expect(useEntityInspectorStore.getState().stack).toHaveLength(0);
  });

  it('ignores targets with empty id', () => {
    useEntityInspectorStore.getState().open({ type: 'product', id: '' });
    expect(useEntityInspectorStore.getState().stack).toHaveLength(0);
  });
});
