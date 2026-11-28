export type MovementDocumentKind =
  | 'sales_invoice'
  | 'purchase_invoice'
  | 'sale_return'
  | 'purchase_return'
  | 'transfer'
  | 'audit'
  | 'none';

export interface MovementDocumentAction {
  kind: MovementDocumentKind;
  referenceId: string | null;
  canOpenDocument: boolean;
  canEditInvoice: boolean;
  badgeLabel: string;
  badgeClass: string;
}

export interface MovementDocumentInput {
  reference_id?: string | null | undefined;
  doc_type?: string | null | undefined;
  reference_type?: string | null | undefined;
  original_type?: string | null | undefined;
  document_number?: string | null | undefined;
}

const BADGE_CLASSES: Record<MovementDocumentKind | 'edit' | 'merge' | 'adjustment', string> = {
  sales_invoice:
    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50',
  purchase_invoice:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
  sale_return:
    'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900/50',
  purchase_return:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50',
  transfer:
    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50',
  audit:
    'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/50',
  edit: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  merge:
    'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50',
  adjustment:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  none: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

/** Resolves source document kind, openability, editability, and Arabic badge metadata for any stock movement row. */
export function resolveMovementDocumentAction(row: MovementDocumentInput): MovementDocumentAction {
  const referenceId =
    typeof row.reference_id === 'string' && row.reference_id.trim() !== ''
      ? row.reference_id.trim()
      : null;

  const docType = (row.doc_type ?? '').toLowerCase().trim();
  const refType = (row.reference_type ?? '').toLowerCase().trim();
  const origType = (row.original_type ?? '').toLowerCase().trim();
  const docNum = (row.document_number ?? '').toLowerCase().trim();

  if (docType === 'sale_return' || refType.includes('sale_return') || refType === 'sales_return' || origType === 'sales_return' || docNum.includes('مرتجع مبيعات')) {
    return {
      kind: 'sale_return',
      referenceId,
      canOpenDocument: Boolean(referenceId),
      canEditInvoice: false,
      badgeLabel: 'مردود مبيعات',
      badgeClass: BADGE_CLASSES.sale_return,
    };
  }

  if (docType === 'purchase_return' || refType.includes('purchase_return') || origType === 'purchase_return' || docNum.includes('مرتجع مشتريات')) {
    return {
      kind: 'purchase_return',
      referenceId,
      canOpenDocument: Boolean(referenceId),
      canEditInvoice: false,
      badgeLabel: 'مردود مشتريات',
      badgeClass: BADGE_CLASSES.purchase_return,
    };
  }

  if (docType === 'purchase' || docType === 'purchase_invoice' || refType.includes('purchase_invoice') || origType === 'purchase' || docNum.includes('فاتورة شراء')) {
    return {
      kind: 'purchase_invoice',
      referenceId,
      canOpenDocument: Boolean(referenceId),
      canEditInvoice: false,
      badgeLabel: 'فاتورة شراء',
      badgeClass: BADGE_CLASSES.purchase_invoice,
    };
  }

  if (
    docType === 'sale' ||
    docType === 'sales_invoice' ||
    docType === 'sale_invoice' ||
    docType === 'sales_invoice_edit' ||
    docType === 'sales_invoice_merge' ||
    refType === 'sales_invoice' ||
    refType === 'sale_invoice' ||
    refType === 'sales_invoice_edit' ||
    refType === 'sales_invoice_merge' ||
    refType === 'invoice' ||
    origType === 'sales' ||
    docNum.includes('فاتورة بيع')
  ) {
    const isEdit = docType === 'sales_invoice_edit' || refType === 'sales_invoice_edit';
    const isMerge = docType === 'sales_invoice_merge' || refType === 'sales_invoice_merge';
    const badgeLabel = isEdit ? 'تعديل فاتورة' : isMerge ? 'دمج فواتير' : 'فاتورة بيع';
    const badgeClass = isEdit
      ? BADGE_CLASSES.edit
      : isMerge
        ? BADGE_CLASSES.merge
        : BADGE_CLASSES.sales_invoice;

    return {
      kind: 'sales_invoice',
      referenceId,
      canOpenDocument: Boolean(referenceId),
      canEditInvoice: Boolean(referenceId),
      badgeLabel,
      badgeClass,
    };
  }

  if (docType === 'transfer' || refType.includes('transfer') || origType.includes('transfer')) {
    return {
      kind: 'transfer',
      referenceId,
      canOpenDocument: false,
      canEditInvoice: false,
      badgeLabel: 'مناقلة مخزنية',
      badgeClass: BADGE_CLASSES.transfer,
    };
  }

  if (docType === 'stock_audit' || refType.includes('audit') || docNum.includes('جرد')) {
    return {
      kind: 'audit',
      referenceId,
      canOpenDocument: false,
      canEditInvoice: false,
      badgeLabel: 'تسوية جردية',
      badgeClass: BADGE_CLASSES.audit,
    };
  }

  return {
    kind: 'none',
    referenceId,
    canOpenDocument: false,
    canEditInvoice: false,
    badgeLabel: 'تسوية مخزنية',
    badgeClass: BADGE_CLASSES.adjustment,
  };
}
