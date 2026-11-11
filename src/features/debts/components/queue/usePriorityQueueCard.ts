import { useState } from 'react';
import type { Column } from '../../../../ui/common/ExcelTable';
import { usePermission } from '../../../../core/hooks/usePermission';
import { useCompany } from '../../../settings/hooks';
import { useDebtCollectors, useDebtDashboard } from '../../hooks/useDebtQueries';
import { useDebtMutations } from '../../hooks/useDebtMutations';
import type { DebtCollector, DebtPriorityQueueRow, DebtQueueBucket } from '../../types';
import { baseCurrencyOf } from './queueCardHelpers';
import type { QueueData, QueueExportController, QueueHandlers, QueueSelection } from './queueTypes';
import { useQueueColumns } from './useQueueColumns';
import { useQueueData } from './useQueueData';
import { useQueueExport } from './useQueueExport';
import { useQueueHandlers } from './useQueueHandlers';
import { useQueueSelection } from './useQueueSelection';

export interface PriorityQueueCardModel {
  data: QueueData;
  columns: Array<Column<DebtPriorityQueueRow>>;
  handlers: QueueHandlers;
  selection: QueueSelection;
  exporter: QueueExportController;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  canRemind: boolean;
  canManage: boolean;
  collectors: DebtCollector[];
  isAssigning: boolean;
  baseCurrency: string;
}

/** كل حالة الطابور ومشتقاته في hook واحد — يبقى المكوّن تركيباً مرئياً فقط. */
export const usePriorityQueueCard = (bucket: DebtQueueBucket): PriorityQueueCardModel => {
  const data = useQueueData(bucket);
  const { data: dashboardRows } = useDebtDashboard();
  const { data: collectors } = useDebtCollectors();
  const { data: company } = useCompany();
  const { assignParties, isSaving } = useDebtMutations();
  const selection = useQueueSelection(dashboardRows);
  const { hasPermission: canRemind } = usePermission('debts:remind');
  const { hasPermission: canManage } = usePermission('debts:manage');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set<string>());
  const baseCurrency = baseCurrencyOf(company?.base_currency);
  const exporter = useQueueExport(baseCurrency, bucket, data.filters, company?.name_ar ?? '');
  const columns = useQueueColumns({ data, baseCurrency, canRemind, canManage, selection });
  const handlers = useQueueHandlers({ data, selectedIds, setSelectedIds, assignParties, exporter });

  return {
    data,
    columns,
    handlers,
    selection,
    exporter,
    selectedIds,
    setSelectedIds,
    canRemind,
    canManage,
    collectors: collectors ?? [],
    isAssigning: isSaving,
    baseCurrency,
  };
};
