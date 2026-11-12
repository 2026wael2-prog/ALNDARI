import React from 'react';
import {
  Calendar,
  Hash,
  CreditCard,
  Banknote,
  Warehouse,
  Coins,
  ArrowRightLeft,
  User,
} from 'lucide-react';
import { useSalesStore } from '../../store';
import { useInvoiceCurrencySync } from '../../hooks';
import CustomerSelector from './CustomerSelector';
import { InvoiceTreasurySelector } from './InvoiceTreasurySelector';
import { cn } from '../../../../core/utils';
import { formatLocalDate } from '../../../../core/utils/dateUtils';

interface Props {
  invoiceNumber?: string;
}

const InvoiceMeta: React.FC<Props> = ({ invoiceNumber }) => {
  const {
    invoiceType,
    currency,
    exchangeRate,
    exchangeOperator,
    warehouseId,
    cashboxId,
    setMetadata,
  } = useSalesStore();

  const {
    currencies,
    paymentAccounts,
    warehouses,
    handleCurrencyChange,
  } = useInvoiceCurrencySync();

  const date = formatLocalDate(); // YYYY-MM-DD local timezone

  return (
    <div className="relative z-30 border-b border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="grid grid-cols-1 gap-3 text-xs lg:grid-cols-12">
        {/* 1. Customer Selection Card (Span 4 cols) */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-750 dark:bg-slate-850 lg:col-span-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
              <User size={14} />
              <span className="text-[11px] font-black uppercase tracking-wider">بيانات العميل</span>
            </div>
            <span className="text-[10px] font-bold text-slate-400">اختيار أو بحث ذكي</span>
          </div>

          <div className="w-full">
            <CustomerSelector />
          </div>
        </div>

        {/* 2. Payment Terms & Invoice Meta Card (Span 4 cols) */}
        <div className="flex flex-col justify-between gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-750 dark:bg-slate-850 lg:col-span-4">
          {/* Top row: Invoice # and Issue Date */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="mb-1 flex items-center gap-1 text-slate-400">
                <Hash size={12} className="text-blue-500" />
                <span className="text-[10px] font-bold">رقم الفاتورة</span>
              </div>
              <span className="font-mono text-xs font-black text-slate-800 dark:text-slate-200">
                {invoiceNumber && /^[A-Za-z]+-/.test(invoiceNumber)
                  ? invoiceNumber
                  : `#${invoiceNumber || '---'}`}
              </span>
            </div>

            <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="mb-1 flex items-center gap-1 text-slate-400">
                <Calendar size={12} className="text-emerald-500" />
                <span className="text-[10px] font-bold">تاريخ التحرير</span>
              </div>
              <span
                dir="ltr"
                className="block text-right font-mono text-xs font-bold text-slate-800 dark:text-slate-200"
              >
                {date}
              </span>
            </div>
          </div>

          {/* Payment Method Toggle Pills */}
          <div>
            <div className="mb-1.5 flex items-center gap-1 text-slate-400">
              <CreditCard size={12} className="text-amber-500" />
              <span className="text-[10px] font-bold">طريقة السداد</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200/60 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  setMetadata('invoiceType', 'cash');
                }}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-black transition-all',
                  invoiceType === 'cash'
                    ? 'border border-slate-200/60 bg-white text-emerald-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                <Banknote size={14} />
                <span>نقداً (Cash)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMetadata('invoiceType', 'credit');
                }}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-black transition-all',
                  invoiceType === 'credit'
                    ? 'border border-slate-200/60 bg-white text-blue-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                <CreditCard size={14} />
                <span>آجل (Credit)</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. Currency, Cashbox & Warehouse Control (Span 4 cols) */}
        <div className="flex flex-col justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-750 dark:bg-slate-850 lg:col-span-4">
          {/* Row 1: Currency and FX */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 flex items-center gap-1 text-slate-400">
                <Coins size={12} className="text-amber-500" />
                <span className="text-[10px] font-bold">العملة</span>
              </div>
              <select
                value={currency || 'SAR'}
                onChange={e => {
                  handleCurrencyChange(e.target.value);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {(currencies.data as Array<{ code: string }>)?.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                )) || <option value="SAR">SAR</option>}
              </select>
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1 text-slate-400">
                <ArrowRightLeft size={12} className="text-indigo-500" />
                <span className="text-[10px] font-bold">
                  سعر الصرف {exchangeOperator === 'divide' ? '(÷)' : '(×)'}
                </span>
              </div>
              <input
                type="number"
                step="0.00001"
                disabled={currency === 'SAR'}
                value={
                  currency === 'SAR'
                    ? 1
                    : exchangeRate
                      ? exchangeOperator === 'divide' && exchangeRate < 1
                        ? Math.round(1 / exchangeRate)
                        : exchangeRate
                      : 1
                }
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  if (!val) return;
                  setMetadata('exchangeRate', val);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
          </div>

          {/* Row 2: Treasury Account & Warehouse */}
          <div className="grid grid-cols-2 gap-2">
            <InvoiceTreasurySelector
              paymentAccounts={paymentAccounts}
              cashboxId={cashboxId}
              currency={currency}
              onSelectCashbox={id => {
                setMetadata('cashboxId', id);
              }}
            />

            <div>
              <div className="mb-1 flex items-center gap-1 text-slate-400">
                <Warehouse size={12} className="text-purple-500" />
                <span className="text-[10px] font-bold">المستودع</span>
              </div>
              <select
                value={warehouseId || ''}
                onChange={e => {
                  setMetadata('warehouseId', e.target.value);
                }}
                className="w-full truncate rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {warehouses?.map((w: Record<string, unknown>) => (
                  <option key={w.id as string} value={w.id as string}>
                    {(w.name_ar as string) || (w.name as string)}
                  </option>
                )) || <option value="wh_main">المستودع الرئيسي</option>}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceMeta;
