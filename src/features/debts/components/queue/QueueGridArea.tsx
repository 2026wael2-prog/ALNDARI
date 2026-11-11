import React from 'react';
import ExcelTable, { type Column } from '../../../../ui/common/ExcelTable';
import { queueRowId } from '../../lib/queueGrid';
import type { DebtPriorityQueueRow } from '../../types';
import DebtQueryError from '../DebtQueryError';
import QueueMobileList from './QueueMobileList';
import { QueueStatusBar } from './QueueControls';
import type { QueueData, QueueSelection } from './queueTypes';

interface QueueDesktopGridProps {
  data: QueueData;
  columns: Array<Column<DebtPriorityQueueRow>>;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onExport: () => void;
}

/** شبكة سطح المكتب: ExcelTable المعيارية (ترويسة مجمّدة/فرز/تحديد/تصدير). */
const QueueDesktopGrid: React.FC<QueueDesktopGridProps> = ({
  data,
  columns,
  selectedIds,
  onSelectionChange,
  onExport,
}) => (
  <div className="hidden min-h-[420px] flex-col md:flex">
    <ExcelTable
      columns={columns}
      data={data.visible}
      title="طابور التحصيل"
      resizeStorageKey="debts_priority_queue_cols"
      colorTheme="blue"
      isRTL
      showSearch={false}
      enableSelection
      enableResize
      enablePagination
      pageSize={25}
      isLoading={data.query.isLoading}
      emptyMessage="لا توجد مهام مطابقة للفلاتر الحالية"
      getRowId={queueRowId}
      selectedRowIds={selectedIds}
      onSelectionChange={onSelectionChange}
      onExport={onExport}
    />
  </div>
);

interface QueueGridAreaProps {
  data: QueueData;
  columns: Array<Column<DebtPriorityQueueRow>>;
  baseCurrency: string;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  canRemind: boolean;
  canManage: boolean;
  selection: QueueSelection;
  onRetry: () => void;
  onExport: () => void;
}

/** منطقة العرض: شبكة سطح المكتب + قائمة الجوال + شريط الحالة. */
const QueueGridArea: React.FC<QueueGridAreaProps> = ({
  data,
  columns,
  baseCurrency,
  selectedIds,
  onSelectionChange,
  canRemind,
  canManage,
  selection,
  onRetry,
  onExport,
}) => {
  if (data.query.isError) {
    return (
      <div className="p-3">
        <DebtQueryError
          message="تعذّر جلب طابور التحصيل المرتّب، فأُخفي بدل عرض ترتيب غير حقيقي."
          onRetry={onRetry}
        />
      </div>
    );
  }
  return (
    <>
      <QueueDesktopGrid
        data={data}
        columns={columns}
        selectedIds={selectedIds}
        onSelectionChange={onSelectionChange}
        onExport={onExport}
      />
      <QueueMobileList
        rows={data.visible}
        canRemind={canRemind}
        canManage={canManage}
        partiesWithDetail={selection.partiesWithDetail}
        onRemind={selection.setRemindRow}
        onPromise={selection.setPromiseRow}
      />
      <QueueStatusBar
        summary={data.summary}
        baseCurrency={baseCurrency}
        totalRows={data.rows.length}
        selectedCount={selectedIds.size}
      />
    </>
  );
};

export default QueueGridArea;
