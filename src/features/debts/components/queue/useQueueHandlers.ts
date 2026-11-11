import { EMPTY_QUEUE_FILTERS, type QueueFilters, type QueueSavedView } from '../../lib/queueGrid';
import type { useDebtMutations } from '../../hooks/useDebtMutations';
import type { DebtPriorityQueueRow } from '../../types';
import type { QueueData, QueueExportController, QueueHandlers } from './queueTypes';

interface HandlersContext {
  data: QueueData;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  assignParties: ReturnType<typeof useDebtMutations>['assignParties'];
  exporter: QueueExportController;
}

/** الصفوف المحددة فعلياً من بيانات الطابور الكاملة. */
const selectedRowsOf = (
  data: QueueData,
  selectedIds: Set<string>
): DebtPriorityQueueRow[] => data.rows.filter(row => selectedIds.has(row.task_id));

/** كل معالجات الطابور في مكان واحد — يبقى المكوّن الرئيسي تركيباً صرفياً. */
export const useQueueHandlers = ({
  data,
  selectedIds,
  setSelectedIds,
  assignParties,
  exporter,
}: HandlersContext): QueueHandlers => {
  const handleAssign = (collectorId: string): void => {
    if (selectedIds.size === 0) return;
    const partyIds = [...new Set(selectedRowsOf(data, selectedIds).map(row => row.party_id))];
    assignParties(
      { partyIds, collectorId },
      {
        onSuccess: () => {
          setSelectedIds(new Set());
        },
      }
    );
  };

  return {
    toggleFocus: () => {
      data.setFocusOnly(value => !value);
    },
    refresh: () => {
      void data.query.refetch();
    },
    patchFilters: (change: Partial<QueueFilters>) => {
      data.setFilters(previous => ({ ...previous, ...change }));
    },
    applyView: (view: QueueSavedView) => {
      data.setFilters(view.filters);
      setSelectedIds(new Set());
    },
    clearFilters: () => {
      data.setFilters(EMPTY_QUEUE_FILTERS);
    },
    clearSelection: () => {
      setSelectedIds(new Set());
    },
    handleAssign,
    exportSelected: () => {
      exporter.runExport(selectedRowsOf(data, selectedIds));
    },
    exportVisible: () => {
      exporter.runExport(data.visible);
    },
  };
};
