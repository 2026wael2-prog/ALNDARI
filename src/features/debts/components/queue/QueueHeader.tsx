import React from 'react';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { cn } from '../../../../core/utils';
import { queueBucketLabel } from '../../lib/queueGrid';
import type { DebtQueueBucket } from '../../types';
import { FOCUS_ROWS, ghostButton } from './queueCardConstants';
import type { QueueData, QueueHandlers } from './queueTypes';

interface QueueHeaderProps {
  bucket: DebtQueueBucket;
  data: QueueData;
  handlers: QueueHandlers;
  onBucketChange: (bucket: DebtQueueBucket) => void;
}

/** ترويسة الطابور: البِكِت الحالي، وضع التركيز، والتحديث اليدوي. */
const QueueHeader: React.FC<QueueHeaderProps> = ({ bucket, data, handlers, onBucketChange }) => (
  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] px-3 py-2.5">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="text-sm font-bold text-[var(--app-text)]">طابور التحصيل بالأهمية</h3>
      <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-400">
        {queueBucketLabel(bucket)}
      </span>
      {bucket !== 'all' && (
        <button
          type="button"
          onClick={() => {
            onBucketChange('all');
          }}
          className={cn(ghostButton, 'hover:border-rose-500/40 hover:text-rose-600')}
          title="إلغاء فلتر البِكِت والعودة لكل المهام"
        >
          <X size={11} /> إلغاء الفلتر
        </button>
      )}
    </div>
    <div className="flex items-center gap-2">
      {data.query.isFetching ? <Loader2 size={13} className="animate-spin text-blue-600" /> : null}
      <button
        type="button"
        onClick={handlers.toggleFocus}
        aria-pressed={data.focusOnly}
        title={`إظهار أعلى ${String(FOCUS_ROWS)} مهمة فقط`}
        className={cn(
          ghostButton,
          data.focusOnly && 'border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300'
        )}
      >
        تركيز {FOCUS_ROWS}
      </button>
      <button type="button" onClick={handlers.refresh} className={ghostButton}>
        <RotateCcw size={11} /> تحديث
      </button>
    </div>
  </header>
);

export default QueueHeader;
