import { ShortcutDefinition } from './types';

export const SYSTEM_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: 'new_sales_invoice',
    label: 'فاتورة مبيعات جديدة',
    description: 'فتح شاشة إنشاء فاتورة مبيعات جديدة',
    arKey: 'ف',
    enKey: 'f',
    category: 'sales',
    modifiers: ['ctrl'],
    allowInInputs: true,
  },
  {
    id: 'customer_statement',
    label: 'كشف حساب عميل',
    description: 'فتح شاشة كشوفات الحسابات لاختيار العميل واستعراض كشف حسابه',
    arKey: 'ك',
    enKey: 'k',
    category: 'clients',
    modifiers: ['ctrl'],
    allowInInputs: true,
  },
  {
    id: 'new_product',
    label: 'منتج جديد',
    description: 'فتح نافذة إضافة صنف أو منتج جديد للمخزون',
    arKey: 'م',
    enKey: 'm',
    category: 'inventory',
    modifiers: ['ctrl'],
    allowInInputs: true,
  },
  {
    id: 'product_explorer',
    label: 'مستكشف المنتجات الذكي',
    description: 'فتح مستكشف الأصناف في شاشة المبيعات لاختيار البضائع وإدراجها',
    arKey: 'ب',
    enKey: 'b',
    category: 'sales',
    modifiers: ['ctrl'],
    allowInInputs: true,
  },
  {
    id: 'receipt_bond',
    label: 'سند قبض جديد',
    description: 'فتح شاشة ونموذج إضافة سند قبض نقدي أو بنكي',
    arKey: 'ق',
    enKey: 'q',
    category: 'bonds',
    modifiers: ['ctrl'],
    allowInInputs: true,
  },
  {
    id: 'payment_bond',
    label: 'سند دفع جديد',
    description: 'فتح شاشة ونموذج إضافة سند دفع / صرف',
    arKey: 'د',
    enKey: 'd',
    category: 'bonds',
    modifiers: ['ctrl'],
    allowInInputs: true,
  },
  {
    id: 'shortcuts_help',
    label: 'دليل الاختصارات السريعة',
    description: 'عرض قائمة بجميع اختصارات لوحة المفاتيح المتاحة',
    arKey: '؟',
    enKey: '?',
    category: 'general',
    modifiers: ['shift'],
    allowInInputs: false,
  },
];

/**
 * Checks if a KeyboardEvent matches a given ShortcutDefinition.
 * Supports both Arabic and English characters, as well as physical key codes.
 */
export function matchesKeyboardShortcut(
  e: KeyboardEvent,
  shortcut: ShortcutDefinition
): boolean {
  const code = e.code ? e.code.toLowerCase() : '';
  const key = e.key ? e.key.toLowerCase() : '';
  const hasCtrlOrMeta = e.ctrlKey || e.metaKey;

  // Specific global help triggers (Shift + ? or F1 or Ctrl + /)
  if (shortcut.id === 'shortcuts_help') {
    if (e.key === 'F1' || code === 'f1') {
      return true;
    }
    if ((e.key === '?' || e.key === '؟') && e.shiftKey) {
      return true;
    }
    if (hasCtrlOrMeta && (key === '/' || code === 'slash')) {
      return true;
    }
    return false;
  }

  const requiredModifiers = shortcut.modifiers ?? ['ctrl'];
  const wantsCtrl = requiredModifiers.includes('ctrl');
  const wantsShift = requiredModifiers.includes('shift');
  const wantsAlt = requiredModifiers.includes('alt');
  const wantsMeta = requiredModifiers.includes('meta');

  // Check Ctrl/Meta modifier
  if (wantsCtrl) {
    if (!hasCtrlOrMeta) return false;
  } else if (!wantsMeta && hasCtrlOrMeta && !shortcut.allowInInputs) {
    return false;
  }

  // Check Shift modifier
  if (wantsShift && !e.shiftKey) return false;
  if (!wantsShift && e.shiftKey) return false;

  // Check Alt modifier
  if (wantsAlt && !e.altKey) return false;
  if (!wantsAlt && e.altKey) return false;

  const isArabicChar = /[\u0600-\u06FF]/.test(key);

  // If the typed key is an Arabic character, match strictly against the Arabic shortcut definition
  // to prevent physical code collisions (e.g. Arabic 'ب' resides on physical KeyF, which must NOT trigger 'Ctrl+F' invoice)
  if (isArabicChar) {
    return !!(shortcut.arKey && key === shortcut.arKey.toLowerCase());
  }

  // Match English key (direct typed character)
  if (shortcut.enKey && key === shortcut.enKey.toLowerCase()) {
    return true;
  }

  // Receipt bond also accepts 'g' (phonetic for قبض)
  if (shortcut.id === 'receipt_bond' && (key === 'g' || code === 'keyg')) {
    return true;
  }

  // Match physical English key code (e.g. KeyF for F, KeyK for K, etc.)
  if (shortcut.enKey) {
    const expectedCode = `key${shortcut.enKey.toLowerCase()}`;
    if (code === expectedCode) {
      return true;
    }
  }

  // Physical key locations on standard Arabic 101/102 keyboard layout
  // (In case e.key is swallowed or typed in alternative layout)
  if (shortcut.id === 'new_sales_invoice') {
    // ف is on physical KeyT
    if (code === 'keyt') return true;
  } else if (shortcut.id === 'customer_statement') {
    // ك is on physical Semicolon
    if (code === 'semicolon') return true;
  } else if (shortcut.id === 'new_product') {
    // م is on physical KeyL
    if (code === 'keyl') return true;
  } else if (shortcut.id === 'product_explorer') {
    // ب is on physical KeyF
    if (code === 'keyf') return true;
  } else if (shortcut.id === 'receipt_bond') {
    // ق is on physical KeyG or KeyR
    if (code === 'keyg' || code === 'keyr') return true;
  } else if (shortcut.id === 'payment_bond') {
    // د is on physical BracketRight or BracketLeft
    if (code === 'bracketright' || code === 'bracketleft') return true;
  }

  return false;
}
