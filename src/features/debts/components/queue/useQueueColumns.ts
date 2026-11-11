import { useMemo } from 'react';
import type { Column } from '../../../../ui/common/ExcelTable';
import type { DebtPriorityQueueRow } from '../../types';
import { buildQueueColumns } from './queueColumns';
import { rankOf } from './queueCardHelpers';
import type { QueueData, QueueSelection } from './queueTypes';

interface ColumnsContext {
  data: QueueData;
  baseCurrency: string;
  canRemind: boolean;
  canManage: boolean;
  selection: QueueSelection;
}

/** يبني الأعمدة مرة واحدة لكل تغيير مؤثر (صفوف/فلترة/صلاحيات). */
export const useQueueColumns = ({
  data,
  baseCurrency,
  canRemind,
  canManage,
  selection,
}: ColumnsContext): Array<Column<DebtPriorityQueueRow>> => {
  const rankById = useMemo(() => rankOf(data.rows), [data.rows]);
  const { partiesWithDetail, setRemindRow, setPromiseRow } = selection;
  return useMemo(
    () =>
      buildQueueColumns({
        rows: data.visible,
        baseCurrency,
        rankById,
        canRemind,
        canManage,
        partiesWithDetail,
        onRemind: setRemindRow,
        onPromise: setPromiseRow,
      }),
    [
      data.visible,
      baseCurrency,
      rankById,
      canRemind,
      canManage,
      partiesWithDetail,
      setRemindRow,
      setPromiseRow,
    ]
  );
};
