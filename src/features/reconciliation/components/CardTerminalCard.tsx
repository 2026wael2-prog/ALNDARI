import React from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, Equal } from 'lucide-react';
import Card from '../../../ui/base/Card';
import NumericInput from '../../../ui/base/NumericInput';
import { cn, formatCurrency } from '../../../core/utils';

interface CardTerminalCardProps {
  expectedCard: number;
  actualCard: number;
  /** هل أدخل المستخدم تقرير الماكينة فعلاً؟ (لا مطابقة قبل ذلك) */
  isEntered: boolean;
  onActualCardChange: (value: number) => void;
  /** زر صريح لاستخدام قيمة النظام (فعل واعٍ لا تعبئة صامتة) */
  onUseExpected: () => void;
  terminalRef: string;
  onTerminalRefChange: (value: string) => void;
  currency: string;
  disabled?: boolean | undefined;
}

/** شارة حالة المطابقة — لا تُعرض قبل إدخال تقرير الماكينة */
const VarianceBadge: React.FC<{ variance: number | null; currency: string }> = ({
  variance,
  currency,
}) => {
  if (variance === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        لم يُدخل تقرير الماكينة بعد
      </span>
    );
  }

  if (variance === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        مطابق 100%
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold',
        variance > 0
          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'bg-red-500/10 text-red-600 dark:text-red-400'
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      فارق {variance > 0 ? '+' : ''}
      {formatCurrency(variance, currency)}
    </span>
  );
};

/** رأس بطاقة الشبكة: العنوان + المتوقع من النظام */
const TerminalHeader: React.FC<{ expectedCard: number; currency: string }> = ({
  expectedCard,
  currency,
}) => (
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] pb-2.5">
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
        <CreditCard className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-[var(--app-text)]">مطابقة ماكينة الشبكة</h3>
        <p className="text-xs text-[var(--app-text-secondary)]">
          أدخل إجمالي تقرير الموازنة (Z-Report) كما هو في الجهاز
        </p>
      </div>
    </div>
    <div className="text-left">
      <span className="text-[11px] text-[var(--app-text-secondary)]">المتوقع بالنظام:</span>
      <div className="font-mono text-sm font-black text-blue-600 dark:text-blue-400">
        {formatCurrency(expectedCard, currency)}
      </div>
    </div>
  </div>
);

interface TerminalInputsProps {
  expectedCard: number;
  actualCard: number;
  onActualCardChange: (value: number) => void;
  onUseExpected: () => void;
  terminalRef: string;
  onTerminalRefChange: (value: string) => void;
  currency: string;
  disabled: boolean;
}

/** حقل مرجع تقرير الماكينة */
const TerminalRefInput: React.FC<{
  terminalRef: string;
  onTerminalRefChange: (value: string) => void;
  disabled: boolean;
}> = ({ terminalRef, onTerminalRefChange, disabled }) => (
  <div>
    <label
      htmlFor="reconciliation-card-ref"
      className="mb-1 block text-xs font-semibold text-[var(--app-text-secondary)]"
    >
      رقم الإيصال / مرجع التقرير (اختياري):
    </label>
    <input
      id="reconciliation-card-ref"
      type="text"
      disabled={disabled}
      value={terminalRef}
      onChange={event => {
        onTerminalRefChange(event.target.value);
      }}
      placeholder="مثال: BATCH-4921 أو Z-104"
      className="h-[42px] w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-xs text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
    />
  </div>
);

/** حقول الإدخال: تقرير الماكينة ومرجع التقرير */
const TerminalInputs: React.FC<TerminalInputsProps> = ({
  expectedCard,
  actualCard,
  onActualCardChange,
  onUseExpected,
  terminalRef,
  onTerminalRefChange,
  currency,
  disabled,
}) => (
  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
    <div>
      <label
        htmlFor="reconciliation-card-actual"
        className="mb-1 block text-xs font-bold text-[var(--app-text)]"
      >
        إجمالي تقرير الماكينة:
      </label>
      <NumericInput
        value={actualCard}
        min={0}
        step={1}
        disabled={disabled}
        onChange={onActualCardChange}
        className="w-full"
      />
      {!disabled && (
        <button
          type="button"
          onClick={onUseExpected}
          className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-[var(--app-border)] px-2 py-1 text-[11px] font-bold text-[var(--app-text-secondary)] transition-colors hover:border-blue-500/40 hover:text-blue-600"
        >
          <Equal className="h-3.5 w-3.5" />
          استخدام قيمة النظام ({formatCurrency(expectedCard, currency)})
        </button>
      )}
    </div>

    <TerminalRefInput
      terminalRef={terminalRef}
      onTerminalRefChange={onTerminalRefChange}
      disabled={disabled}
    />
  </div>
);

/**
 * بطاقة مطابقة ماكينة الشبكة.
 * إصلاح جوهري: كان الحقل يُملأ تلقائياً بقيمة «المتوقع» فتظهر مطابقة 100% وهمية
 * وتُحفظ `card_variance = 0` قبل قراءة تقرير Z. الآن لا نتيجة قبل إدخال صريح.
 */
export const CardTerminalCard: React.FC<CardTerminalCardProps> = ({
  expectedCard,
  actualCard,
  isEntered,
  onActualCardChange,
  onUseExpected,
  terminalRef,
  onTerminalRefChange,
  currency,
  disabled = false,
}) => {
  const variance = isEntered ? Math.round((actualCard - expectedCard) * 100) / 100 : null;

  return (
    <Card className="p-3 sm:p-4">
      <TerminalHeader expectedCard={expectedCard} currency={currency} />

      <TerminalInputs
        expectedCard={expectedCard}
        actualCard={actualCard}
        onActualCardChange={onActualCardChange}
        onUseExpected={onUseExpected}
        terminalRef={terminalRef}
        onTerminalRefChange={onTerminalRefChange}
        currency={currency}
        disabled={disabled}
      />

      <div className="mt-2.5 flex items-center justify-between rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-2">
        <span className="text-xs font-semibold text-[var(--app-text-secondary)]">
          حالة مطابقة الشبكة:
        </span>
        <VarianceBadge variance={variance} currency={currency} />
      </div>
    </Card>
  );
};
