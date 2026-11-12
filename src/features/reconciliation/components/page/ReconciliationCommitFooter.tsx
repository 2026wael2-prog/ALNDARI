import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn, formatCurrency } from '../../../../core/utils';
import Button from '../../../../ui/base/Button';
import Card from '../../../../ui/base/Card';
import type { ReconciliationPageController } from '../../pages/useReconciliationPageController';
import {
  resolveCommitBorder,
  resolveCommitIconTone,
  resolveVarianceHeadline,
} from './ReconciliationSummaryStats';

/** تنبيهات الحالة داخل شريط الاعتماد */
export const CommitAlerts: React.FC<{ view: ReconciliationPageController['view'] }> = ({ view }) => (
  <>
    {view.netIsNegative && (
      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        الصافي سالب: الفكة المستبقاة أكبر من الكاش المعدود
      </p>
    )}
    {view.missingRateCurrencies.length > 0 && (
      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        لا سعر صرف لـ {view.missingRateCurrencies.join('، ')}
      </p>
    )}
  </>
);

/** كتلة حالة الدرج داخل شريط الاعتماد */
export const CommitStatus: React.FC<{ view: ReconciliationPageController['view'] }> = ({ view }) => {
  const { cashVarianceInfo } = view;
  const status = cashVarianceInfo.status;

  return (
    <div className="flex items-start gap-2.5">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          resolveCommitIconTone(status)
        )}
      >
        {status === 'balanced' ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <AlertTriangle className="h-5 w-5" />
        )}
      </div>
      <div>
        <h4 className="text-sm font-bold text-[var(--app-text)]">
          {resolveVarianceHeadline(status, cashVarianceInfo.variance, view.currency)}
        </h4>
        <p className="text-xs text-[var(--app-text-secondary)]">
          المتوقع{' '}
          <strong className="text-[var(--app-text)]">
            {formatCurrency(view.expectedCash, view.currency)}
          </strong>
          {' · '}الفعلي{' '}
          <strong className="text-[var(--app-text)]">
            {formatCurrency(view.actualCashCounted, view.currency)}
          </strong>
          {' · '}الصافي{' '}
          <strong
            className={cn(
              view.netIsNegative
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {formatCurrency(view.cashToOwner, view.currency)}
          </strong>
        </p>
        <CommitAlerts view={view} />
      </div>
    </div>
  );
};

/** زر الاعتماد أو شارة اليومية المقفلة */
export const CommitAction: React.FC<{ page: ReconciliationPageController }> = ({ page }) => {
  const { view } = page;

  if (!view.isAlreadyClosed) {
    return (
      <Button
        type="button"
        variant="success"
        onClick={page.handleCommit}
        isLoading={page.isCommitting}
        disabled={view.isLocked}
        className="h-10 gap-1.5 px-5 text-xs font-bold"
      >
        اعتماد وإقفال يومية المحل
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
        ✓ تم إقفال هذا اليوم
      </span>
      {view.isOwner && (
        <Button
          type="button"
          variant="secondary"
          onClick={page.handleCommit}
          disabled={page.isCommitting}
          className="text-xs font-bold"
        >
          {page.isCommitting ? 'جاري التحديث...' : 'تحديث الاعتماد (المالك)'}
        </Button>
      )}
    </div>
  );
};

/** حقل ملاحظات اليومية */
export const NotesField: React.FC<{ notes: string; isLocked: boolean; onChange: (value: string) => void }> =
  ({ notes, isLocked, onChange }) => (
    <div>
      <label
        htmlFor="reconciliation-notes"
        className="mb-1 block text-xs font-semibold text-[var(--app-text-secondary)]"
      >
        ملاحظات اليومية (اختياري):
      </label>
      <input
        id="reconciliation-notes"
        type="text"
        disabled={isLocked}
        value={notes}
        onChange={event => {
          onChange(event.target.value);
        }}
        placeholder="ملاحظة تُحفظ مع اليومية"
        className="h-9 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-xs text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
      />
    </div>
  );

/** حقل مبرر الفارق — يظهر فقط خارج حد التسامح */
export const VarianceReasonField: React.FC<{
  isLocked: boolean;
  value: string;
  onChange: (value: string) => void;
}> = ({ isLocked, value, onChange }) => (
  <div>
    <label
      htmlFor="reconciliation-variance-reason"
      className="mb-1 block text-xs font-bold text-[var(--app-text)]"
    >
      مبرر الفارق (إلزامي خارج حد التسامح):
    </label>
    <input
      id="reconciliation-variance-reason"
      type="text"
      disabled={isLocked}
      value={value}
      onChange={event => {
        onChange(event.target.value);
      }}
      placeholder="مثال: فرق فكة زبون أو فاتورة لم تُسجَّل"
      className="h-9 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-xs text-[var(--app-text)] focus:border-red-500 focus:outline-none"
    />
  </div>
);

/** حقول المبرر والملاحظات — تظهر فقط قبل الإقفال */
export const VarianceFields: React.FC<{
  needsReason: boolean;
  isLocked: boolean;
  varianceReason: string;
  onVarianceReasonChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
}> = ({ needsReason, isLocked, varianceReason, onVarianceReasonChange, notes, onNotesChange }) => (
  <div className="mt-2.5 grid grid-cols-1 gap-2 border-t border-[var(--app-border)] pt-2.5 sm:grid-cols-2">
    {needsReason && (
      <VarianceReasonField
        isLocked={isLocked}
        value={varianceReason}
        onChange={onVarianceReasonChange}
      />
    )}
    <NotesField notes={notes} isLocked={isLocked} onChange={onNotesChange} />
  </div>
);

/** شريط الاعتماد النهائي — ثابت أسفل الشاشة */
export const CommitFooter: React.FC<{ page: ReconciliationPageController }> = ({ page }) => {
  const { view, form } = page;
  const { cashVarianceInfo } = view;
  const needsReason =
    !cashVarianceInfo.isWithinTolerance ||
    (view.cardVariance !== null && Math.abs(view.cardVariance) > view.tolerance);

  return (
    <div className="sticky bottom-2 z-20">
      <Card className={cn('border p-3 shadow-md', resolveCommitBorder(cashVarianceInfo.status))}>
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <CommitStatus view={view} />
          <CommitAction page={page} />
        </div>

        {!view.isAlreadyClosed && (
          <VarianceFields
            needsReason={needsReason}
            isLocked={view.isLocked}
            varianceReason={form.values.varianceReason}
            onVarianceReasonChange={form.setVarianceReason}
            notes={form.values.notes}
            onNotesChange={form.setNotes}
          />
        )}
      </Card>
    </div>
  );
};

