import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Home, Search } from 'lucide-react';
import { useCommandPaletteStore, type CommandAction } from './store';

describe('useCommandPaletteStore', () => {
  beforeEach(() => {
    useCommandPaletteStore.setState({ isOpen: false, actions: [] });
  });

  it('opens and closes the command palette', () => {
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);

    useCommandPaletteStore.getState().openPalette();
    expect(useCommandPaletteStore.getState().isOpen).toBe(true);

    useCommandPaletteStore.getState().closePalette();
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });

  it('registers actions without duplicating existing IDs', () => {
    const firstAction: CommandAction = {
      id: 'nav-home',
      title: 'الرئيسية',
      section: 'Navigation',
      icon: Home,
      onSelect: vi.fn(),
    };
    const duplicateAction: CommandAction = {
      id: 'nav-home',
      title: 'نسخة مكررة',
      section: 'Navigation',
      icon: Home,
      onSelect: vi.fn(),
    };
    const secondAction: CommandAction = {
      id: 'act-search',
      title: 'بحث سريع',
      section: 'Actions',
      icon: Search,
      onSelect: vi.fn(),
      keywords: 'search',
    };

    useCommandPaletteStore.getState().registerActions([firstAction]);
    useCommandPaletteStore.getState().registerActions([duplicateAction, secondAction]);

    const actions = useCommandPaletteStore.getState().actions;
    expect(actions).toHaveLength(2);
    expect(actions[0]?.title).toBe('الرئيسية');
    expect(actions[1]?.id).toBe('act-search');
  });
});
