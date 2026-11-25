import { describe, it, expect } from 'vitest';
import { SYSTEM_SHORTCUTS, matchesKeyboardShortcut } from './shortcutsRegistry';

describe('matchesKeyboardShortcut', () => {
  const getShortcut = (id: string) => {
    const s = SYSTEM_SHORTCUTS.find(item => item.id === id);
    if (!s) throw new Error(`Shortcut not found: ${id}`);
    return s;
  };

  it('matches new_sales_invoice with Arabic ف and English F', () => {
    const shortcut = getShortcut('new_sales_invoice');

    // Ctrl + ف
    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'ف', ctrlKey: true }),
        shortcut
      )
    ).toBe(true);

    // Ctrl + f
    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, code: 'KeyF' }),
        shortcut
      )
    ).toBe(true);

    // Physical key T with Ctrl (Arabic keyboard layout for ف)
    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 't', ctrlKey: true, code: 'KeyT' }),
        shortcut
      )
    ).toBe(true);

    // Without Ctrl should be false
    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'ف', ctrlKey: false }),
        shortcut
      )
    ).toBe(false);
  });

  it('matches customer_statement with Arabic ك and English K', () => {
    const shortcut = getShortcut('customer_statement');

    // Ctrl + ك
    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'ك', ctrlKey: true }),
        shortcut
      )
    ).toBe(true);

    // Ctrl + k
    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, code: 'KeyK' }),
        shortcut
      )
    ).toBe(true);

    // Semicolon with Ctrl (Arabic keyboard layout for ك)
    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: ';', ctrlKey: true, code: 'Semicolon' }),
        shortcut
      )
    ).toBe(true);
  });

  it('matches new_product with Arabic م and English M', () => {
    const shortcut = getShortcut('new_product');

    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'م', ctrlKey: true }),
        shortcut
      )
    ).toBe(true);

    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, code: 'KeyM' }),
        shortcut
      )
    ).toBe(true);
  });

  it('matches product_explorer with Arabic ب and English B, and prevents collision with KeyF', () => {
    const productExplorer = getShortcut('product_explorer');
    const salesInvoice = getShortcut('new_sales_invoice');

    // On Arabic layout, pressing 'ب' has key='ب' and code='KeyF'
    const arabicBEvent = new KeyboardEvent('keydown', {
      key: 'ب',
      ctrlKey: true,
      code: 'KeyF',
    });

    // Must match product_explorer
    expect(matchesKeyboardShortcut(arabicBEvent, productExplorer)).toBe(true);

    // CRITICAL REGRESSION GUARD: Must NOT match new_sales_invoice despite code being 'KeyF'
    expect(matchesKeyboardShortcut(arabicBEvent, salesInvoice)).toBe(false);

    // English B
    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, code: 'KeyB' }),
        productExplorer
      )
    ).toBe(true);
  });

  it('matches receipt_bond with Arabic ق, English Q, and phonetic G', () => {
    const shortcut = getShortcut('receipt_bond');

    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'ق', ctrlKey: true }),
        shortcut
      )
    ).toBe(true);

    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'q', ctrlKey: true, code: 'KeyQ' }),
        shortcut
      )
    ).toBe(true);

    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, code: 'KeyG' }),
        shortcut
      )
    ).toBe(true);
  });

  it('matches payment_bond with Arabic د and English D', () => {
    const shortcut = getShortcut('payment_bond');

    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'د', ctrlKey: true }),
        shortcut
      )
    ).toBe(true);

    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, code: 'KeyD' }),
        shortcut
      )
    ).toBe(true);
  });

  it('matches shortcuts_help with ? or F1', () => {
    const shortcut = getShortcut('shortcuts_help');

    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: '?', shiftKey: true }),
        shortcut
      )
    ).toBe(true);

    expect(
      matchesKeyboardShortcut(
        new KeyboardEvent('keydown', { key: 'F1', code: 'F1' }),
        shortcut
      )
    ).toBe(true);
  });
});
