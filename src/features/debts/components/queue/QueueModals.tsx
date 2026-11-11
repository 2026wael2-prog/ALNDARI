import React from 'react';
import { ReminderModal } from '../ReminderModal';
import PromiseFormModal from '../PromiseFormModal';
import type { QueueSelection } from './queueTypes';

/** نوافذ التذكير والوعد — تُركّب هنا كي يبقى المكوّن الرئيسي تركيباً صرفياً. */
const QueueModals: React.FC<{ selection: QueueSelection }> = ({ selection }) => (
  <>
    {selection.reminderTarget !== null && (
      <ReminderModal
        isOpen
        onClose={() => {
          selection.setRemindRow(null);
        }}
        row={selection.reminderTarget}
      />
    )}
    <PromiseFormModal
      isOpen={selection.promiseRow !== null}
      onClose={() => {
        selection.setPromiseRow(null);
      }}
      partyId={selection.promiseRow?.party_id ?? null}
      partyName={selection.promiseRow?.party_name ?? null}
    />
  </>
);

export default QueueModals;
