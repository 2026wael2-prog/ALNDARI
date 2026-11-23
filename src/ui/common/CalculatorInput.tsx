import React, { useEffect, useRef, useState } from 'react';
import { Calculator, Delete } from 'lucide-react';
import {
  evaluateMathExpression,
  hasMathOperator,
  sanitizeMathInput,
} from '../../core/utils/mathExpression';
import { cn, formatNumber } from '../../core/utils';

export interface CalculatorInputProps {
  value: number;
  onValueChange: (value: number) => void;
  /** Optional external controlled text (useful when a parent hook owns the raw string state) */
  rawValue?: string | undefined;
  onRawChange?: ((raw: string) => void) | undefined;
  onKeyDown?: ((e: React.KeyboardEvent<HTMLInputElement>) => void) | undefined;
  placeholder?: string | undefined;
  className?: string | undefined;
  wrapperClassName?: string | undefined;
  allowNegative?: boolean | undefined;
  maxDecimals?: number | undefined;
  /** Show a clickable calculator button that opens an inline keypad popover */
  showKeypadToggle?: boolean | undefined;
  /** Compact mode for dense invoice table cells (floating preview badge above cell) */
  compact?: boolean | undefined;
  disabled?: boolean | undefined;
  title?: string | undefined;
  'data-row-index'?: number | undefined;
  'data-col-field'?: string | undefined;
  'aria-label'?: string | undefined;
}

const KEYPAD_BUTTONS: Array<{ label: string; token: string; tone?: 'op' | 'action' | 'eq' }> = [
  { label: '7', token: '7' },
  { label: '8', token: '8' },
  { label: '9', token: '9' },
  { label: '÷', token: '/', tone: 'op' },
  { label: '4', token: '4' },
  { label: '5', token: '5' },
  { label: '6', token: '6' },
  { label: '×', token: '*', tone: 'op' },
  { label: '1', token: '1' },
  { label: '2', token: '2' },
  { label: '3', token: '3' },
  { label: '-', token: '-', tone: 'op' },
  { label: '0', token: '0' },
  { label: '.', token: '.' },
  { label: 'C', token: 'CLEAR', tone: 'action' },
  { label: '+', token: '+', tone: 'op' },
];

/**
 * Smart numeric input with built-in inline calculator support (+, -, *, /, %, ()).
 * Users can type expressions like "500*3", "1200+350", "43000/430" directly;
 * pressing Enter, '=', Tab, or blurring evaluates the expression into the final number.
 */
// eslint-disable-next-line max-lines-per-function, complexity -- cohesive interactive calculator input + optional popover keypad.
export const CalculatorInput: React.FC<CalculatorInputProps> = ({
  value,
  onValueChange,
  rawValue,
  onRawChange,
  onKeyDown,
  placeholder = '0.00',
  className = '',
  wrapperClassName = '',
  allowNegative = false,
  maxDecimals = 4,
  showKeypadToggle = false,
  compact = false,
  disabled = false,
  title,
  'data-row-index': dataRowIndex,
  'data-col-field': dataColField,
  'aria-label': ariaLabel,
}) => {
  const isControlledRaw = rawValue !== undefined && onRawChange !== undefined;
  const [internalText, setInternalText] = useState<string>(
    value !== 0 && Number.isFinite(value) ? String(value) : ''
  );
  const [isFocused, setIsFocused] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const text = isControlledRaw ? rawValue : internalText;
  const setText = (next: string) => {
    if (isControlledRaw) {
      onRawChange(next);
    } else {
      setInternalText(next);
    }
  };

  // Sync external numeric value changes when the user is NOT actively typing a math expression
  useEffect(() => {
    if (isControlledRaw) return;
    if (hasMathOperator(internalText)) return;
    const currentNum = evaluateMathExpression(internalText, { allowNegative, maxDecimals }) ?? 0;
    if (Math.abs(currentNum - (value || 0)) > 1e-6) {
      setInternalText(value !== 0 && Number.isFinite(value) ? String(value) : '');
    }
  }, [value, isControlledRaw, allowNegative, maxDecimals]);

  // Close keypad when clicking outside
  useEffect(() => {
    if (!showKeypad) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowKeypad(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [showKeypad]);

  const isExpression = hasMathOperator(text);
  const evaluated = isExpression
    ? evaluateMathExpression(text, { allowNegative, maxDecimals })
    : null;

  const commitExpression = (currentText: string): boolean => {
    if (!hasMathOperator(currentText)) return false;
    const result = evaluateMathExpression(currentText, { allowNegative, maxDecimals });
    if (result === null) return false;
    const formatted = result === 0 ? '' : String(result);
    setText(formatted);
    onValueChange(result);
    return true;
  };

  const applyRawText = (raw: string) => {
    const sanitized = sanitizeMathInput(raw);

    // If user typed trailing "=" after an expression, evaluate immediately!
    if (sanitized.endsWith('=') && sanitized.length > 1) {
      const exprBody = sanitized.slice(0, -1);
      const res = evaluateMathExpression(exprBody, { allowNegative, maxDecimals });
      if (res !== null) {
        setText(res === 0 ? '' : String(res));
        onValueChange(res);
        return;
      }
    }

    setText(sanitized);

    if (sanitized.trim() === '') {
      onValueChange(0);
      return;
    }

    const res = evaluateMathExpression(sanitized, { allowNegative, maxDecimals });
    if (res !== null) {
      onValueChange(res);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyRawText(e.target.value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isExpression) {
      e.preventDefault();
      e.stopPropagation();
      commitExpression(text);
      return;
    }
    if (e.key === 'Escape' && showKeypad) {
      e.preventDefault();
      setShowKeypad(false);
      return;
    }
    onKeyDown?.(e);
  };

  const handleInputBlur = () => {
    setIsFocused(false);
    commitExpression(text);
  };

  const handleKeypadPress = (token: string) => {
    if (token === 'CLEAR') {
      setText('');
      onValueChange(0);
      inputRef.current?.focus();
      return;
    }
    if (token === 'BACKSPACE') {
      applyRawText(text.slice(0, -1));
      inputRef.current?.focus();
      return;
    }
    if (token === '=') {
      commitExpression(text);
      setShowKeypad(false);
      inputRef.current?.focus();
      return;
    }
    applyRawText(`${text}${token}`);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', wrapperClassName)}>
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        value={text}
        disabled={disabled}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        dir="ltr"
        title={
          title ??
          'يدعم العمليات الحسابية مباشرة (+ ، - ، * ، /) — اضغط Enter أو = للحساب الفوري'
        }
        data-row-index={dataRowIndex}
        data-col-field={dataColField}
        aria-label={ariaLabel}
        className={cn(className, showKeypadToggle && 'pl-10')}
      />

      {/* Optional clickable mini-calculator button */}
      {showKeypadToggle && !disabled && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setShowKeypad(prev => !prev);
            inputRef.current?.focus();
          }}
          title="فتح الآلة الحاسبة السريعة (+ - × ÷)"
          aria-label="فتح الآلة الحاسبة"
          className={cn(
            'absolute left-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 transition-all',
            showKeypad || isExpression
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400'
          )}
        >
          <Calculator size={compact ? 14 : 18} />
        </button>
      )}

      {/* Live expression evaluation preview badge */}
      {isExpression && (isFocused || showKeypad) && (
        <div
          data-testid="calc-live-preview"
          className={cn(
            'pointer-events-none absolute z-40 flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 py-0.5 font-mono text-[11px] font-black shadow-lg',
            compact ? '-top-7 left-1/2 -translate-x-1/2' : '-top-7 left-2',
            evaluated !== null
              ? 'border-blue-200 bg-blue-600 text-white dark:border-blue-700'
              : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
          )}
          dir="ltr"
        >
          <Calculator size={11} />
          {evaluated !== null ? (
            <span>= {formatNumber(evaluated)}</span>
          ) : (
            <span dir="rtl">أكمل العملية...</span>
          )}
        </div>
      )}

      {/* Compact inline calculator keypad popover */}
      {showKeypad && (
        <div
          data-testid="calc-keypad-popover"
          className="animate-in fade-in zoom-in-95 absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          dir="ltr"
        >
          <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
            <span className="font-mono text-[11px] font-black text-blue-600 dark:text-blue-400">
              {evaluated !== null ? `= ${formatNumber(evaluated)}` : text || '0'}
            </span>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => handleKeypadPress('BACKSPACE')}
              aria-label="حذف رقم"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
            >
              <Delete size={14} />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {KEYPAD_BUTTONS.map(btn => (
              <button
                key={btn.label}
                type="button"
                tabIndex={-1}
                onClick={() => handleKeypadPress(btn.token)}
                className={cn(
                  'h-9 rounded-xl font-mono text-sm font-black transition-all active:scale-95',
                  btn.tone === 'op'
                    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300'
                    : btn.tone === 'action'
                      ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/40 dark:text-rose-300'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
                )}
              >
                {btn.label}
              </button>
            ))}
            <button
              type="button"
              tabIndex={-1}
              onClick={() => handleKeypadPress('(')}
              className="h-8 rounded-xl bg-slate-100 font-mono text-xs font-black text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            >
              (
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => handleKeypadPress(')')}
              className="h-8 rounded-xl bg-slate-100 font-mono text-xs font-black text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            >
              )
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => handleKeypadPress('=')}
              className="col-span-2 h-8 rounded-xl bg-blue-600 font-mono text-sm font-black text-white shadow-sm hover:bg-blue-700 active:scale-95"
            >
              = تطبيق
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalculatorInput;
