import React from 'react';
import { Banknote, Calculator, Hash, RotateCcw } from 'lucide-react';
import { cn } from '../../../../core/utils';

const ModeButton: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ active, icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
      active
        ? 'bg-[var(--app-surface)] font-bold text-emerald-600 shadow-sm dark:text-emerald-400'
        : 'font-semibold text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
    )}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const CountModeSwitch: React.FC<{
  countMode: 'denominations' | 'quick';
  disabled: boolean;
  onCountModeChange: (mode: 'denominations' | 'quick') => void;
  onReset: () => void;
}> = ({ countMode, disabled, onCountModeChange, onReset }) => (
  <div className="flex items-center gap-2">
    <div
      className="flex rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-0.5 text-xs"
      role="group"
      aria-label="طريقة الجرد"
    >
      <ModeButton
        active={countMode === 'quick'}
        icon={<Hash className="h-3.5 w-3.5" />}
        label="إجمالي سريع"
        onClick={() => {
          onCountModeChange('quick');
        }}
      />
      <ModeButton
        active={countMode === 'denominations'}
        icon={<Calculator className="h-3.5 w-3.5" />}
        label="تفقيط الفئات"
        onClick={() => {
          onCountModeChange('denominations');
        }}
      />
    </div>

    {!disabled && countMode === 'denominations' && (
      <button
        type="button"
        onClick={onReset}
        title="تصفير الجرد"
        aria-label="تصفير الجرد"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-red-500"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    )}
  </div>
);

export const CashCountBoardHeader: React.FC<{
  countMode: 'denominations' | 'quick';
  disabled: boolean;
  onCountModeChange: (mode: 'denominations' | 'quick') => void;
  onReset: () => void;
}> = ({ countMode, disabled, onCountModeChange, onReset }) => (
  <div className="mb-3 flex flex-col gap-2 border-b border-[var(--app-border)] pb-2.5 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Banknote className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-[var(--app-text)]">جرد الكاش بالدرج</h3>
        <p className="text-xs text-[var(--app-text-secondary)]">
          عُدّ كل عملة بفئاتها، والنظام يجمعها بعملة الأساس بسعر ظاهر
        </p>
      </div>
    </div>

    <div className="flex items-center gap-2">
      <CountModeSwitch
        countMode={countMode}
        disabled={disabled}
        onCountModeChange={onCountModeChange}
        onReset={onReset}
      />
    </div>
  </div>
);
