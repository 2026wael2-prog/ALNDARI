/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
import React, { useState } from 'react';
import {
  TrendingUp,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { formatCurrency, cn } from '../../../../core/utils';
import { convertCurrency } from '../../../../core/utils/currencyUtils';
import type { SalesCartItem } from '../../store';

interface Props {
  items: SalesCartItem[];
  currency: string;
  exchangeRate: number;
  exchangeOperator?: 'multiply' | 'divide';
  totalAmount: number;
}

export const InvoiceProfitMarginCard: React.FC<Props> = ({
  items,
  currency,
  exchangeRate,
  exchangeOperator,
  totalAmount,
}) => {
  // Privacy toggle (كتم أرقام الربح عند تواجد العميل أمام الشاشة)
  const [showProfit, setShowProfit] = useState(true);

  // Filter valid items
  const validItems = items.filter(it => Boolean(it.productId) && Number(it.quantity) > 0);
  if (validItems.length === 0) return null;

  // Calculate total cost in the invoice's active currency
  const totalCost = validItems.reduce((sum, it) => {
    const qty = Number(it.quantity) || 0;
    const baseCost = Number(it.costPrice) || 0;
    if (baseCost <= 0) return sum;

    let convertedUnitCost = baseCost;
    if (currency !== 'SAR') {
      try {
        convertedUnitCost = convertCurrency(
          baseCost,
          exchangeRate || 410,
          'fromBase',
          exchangeOperator
        );
      } catch {
        convertedUnitCost = baseCost;
      }
    }
    return sum + qty * convertedUnitCost;
  }, 0);

  const estimatedProfit = Math.round((totalAmount - totalCost) * 100) / 100;
  const profitMarginPercent =
    totalAmount > 0
      ? Math.round(((estimatedProfit / totalAmount) * 100) * 10) / 10
      : 0;

  // Maximum safe discount without selling below cost:
  const maxSafeDiscount = Math.max(0, estimatedProfit);

  const isProfitable = estimatedProfit > 0;
  const isLoss = estimatedProfit < 0;
  const isBreakEven = estimatedProfit === 0;

  return (
    <div
      className={cn(
        'rounded-xl border p-2.5 shadow-xs transition-all',
        isLoss
          ? 'border-rose-300/80 bg-rose-50/60 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200'
          : isBreakEven
            ? 'border-amber-300/80 bg-amber-50/60 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200'
            : 'border-emerald-200/80 bg-emerald-50/50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200'
      )}
    >
      {/* Header with Title & Privacy Toggle */}
      <div className="flex items-center justify-between border-b border-black/5 pb-1.5 dark:border-white/5">
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-md text-white shadow-xs',
              isLoss ? 'bg-rose-600' : isBreakEven ? 'bg-amber-600' : 'bg-emerald-600'
            )}
          >
            <TrendingUp size={12} />
          </div>
          <span className="text-[11px] font-black">
            تحليل الربحية وهامش الخصم المتاح
          </span>
          <span className="rounded bg-black/5 dark:bg-white/5 px-1.5 py-0.2 text-[10px] font-bold text-slate-500">
            داخلي للبائع
          </span>
        </div>

        {/* Toggle hide/show */}
        <button
          type="button"
          onClick={() => setShowProfit(p => !p)}
          title={showProfit ? 'إخفاء الأرقام لخصوصية البيع' : 'إظهار الأرقام'}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/5 transition-colors"
        >
          {showProfit ? <EyeOff size={12} /> : <Eye size={12} />}
          <span>{showProfit ? 'إخفاء' : 'إظهار'}</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* Estimated Profit */}
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
            إجمالي ربح الفاتورة:
          </span>
          <div className="flex items-baseline gap-1">
            <span
              dir="ltr"
              className={cn(
                'font-mono text-xs sm:text-sm font-black',
                isLoss
                  ? 'text-rose-700 dark:text-rose-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              )}
            >
              {showProfit
                ? `${isProfitable ? '+' : ''}${formatCurrency(estimatedProfit, currency)}`
                : '••••••'}
            </span>
            {showProfit && (
              <span className="font-mono text-[10px] font-bold text-slate-500">
                ({profitMarginPercent}%)
              </span>
            )}
          </div>
        </div>

        {/* Safe Discount Allowance (مجال الخصم للعميل) */}
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
            أقصى خصم مقترح للعميل:
          </span>
          <div className="flex items-baseline gap-1">
            <span
              dir="ltr"
              className="font-mono text-xs sm:text-sm font-black text-indigo-700 dark:text-indigo-400"
            >
              {showProfit ? formatCurrency(maxSafeDiscount, currency) : '••••••'}
            </span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
              (دون خسارة)
            </span>
          </div>
        </div>

        {/* Decision Badge */}
        <div className="flex items-center sm:justify-end">
          {isLoss ? (
            <span className="flex items-center gap-1 rounded-md border border-rose-400/80 bg-rose-100/90 px-2 py-1 text-[10px] font-black text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
              <AlertTriangle size={11} className="text-rose-600" />
              تنبيه: بيع بأقل من التكلفة
            </span>
          ) : isBreakEven ? (
            <span className="flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              سعر البيع = التكلفة
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-100/80 px-2 py-1 text-[10px] font-black text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 size={11} className="text-emerald-600" />
              متاح التفاوض ومنح خصم
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
