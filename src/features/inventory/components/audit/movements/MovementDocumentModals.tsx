import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import InvoiceDetailsModal from '../../../../sales/components/details/InvoiceDetailsModal';
import EditInvoiceModal from '../../../../sales/components/edit/EditInvoiceModal';
import { PurchaseDetailsModal } from '../../../../purchases/components/PurchaseDetailsModal';
import type { MovementDocumentKind } from './movementDocumentUtils';

export interface ActiveMovementDocument {
  kind: MovementDocumentKind;
  referenceId: string;
}

interface MovementDocumentModalsProps {
  activeDocument: ActiveMovementDocument | null;
  editingSalesInvoiceId: string | null;
  onCloseDocument: () => void;
  onCloseEditInvoice: () => void;
}

/** Shared modal host allowing any Product Movement Log view to open source documents and edit sales invoices. */
export const MovementDocumentModals: React.FC<MovementDocumentModalsProps> = ({
  activeDocument,
  editingSalesInvoiceId,
  onCloseDocument,
  onCloseEditInvoice,
}) => {
  const queryClient = useQueryClient();

  const handleEditSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: ['item_movement'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory_movements_feed'] });
    onCloseEditInvoice();
  };

  const isSalesDetail =
    activeDocument !== null &&
    (activeDocument.kind === 'sales_invoice' || activeDocument.kind === 'sale_return');
  const isPurchaseDetail =
    activeDocument !== null &&
    (activeDocument.kind === 'purchase_invoice' || activeDocument.kind === 'purchase_return');

  return (
    <>
      {isSalesDetail && (
        <InvoiceDetailsModal
          invoiceId={activeDocument.referenceId}
          onClose={onCloseDocument}
        />
      )}

      {isPurchaseDetail && (
        <PurchaseDetailsModal
          invoiceId={activeDocument.referenceId}
          onClose={onCloseDocument}
        />
      )}

      {editingSalesInvoiceId && (
        <EditInvoiceModal
          invoiceId={editingSalesInvoiceId}
          isOpen={true}
          onClose={onCloseEditInvoice}
          onSuccess={handleEditSuccess}
        />
      )}
    </>
  );
};
