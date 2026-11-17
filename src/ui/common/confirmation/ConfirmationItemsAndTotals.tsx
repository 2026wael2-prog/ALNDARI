import React from 'react';
import { Package } from 'lucide-react';
import { formatCurrency, formatNumberDisplay } from '../../../core/utils';

export interface ConfirmationItem {
  name: string;
  sku?: string | undefined;
  partNumber?: string | undefined;
  brand?: string | undefined;
  quantity: number;
  price: number;
  discount?: number | undefined;
  total: number;
}

export interface ConfirmationItemsAndTotalsProps {
  items: ConfirmationItem[];
  totalPieces: number;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  baseTotal: number;
  isForeign: boolean;
  isSale: boolean;
  isCredit: boolean;
  paidAmount: number;
  remainingCredit: number;
  notes?: string | undefined;
}

export const ConfirmationItemsAndTotals: React.FC<ConfirmationItemsAndTotalsProps> = ({
  items,
  totalPieces,
  currency,
  subtotal,
  discount,
  tax,
  total,
  baseTotal,
  isForeign,
  isSale,
  isCredit,
  paidAmount,
  remainingCredit,
  notes,
}) => (
  <>
    {/* جدول الأصناف والقطع */}
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Package size={14} className="text-slate-500" />
          <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">
            تفاصيل القطع والبنود
          </h4>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
          <span>
            عدد الأصناف:{' '}
            <strong className="font-mono text-slate-800 dark:text-slate-200">{items.length}</strong>
          </span>
          <span>•</span>
          <span>
            إجمالي القطع:{' '}
            <strong className="font-mono text-slate-800 dark:text-slate-200">
              {formatNumberDisplay(totalPieces)}
            </strong>
          </span>
        </div>
      </div>

      <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-900/40">
        <table className="w-full text-right text-xs">
          <thead className="backdrop-blur-xs sticky top-0 z-10 border-b border-slate-200 bg-slate-100/90 text-[10px] font-black uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800/90 dark:text-slate-400">
            <tr>
              <th className="w-8 p-2 text-center">#</th>
              <th className="p-2">الصنف / الوصف</th>
              <th className="w-16 p-2 text-center">الكمية</th>
              <th className="w-24 p-2 text-left">السعر</th>
              <th className="w-28 p-2 text-left">الإجمالي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60 font-medium dark:divide-slate-800/60">
            {items.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/30">
                <td className="p-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                <td className="p-2">
                  <div className="max-w-xs truncate font-bold text-slate-800 dark:text-slate-200">
                    {item.name}
                  </div>
                  {(item.partNumber || item.sku) && (
                    <span className="font-mono text-[10px] text-slate-400">
                      {item.partNumber || item.sku}
                    </span>
                  )}
                </td>
                <td className="p-2 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                  {item.quantity}
                </td>
                <td className="p-2 text-left font-mono font-semibold text-slate-600 dark:text-slate-400">
                  {formatCurrency(item.price, currency)}
                </td>
                <td className="p-2 text-left font-mono font-bold text-slate-900 dark:text-slate-100">
                  {formatCurrency(item.total, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* ملخص المبالغ والضرائب والخصومات */}
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between text-slate-600 dark:text-slate-400">
          <span>المجموع الفرعي:</span>
          <span className="font-mono font-bold">{formatCurrency(subtotal, currency)}</span>
        </div>

        {discount > 0 && (
          <div className="flex justify-between text-rose-600 dark:text-rose-400">
            <span>الخصم الممنوح:</span>
            <span className="font-mono font-bold">-{formatCurrency(discount, currency)}</span>
          </div>
        )}

        {tax > 0 && (
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>ضريبة القيمة المضافة:</span>
            <span className="font-mono font-bold">+{formatCurrency(tax, currency)}</span>
          </div>
        )}

        <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-black text-slate-900 dark:text-white">
              المبلغ الإجمالي المطلوب:
            </span>
            <div className="flex flex-col items-end">
              <span
                className={`font-mono text-lg font-black ${
                  isSale
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-blue-600 dark:text-blue-400'
                }`}
              >
                {formatCurrency(total, currency)}
              </span>
              {isForeign && (
                <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                  ≈ {formatCurrency(baseTotal, 'SAR')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* إذا كان آجل ومعه دفعة مقدمة */}
        {isCredit && (
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-dashed border-slate-200 pt-2 dark:border-slate-700">
            <div className="rounded-lg bg-emerald-50/60 p-2 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              <div className="text-[10px] font-bold">المدفوع مقدماً:</div>
              <div className="font-mono font-black">{formatCurrency(paidAmount, currency)}</div>
            </div>
            <div className="rounded-lg bg-amber-50/60 p-2 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <div className="text-[10px] font-bold">المتبقي الآجل:</div>
              <div className="font-mono font-black">
                {formatCurrency(remainingCredit, currency)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* ملاحظات الفاتورة إن وُجدت */}
    {notes?.trim() && (
      <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
        <span className="font-bold text-slate-800 dark:text-slate-200">ملاحظات: </span>
        <span>{notes.trim()}</span>
      </div>
    )}
  </>
);
