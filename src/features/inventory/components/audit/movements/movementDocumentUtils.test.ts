import { describe, expect, it } from 'vitest';
import { resolveMovementDocumentAction } from './movementDocumentUtils';

describe('resolveMovementDocumentAction', () => {
  it('resolves editable sales_invoice for standard, edited, and merged sales invoice docs', () => {
    for (const docType of ['sale_invoice', 'sales_invoice', 'sales_invoice_edit', 'sales_invoice_merge']) {
      const action = resolveMovementDocumentAction({
        reference_id: 'inv-100',
        doc_type: docType,
        document_number: 'INV-100',
      });

      expect(action.kind).toBe('sales_invoice');
      expect(action.referenceId).toBe('inv-100');
      expect(action.canOpenDocument).toBe(true);
      expect(action.canEditInvoice).toBe(true);
      expect(action.badgeLabel.trim().length).toBeGreaterThan(0);
      expect(action.badgeClass.length).toBeGreaterThan(0);
    }
  });

  it('resolves purchase_invoice without enabling sales invoice editing', () => {
    const action = resolveMovementDocumentAction({
      reference_id: 'pur-200',
      doc_type: 'purchase_invoice',
      document_number: 'PUR-200',
    });

    expect(action.kind).toBe('purchase_invoice');
    expect(action.referenceId).toBe('pur-200');
    expect(action.canOpenDocument).toBe(true);
    expect(action.canEditInvoice).toBe(false);
    expect(action.badgeLabel.trim().length).toBeGreaterThan(0);
    expect(action.badgeClass.length).toBeGreaterThan(0);
  });

  it('resolves sale_return and purchase_return', () => {
    const saleReturn = resolveMovementDocumentAction({
      reference_id: 'sret-1',
      doc_type: 'sale_return',
    });
    expect(saleReturn.kind).toBe('sale_return');
    expect(saleReturn.canOpenDocument).toBe(true);
    expect(saleReturn.canEditInvoice).toBe(false);

    const purchaseReturn = resolveMovementDocumentAction({
      reference_id: 'pret-1',
      doc_type: 'purchase_return',
    });
    expect(purchaseReturn.kind).toBe('purchase_return');
    expect(purchaseReturn.canOpenDocument).toBe(true);
    expect(purchaseReturn.canEditInvoice).toBe(false);
  });

  it('resolves transfer and stock_audit document kinds', () => {
    const transfer = resolveMovementDocumentAction({
      reference_id: 'tr-1',
      doc_type: 'transfer',
    });
    expect(transfer.kind).toBe('transfer');
    expect(transfer.referenceId).toBe('tr-1');
    expect(transfer.badgeLabel).toBe('مناقلة مخزنية');

    const audit = resolveMovementDocumentAction({
      reference_id: 'aud-1',
      doc_type: 'stock_audit',
    });
    expect(audit.kind).toBe('audit');
    expect(audit.referenceId).toBe('aud-1');
    expect(audit.badgeLabel).toBe('تسوية جردية');
  });

  it('disables document opening and invoice editing when reference_id is missing', () => {
    const action = resolveMovementDocumentAction({
      reference_id: null,
      doc_type: 'sales_invoice',
      document_number: 'INV-999',
    });

    expect(action.referenceId).toBeNull();
    expect(action.canOpenDocument).toBe(false);
    expect(action.canEditInvoice).toBe(false);
  });
});
