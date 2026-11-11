import React from 'react';
import type { DebtCollector } from '../../types';
import { QueueBulkBar } from './QueueControls';
import type { QueueHandlers } from './queueTypes';

interface QueueBulkAreaProps {
  selectedIds: Set<string>;
  collectors: DebtCollector[];
  isAssigning: boolean;
  handlers: QueueHandlers;
}

/** شريط الإجراءات الجماعية — لا يُرسم إلا عند وجود تحديد فعلي. */
const QueueBulkArea: React.FC<QueueBulkAreaProps> = ({
  selectedIds,
  collectors,
  isAssigning,
  handlers,
}) => {
  if (selectedIds.size === 0) return null;
  return (
    <QueueBulkBar
      selectedCount={selectedIds.size}
      collectors={collectors}
      isAssigning={isAssigning}
      onAssign={handlers.handleAssign}
      onExport={handlers.exportSelected}
      onClear={handlers.clearSelection}
    />
  );
};

export default QueueBulkArea;
