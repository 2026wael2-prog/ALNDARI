/**
 * PriorityQueueCard — طابور التحصيل التنفيذي كشبكة إكسل احترافية.
 *
 * ترقية مقصودة: كان الطابور قائمة `<ul>` للقراءة فقط، وصار شبكة ExcelTable
 * المعيارية في النظام (ترويسة مجمّدة، فرز، تحديد، نسخ TSV، تدقيق أعمدة محفوظ،
 * عرض كامل، ترقيم صفحات) فوقها طبقة عمل حقيقية:
 *   • فلترة متقدمة (بحث/درجة/تأخر/عملة/تصعيد/مسؤول/انقطاع تواصل).
 *   • عروض محفوظة (حرج / تأخر مطوّل / قابل للتذكير / منقطع التواصل).
 *   • إجراءات جماعية: إسناد المحدد لمحصّل عبر RPC، وتصدير المحدد.
 *   • تلوين حراري للدرجة والمبلغ وأيام التأخير + حصة كل صف من الطابور.
 *   • صف إجمالي وشريط حالة كإكسل، وتصدير xlsx منسّق (RTL + مجاميع).
 *
 * كل الترتيب والدرجة من الخادم (`get_debt_priority_queue`): الواجهة لا تملك
 * مبالغ موحّدة العملة ولا سجل التواصل، فلا يجوز أن تختلق ترتيباً محلياً.
 *
 * البنية: الحالة في `usePriorityQueueCard`، والأجزاء المرئية في `./queue/*`.
 */
import React from 'react';
import { QueueFilterBar, QueuePresetsRow } from './queue/QueueControls';
import QueueBulkArea from './queue/QueueBulkArea';
import QueueGridArea from './queue/QueueGridArea';
import QueueHeader from './queue/QueueHeader';
import QueueModals from './queue/QueueModals';
import QueueScoreFormula from './queue/QueueScoreFormula';
import type { DebtQueueBucket } from '../types';
import { usePriorityQueueCard } from './queue/usePriorityQueueCard';

export interface PriorityQueueCardProps {
  bucket: DebtQueueBucket;
  onBucketChange: (bucket: DebtQueueBucket) => void;
}

/**
 * طابور التحصيل التنفيذي: كل صف يحمل درجة أهميته وسببها والأمر التالي، مع
 * إجراءات مباشرة (تذكير / وعد / فتح الملف) وإجراءات جماعية على المحدد.
 */
export const PriorityQueueCard: React.FC<PriorityQueueCardProps> = ({ bucket, onBucketChange }) => {
  const model = usePriorityQueueCard(bucket);
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm">
      <QueueHeader
        bucket={bucket}
        data={model.data}
        handlers={model.handlers}
        onBucketChange={onBucketChange}
      />
      <QueueFilterBar
        filters={model.data.filters}
        options={model.data.options}
        onChange={model.handlers.patchFilters}
      />
      <QueuePresetsRow
        filters={model.data.filters}
        isExporting={model.exporter.isExporting}
        onApply={model.handlers.applyView}
        onClear={model.handlers.clearFilters}
      />
      <QueueBulkArea
        selectedIds={model.selectedIds}
        collectors={model.collectors}
        isAssigning={model.isAssigning}
        handlers={model.handlers}
      />
      <QueueGridArea
        data={model.data}
        columns={model.columns}
        baseCurrency={model.baseCurrency}
        selectedIds={model.selectedIds}
        onSelectionChange={model.setSelectedIds}
        canRemind={model.canRemind}
        canManage={model.canManage}
        selection={model.selection}
        onRetry={model.handlers.refresh}
        onExport={model.handlers.exportVisible}
      />
      <QueueScoreFormula />
      <QueueModals selection={model.selection} />
    </section>
  );
};

export default PriorityQueueCard;
