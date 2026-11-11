/**
 * QueueControls — أدوات شبكة طابور التحصيل: فلترة متقدمة، عروض محفوظة،
 * إجراءات جماعية، وشريط حالة كإكسل.
 *
 * كل عرض مالي هنا مبني على `amount_base` (العملة الأساس) — لا تُجمع عملات.
 */
import React from 'react';
import { Download, Filter, Loader2, Users, X } from 'lucide-react';
import { cn } from '../../../../core/utils';
import { formatCurrency } from '../../../../core/utils/currencyUtils';
import SearchInput from '../../../../ui/components/SearchInput';
import { escalationLabel } from '../../lib/constants';
import {
  QUEUE_SAVED_VIEWS,
  baseTotalLabel,
  isSavedViewActive,
  type QueueFilterOptions,
  type QueueFilters,
  type QueueSummary,
  type QueueSavedView,
} from '../../lib/queueGrid';
import type { DebtCollector } from '../../types';

const chipBase =
  'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors';
const chipIdle =
  'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-secondary)] hover:border-blue-500/40 hover:text-blue-600';
const chipActive = 'border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300';
const selectClass =
  'rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-1.5 py-1 text-[11px] font-bold text-[var(--app-text)] outline-none focus:border-blue-500/60';
const fieldLabel = 'text-[10px] font-bold uppercase tracking-tight text-[var(--app-text-secondary)]';

interface FilterSelectProps {
  label: string;
  value: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

/** قائمة اختيار واحدة بتسمية صغيرة (كثافة إكسل). */
export const QueueFilterSelect: React.FC<FilterSelectProps> = ({
  label,
  value,
  allLabel,
  options,
  onChange,
}) => (
  <label className="flex items-center gap-1">
    <span className={fieldLabel}>{label}</span>
    <select
      className={selectClass}
      value={value}
      onChange={event => {
        onChange(event.target.value);
      }}
    >
      <option value="">{allLabel}</option>
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
);

interface ToggleProps {
  label: string;
  active: boolean;
  title: string;
  onToggle: () => void;
}

/** مفتاح تصفية ثنائي (لهاتف / متأخر / منقطع التواصل). */
export const QueueToggle: React.FC<ToggleProps> = ({ label, active, title, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    title={title}
    aria-pressed={active}
    className={cn(chipBase, active ? chipActive : chipIdle)}
  >
    <Filter size={11} />
    {label}
  </button>
);

interface PresetChipsProps {
  filters: QueueFilters;
  onApply: (view: QueueSavedView) => void;
  onClear: () => void;
}

/** عروض محفوظة: فلترة جاهزة بضغطة، وزر مسح يظهر عند وجود فلتر مطبَّق. */
export const QueuePresetChips: React.FC<PresetChipsProps> = ({ filters, onApply, onClear }) => {
  const pct = filters.minScore;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {QUEUE_SAVED_VIEWS.map(view => (
        <button
          key={view.id}
          type="button"
          title={view.hint}
          aria-pressed={isSavedViewActive(filters, view)}
          onClick={() => {
            onApply(view);
          }}
          className={cn(chipBase, isSavedViewActive(filters, view) ? chipActive : chipIdle)}
        >
          {view.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        title="مسح كل الفلاتر"
        className={cn(chipBase, chipIdle, 'hover:border-rose-500/40 hover:text-rose-600')}
      >
        <X size={11} /> مسح
      </button>
      {pct > 0 && (
        <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
          درجة ≥ {String(pct)}
        </span>
      )}
    </div>
  );
};

interface ScoreRangeProps {
  value: number;
  onChange: (value: number) => void;
}

/** منزلق حد الدرجة الأدنى — الفلتر الأهم: «أرني ما يستحق العمل الآن». */
export const QueueScoreRange: React.FC<ScoreRangeProps> = ({ value, onChange }) => (
  <label className="flex items-center gap-1.5">
    <span className={fieldLabel}>أدنى درجة</span>
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      value={value}
      onChange={event => {
        onChange(Number(event.target.value));
      }}
      className="h-1 w-24 cursor-pointer accent-blue-600"
      aria-label="أدنى درجة أهمية"
    />
    <span className="w-6 font-mono text-[11px] font-bold tabular-nums text-[var(--app-text)]">
      {value}
    </span>
  </label>
);

interface FilterBarProps {
  filters: QueueFilters;
  options: QueueFilterOptions;
  onChange: (patch: Partial<QueueFilters>) => void;
}

interface SubgroupProps {
  filters: QueueFilters;
  onChange: (patch: Partial<QueueFilters>) => void;
}

interface SelectsProps extends SubgroupProps {
  options: QueueFilterOptions;
}

/** قوائم العملة والتصعيد والمسؤول — مبنية من بيانات الطابور نفسها. */
const QueueSelects: React.FC<SelectsProps> = ({ filters, options, onChange }) => (
  <>
    <QueueFilterSelect
      label="العملة"
      value={filters.currency}
      allLabel="كل العملات"
      options={options.currencies.map(code => ({ value: code, label: code }))}
      onChange={value => {
        onChange({ currency: value });
      }}
    />
    <QueueFilterSelect
      label="التصعيد"
      value={filters.stage}
      allLabel="كل المراحل"
      options={options.stages.map(stage => ({ value: stage, label: escalationLabel(stage) }))}
      onChange={value => {
        onChange({ stage: value });
      }}
    />
    <QueueFilterSelect
      label="المسؤول"
      value={filters.assignee}
      allLabel="كل المسؤولين"
      options={options.assignees.map(item => ({ value: item.id, label: item.name }))}
      onChange={value => {
        onChange({ assignee: value });
      }}
    />
  </>
);

/** المفاتيح الثنائية: لهاتف / متأخر / منقطع التواصل. */
const QueueFlags: React.FC<SubgroupProps> = ({ filters, onChange }) => (
  <>
    <QueueToggle
      label="لهاتف"
      title="اعرض فقط العملاء الذين يمكن تذكيرهم (لديهم رقم)"
      active={filters.onlyPhone}
      onToggle={() => {
        onChange({ onlyPhone: !filters.onlyPhone });
      }}
    />
    <QueueToggle
      label="متأخر"
      title="اعرض فقط الفواتير التي مضى استحقاقها"
      active={filters.onlyOverdue}
      onToggle={() => {
        onChange({ onlyOverdue: !filters.onlyOverdue });
      }}
    />
    <QueueToggle
      label="منقطع التواصل"
      title="لا تواصل منذ 7 أيام أو لا سجل تواصل"
      active={filters.onlyStaleContact}
      onToggle={() => {
        onChange({ onlyStaleContact: !filters.onlyStaleContact });
      }}
    />
  </>
);

/** شريط الفلترة المتقدمة: بحث + درجة + قوائم + مفاتيح سريعة. */
export const QueueFilterBar: React.FC<FilterBarProps> = ({ filters, options, onChange }) => (
  <div className="flex flex-wrap items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface-hover)] px-3 py-2">
    <div className="w-52 shrink-0">
      <SearchInput
        value={filters.search}
        onChange={value => {
          onChange({ search: value });
        }}
        placeholder="عميل / هاتف / مرجع / سبب..."
        variant="primary"
        size="sm"
        dir="rtl"
        clearable
      />
    </div>
    <QueueScoreRange
      value={filters.minScore}
      onChange={value => {
        onChange({ minScore: value });
      }}
    />
    <QueueSelects filters={filters} options={options} onChange={onChange} />
    <QueueFlags filters={filters} onChange={onChange} />
  </div>
);

/** سطر العروض المحفوظة + مؤشر التصدير (منفصل ليبقى الشريط الرئيسي صغيراً). */
interface PresetsRowProps {
  filters: QueueFilters;
  isExporting: boolean;
  onApply: (view: QueueSavedView) => void;
  onClear: () => void;
}

export const QueuePresetsRow: React.FC<PresetsRowProps> = ({
  filters,
  isExporting,
  onApply,
  onClear,
}) => (
  <div className="flex flex-wrap items-center gap-2 border-b border-[var(--app-border)] px-3 py-1.5">
    <QueuePresetChips filters={filters} onApply={onApply} onClear={onClear} />
    {isExporting ? <Loader2 size={13} className="animate-spin text-emerald-600" /> : null}
  </div>
);

interface BulkBarProps {
  selectedCount: number;
  collectors: DebtCollector[];
  isAssigning: boolean;
  onAssign: (collectorId: string) => void;
  onExport: () => void;
  onClear: () => void;
}

/** شريط الإجراءات الجماعية — يظهر فقط عند تحديد صفوف (كإكسل). */
export const QueueBulkBar: React.FC<BulkBarProps> = ({
  selectedCount,
  collectors,
  isAssigning,
  onAssign,
  onExport,
  onClear,
}) => (
  <div className="flex flex-wrap items-center gap-2 border-b border-blue-500/30 bg-blue-500/10 px-3 py-1.5">
    <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300">
      محدد: <span className="font-mono">{selectedCount}</span> مهمة
    </span>
    <label className="flex items-center gap-1">
      <Users size={12} className="text-blue-600" />
      <select
        className={selectClass}
        defaultValue=""
        disabled={isAssigning || collectors.length === 0}
        onChange={event => {
          if (event.target.value !== '') onAssign(event.target.value);
          event.target.value = '';
        }}
        aria-label="إسناد المحدد إلى محصّل"
      >
        <option value="">إسناد إلى محصّل…</option>
        {collectors.map(collector => (
          <option key={collector.collector_id} value={collector.collector_id}>
            {collector.full_name}
          </option>
        ))}
      </select>
    </label>
    {isAssigning && <Loader2 size={13} className="animate-spin text-blue-600" />}
    <button
      type="button"
      onClick={onExport}
      className={cn(chipBase, 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700')}
      title="تصدير الصفوف المحددة إلى Excel منسّق"
    >
      <Download size={12} /> تصدير المحدد
    </button>
    <button type="button" onClick={onClear} className={cn(chipBase, chipIdle)} title="إلغاء التحديد">
      <X size={12} /> إلغاء
    </button>
  </div>
);

interface StatusBarProps {
  summary: QueueSummary;
  baseCurrency: string;
  totalRows: number;
  selectedCount: number;
}

/** شريط حالة كإكسل: ما تراه الآن، وما مجموعه، وأين يتركّز المال. */
export const QueueStatusBar: React.FC<StatusBarProps> = ({
  summary,
  baseCurrency,
  totalRows,
  selectedCount,
}) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--app-border)] bg-[var(--app-surface-hover)] px-3 py-1.5 text-[11px] font-bold text-[var(--app-text-secondary)]">
    <span>
      المعروض: <span className="font-mono text-[var(--app-text)]">{summary.count}</span> / {totalRows}
    </span>
    <span>
      المحدد: <span className="font-mono text-[var(--app-text)]">{selectedCount}</span>
    </span>
    <span>
      إجمالي ({baseCurrency}):{' '}
      <span className="font-mono text-[var(--app-text)]" dir="ltr">
        {baseTotalLabel(summary, baseCurrency)}
      </span>
    </span>
    <span>
      منها متأخر:{' '}
      <span className="font-mono text-rose-600" dir="ltr">
        {formatCurrency(summary.overdueBaseTotal, baseCurrency)}
      </span>
    </span>
    <span>
      متوسط التأخير: <span className="font-mono text-[var(--app-text)]">{summary.avgDaysLate}</span>{' '}
      يوم
    </span>
    <span>
      منقطع التواصل:{' '}
      <span className="font-mono text-amber-700 dark:text-amber-300">{summary.staleContact}</span>
    </span>
    {summary.currencies > 1 && (
      <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
        {summary.currencies} عملات — الإجمالي محوَّل للعملة الأساس
      </span>
    )}
  </div>
);
