import React from 'react';
import { Coins } from 'lucide-react';
import { cn } from '@/core/utils';

export interface ExchangeRateBlockProps {
  exchangeRate: number;
  isDivide: boolean;
  currency: string;
  onChange: (value: number) => void;
}

export const ExchangeRateBlock: React.FC<ExchangeRateBlockProps> = ({
  exchangeRate,
  isDivide,
  currency,
  onChange,
}) => {
  const isBase = currency === 'SAR';
  return (
    <div className="relative flex min-w-0 flex-1 flex-col justify-center bg-[var(--app-surface)] p-1.5">
      <div className="mb-0.5 flex items-center gap-1">
        <Coins
          size={10}
          className={isBase ? 'text-slate-400 dark:text-slate-500' : 'text-amber-500'}
        />
        <span
          className={cn(
            'truncate text-[10px] font-bold uppercase leading-none tracking-wider',
            isBase ? 'text-slate-400 dark:text-slate-500' : 'text-amber-500'
          )}
        >
          الصرف {isBase ? '(أساسي)' : isDivide ? '(÷)' : '(×)'}
        </span>
      </div>
      <input
        type="number"
        step="0.00001"
        disabled={isBase}
        value={
          isBase
            ? '1'
            : exchangeRate
              ? isDivide && exchangeRate < 1
                ? Math.round(1 / exchangeRate)
                : exchangeRate
              : '1'
        }
        onChange={event => {
          if (isBase) return;
          const value = parseFloat(event.target.value);
          if (value) onChange(value);
        }}
        className={cn(
          'min-h-4 w-full bg-transparent font-mono text-[11px] font-bold leading-none outline-none max-md:text-[10px]',
          isBase
            ? 'cursor-not-allowed text-slate-400 dark:text-slate-500'
            : 'text-amber-600 dark:text-amber-400'
        )}
      />
    </div>
  );
};
