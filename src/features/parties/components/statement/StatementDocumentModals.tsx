/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React from 'react';
import { BondVoucherModal } from '../../../bonds/components/BondVoucherModal';
import type { Bond } from '../../../bonds/types';
import InvoiceDetailsModal from '../../../sales/components/details/InvoiceDetailsModal';
import EditInvoiceModal from '../../../sales/components/edit/EditInvoiceModal';

interface StatementDocumentModalsProps {
  activeInvoiceId: string | null;
  onCloseInvoiceModal: () => void;
  editingInvoiceId?: string | null;
  onCloseEditInvoiceModal?: () => void;
  onEditInvoiceSuccess?: () => void;
  activeBond: Bond | null;
  isBondModalOpen: boolean;
  onCloseBondModal: () => void;
}

export const StatementDocumentModals: React.FC<StatementDocumentModalsProps> = ({
  activeInvoiceId,
  onCloseInvoiceModal,
  editingInvoiceId,
  onCloseEditInvoiceModal,
  onEditInvoiceSuccess,
  activeBond,
  isBondModalOpen,
  onCloseBondModal,
}) => {
  return (
    <>
      {/* Invoice Details Modal */}
      {activeInvoiceId && (
        <InvoiceDetailsModal invoiceId={activeInvoiceId} onClose={onCloseInvoiceModal} />
      )}

      {/* Direct Invoice Edit Modal */}
      {editingInvoiceId && onCloseEditInvoiceModal && (
        <EditInvoiceModal
          invoiceId={editingInvoiceId}
          isOpen={true}
          onClose={onCloseEditInvoiceModal}
          onSuccess={() => {
            onEditInvoiceSuccess?.();
            onCloseEditInvoiceModal();
          }}
        />
      )}

      {/* Bond Voucher Modal */}
      {activeBond && (
        <BondVoucherModal isOpen={isBondModalOpen} bond={activeBond} onClose={onCloseBondModal} />
      )}
    </>
  );
};
