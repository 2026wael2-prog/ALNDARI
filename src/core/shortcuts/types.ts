export type ShortcutModifier = 'ctrl' | 'shift' | 'alt' | 'meta';

export type ShortcutCategory = 'sales' | 'inventory' | 'bonds' | 'clients' | 'general';

export interface ShortcutDefinition {
  id: string;
  label: string;
  description: string;
  arKey: string;
  enKey: string;
  category: ShortcutCategory;
  modifiers?: ShortcutModifier[];
  allowInInputs?: boolean;
}

export interface RegisteredShortcut extends ShortcutDefinition {
  action: () => void;
}
