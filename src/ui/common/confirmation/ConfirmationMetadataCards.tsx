import React from 'react';
import {
  CreditCard,
  Banknote,
  Coins,
  Wallet,
  User,
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
} from 'lucide-react';
import { formatCurrency } from '../../../core/utils';

export interface ConfirmationMetadataCardsProps {
  isSale: boolean;
  isCredit: boolean;
  isForeign: boolean;
  hasPartialPayment: boolean;
  partyName: string;
  currency: string;
  effectiveOperator: 'multiply' | 'divide';
  effectiveRate: number;
  cashboxName?: string | undefined;
  warehouseName?: string | undefined;
  total: number;
  paidAmount: number;
  remainingCredit: number;
  onSwitchToYER?: (() => void) | undefined;
}

export const ConfirmationMetadataCards: React.FC<ConfirmationMetadataCardsProps> = ({
  isSale,
  isCredit,
  isForeign,
  hasPartialPayment,
  partyName,
  currency,
  effectiveOperator,
  effectiveRate,
  cashboxName,
  warehouseName,
  total,
  paidAmount,
  remainingCredit,
  onSwitchToYER,
}) => (
  <>
    {/* Smart Currency Guard Alert */}
    {currency === 'SAR' && total >= 5000 && onSwitchToYER && (
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border-2 border-rose-500/80 bg-rose-50/90 p-3 text-rose-950 dark:border-rose-600/80 dark:bg-rose-950/40 dark:text-rose-100 shadow-sm">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          <div>
            <p className="text-xs font-black">
              تنبيه تدقيق: الفاتورة ستُرحل بالريال السعودي (SAR) بإجمالي {formatCurrency(total, 'SAR')}!
            </p>
            <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-300">
              إذا كانت هذه المبالغ بالريال اليمني (YER)، اضغط هنا للتحويل الفوري قبل الاعتماد لمنع تسجيلها كـريال سعودي.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSwitchToYER}
          className="flex items-center gap-1.5 shrink-0 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-xs px-3 py-1.5 shadow-md transition cursor-pointer"
        >
          <ArrowRightLeft size={13} />
          تحويل إلى ريال يمني (YER)
        </button>
      </div>
    )}

    {/* بطاقات البيانات الأساسية */}
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
        <div className="mb-1 flex items-center gap-1.5 text-slate-400">
          <User size={12} className="text-blue-500" />
          <span className="text-[10px] font-bold">{isSale ? 'العميل' : 'المورد'}</span>
        </div>
        <p className="truncate text-xs font-black text-slate-800 dark:text-slate-100">
          {partyName || (isSale ? 'عميل نقدي' : 'مورد عام')}
        </p>
      </div>
      <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
        <div className="mb-1 flex items-center gap-1.5 text-slate-400">
          {isCredit ? (
            <CreditCard size={12} className="text-amber-500" />
          ) : (
            <Banknote size={12} className="text-emerald-500" />
          )}
          <span className="text-[10px] font-bold">نوع السداد</span>
        </div>
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-black ${
            isCredit
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          }`}
        >
          {isCredit ? 'آجل (ذمم)' : 'نقداً'}
        </span>
      </div>
      <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
        <div className="mb-1 flex items-center gap-1.5 text-slate-400">
          <Coins size={12} className="text-indigo-500" />
          <span className="text-[10px] font-bold">العملة والصرف</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400">
            {currency}
          </span>
          {isForeign && (
            <span className="font-mono text-[10px] font-bold text-slate-500">
              ({effectiveOperator === 'divide' ? '÷' : '×'} {effectiveRate})
            </span>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
        <div className="mb-1 flex items-center gap-1.5 text-slate-400">
          <Wallet size={12} className="text-emerald-500" />
          <span className="text-[10px] font-bold">
            {!isCredit || hasPartialPayment ? 'الصندوق / البنك' : 'المستودع'}
          </span>
        </div>
        <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
          {!isCredit || hasPartialPayment
            ? cashboxName || 'غير محدد'
            : warehouseName || 'المستودع الرئيسي'}
        </p>
      </div>
    </div>

    {hasPartialPayment && (
      <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
        <AlertCircle size={16} className="shrink-0 text-amber-600" />
        <div className="flex-1">
          <span className="font-bold">فاتورة آجلة مع دفعة مقدمة:</span> سيتم إيداع{' '}
          <span className="font-mono font-black">{formatCurrency(paidAmount, currency)}</span> في{' '}
          <span className="font-bold">{cashboxName || 'الصندوق'}</span>، وترحيل المتبقي{' '}
          <span className="font-mono font-black">{formatCurrency(remainingCredit, currency)}</span>{' '}
          لحساب الذمم.
        </div>
      </div>
    )}
  </>
);
