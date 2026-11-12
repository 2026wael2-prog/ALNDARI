import React from 'react';
import type { DebtPriorityQueueRow } from '../../types';
import { QueueActionsCell, QueueAmountCell, QueuePartyCell, QueueScoreCell } from './QueueCells';

interface QueueMobileListProps {
  rows: DebtPriorityQueueRow[];
  canRemind: boolean;
  canManage: boolean;
  partiesWithDetail?: ReadonlySet<string>;
  onRemind: (row: DebtPriorityQueueRow) => void;
  onPromise: (row: DebtPriorityQueueRow) => void;
}

/** نسخة الجوال (تحت md): نفس الخلايا لكن بلا شبكة عريضة. */
const QueueMobileList: React.FC<QueueMobileListProps> = ({
  rows,
  canRemind,
  canManage,
  onRemind,
  onPromise,
}) => (
  <ul className="divide-y divide-[var(--app-border)] md:hidden">
    {rows.map((row, index) => (
      <li key={row.task_id} className="flex items-start gap-2 px-3 py-2.5">
        <span className="w-4 pt-0.5 text-center font-mono text-[10px] font-bold text-[var(--app-text-secondary)]">
          {String(index + 1)}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <QueueScoreCell score={row.priority_score} drivers={row.score_drivers} />
            <QueuePartyCell row={row} />
          </div>
          <QueueAmountCell row={row} />
        </div>
        <QueueActionsCell
          row={row}
          canRemind={canRemind}
          canManage={canManage}
          onRemind={onRemind}
          onPromise={onPromise}
        />
      </li>
    ))}
  </ul>
);

export default QueueMobileList;
