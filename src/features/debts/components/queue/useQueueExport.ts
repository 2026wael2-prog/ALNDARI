import { useState } from 'react';
import { useFeedbackStore } from '../../../feedback/store';
import { exportQueueToExcel } from '../../lib/queueExcelExporter';
import { queueBucketLabel, type QueueFilters } from '../../lib/queueGrid';
import type { DebtPriorityQueueRow, DebtQueueBucket } from '../../types';
import { describeFilters } from './queueCardHelpers';
import type { QueueExportController } from './queueTypes';

/**
 * تصدير xlsx منسّق مع حالة تحميل ورسالة فشل واضحة (لا فشل صامت).
 * لا يُصدَّر ملف فارغ: تُعرض رسالة إرشادية عند غياب صفوف مطابقة.
 */
export const useQueueExport = (
  baseCurrency: string,
  bucket: DebtQueueBucket,
  filters: QueueFilters,
  companyName: string
): QueueExportController => {
  const { showToast } = useFeedbackStore();
  const [isExporting, setIsExporting] = useState(false);

  const runExport = (exportRows: DebtPriorityQueueRow[]): void => {
    if (exportRows.length === 0) {
      showToast('لا توجد صفوف مطابقة للتصدير', 'info');
      return;
    }
    setIsExporting(true);
    void exportQueueToExcel(exportRows, {
      companyName,
      bucketLabel: queueBucketLabel(bucket),
      baseCurrency,
      filtersLabel: describeFilters(filters),
    })
      .catch(() => {
        showToast('تعذّر إنشاء ملف Excel — أعد المحاولة', 'error');
      })
      .finally(() => {
        setIsExporting(false);
      });
  };

  return { isExporting, runExport };
};
