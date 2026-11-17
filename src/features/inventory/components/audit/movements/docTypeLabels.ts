export interface DocTypeMeta {
  label: string;
  badge: string;
}

export interface MovementSelectedProduct {
  id: string;
  name_ar?: string | undefined;
  sku?: string | undefined;
  part_number?: string | null | undefined;
  brand?: string | null | undefined;
}

export interface MovementsStats {
  count: number;
  totalIn: number;
  totalOut: number;
  net: number;
}

export const DOC_TYPE_LABELS: Record<string, DocTypeMeta> = {
  sale: {
    label: 'فاتورة بيع',
    badge:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50',
  },
  purchase: {
    label: 'فاتورة شراء',
    badge:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
  },
  sale_return: {
    label: 'مردود مبيعات',
    badge:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
  },
  purchase_return: {
    label: 'مردود مشتريات',
    badge:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50',
  },
  transfer: {
    label: 'مناقلة مستودعية',
    badge:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50',
  },
  stock_audit: {
    label: 'تسوية جردية',
    badge:
      'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/50',
  },
  adjustment: {
    label: 'تسوية مخزنية',
    badge:
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50',
  },
};

const DEFAULT_DOC_TYPE_BADGE =
  'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300';

/** Resolve display label and badge styling for an inventory document type. */
export const getDocTypeMeta = (docType: string): DocTypeMeta =>
  DOC_TYPE_LABELS[docType] || {
    label: docType,
    badge: DEFAULT_DOC_TYPE_BADGE,
  };
