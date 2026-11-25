import React, { lazy, Suspense, useState } from 'react';
import {
  Calendar,
  Hash,
  CreditCard,
  Banknote,
  Warehouse,
  Coins,
  ArrowRightLeft,
  User,
  Plus,
} from 'lucide-react';
import { useSalesStore } from '../../store';
import { useInvoiceCurrencySync } from '../../hooks';
import { usePartyMutations } from '../../../parties/hooks';
import type { Party, PartyFormData } from '../../../parties/types';
import CustomerSelector from './CustomerSelector';
import { InvoiceTreasurySelector } from './InvoiceTreasurySelector';
import { cn } from '../../../../core/utils';
import { formatLocalDate } from '../../../../core/utils/dateUtils';

const PartyModal = lazy(() => import('../../../parties/components/PartyModal'));

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
    setCustomer,
  } = useSalesStore();

  const {
    currencies,
    paymentAccounts,
    warehouses,
    handleCurrencyChange,
  } = useInvoiceCurrencySync();

  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const { saveParty, isSaving: isSavingCustomer } = usePartyMutations('customer');

  const handleAddCustomerSubmit = (formData: PartyFormData) => {
    saveParty(
      { data: { ...formData, type: formData.type || 'customer' } },
      {
        onSuccess: (created: unknown) => {
          const party = created as Partial<Party> | null | undefined;
          if (party?.id && party?.name) {
            setCustomer({
              id: party.id,
              name: party.name,
              ...(party.phone ? { phone: party.phone } : {}),
              type: party.type || 'customer',
            });
          }
          setIsAddCustomerOpen(false);
        },
      }
    );
  };

  const isCredit = invoiceType === 'credit';
  const date = formatLocalDate(); // YYYY-MM-DD local timezone

  return (
    <div
      className={cn(
        'relative z-30 border-b px-2 py-1.5 transition-colors duration-300',
        isCredit
          ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/25'
          : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60'
      )}
    >
      <div className="grid grid-cols-1 gap-1.5 text-xs lg:grid-cols-12">
        {/* 1. Customer Selection Card (Span 4 cols) */}
        <div
          className={cn(
            'flex flex-col justify-between rounded-xl border bg-white p-2 shadow-xs transition-colors dark:bg-slate-850 lg:col-span-4',
            isCredit
              ? 'border-rose-200/90 dark:border-rose-800/60'
              : 'border-slate-200/80 dark:border-slate-750'
          )}
        >
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <User size={13} />
              <span className="text-[11px] font-black uppercase tracking-wider">بيانات العميل</span>
            </div>
            <span className="text-[10px] font-bold text-slate-400">اختيار أو إضافة عميل</span>
          </div>

          <div className="flex w-full items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <CustomerSelector />
            </div>
            <button
              type="button"
              onClick={() => {
                setIsAddCustomerOpen(true);
              }}
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 shadow-2xs transition-all hover:border-blue-400 hover:bg-blue-600 hover:text-white active:scale-95 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-600 dark:hover:text-white"
              title="إضافة عميل جديد"
              aria-label="إضافة عميل جديد"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* 2. Payment Terms & Invoice Meta Card (Span 4 cols) */}
        <div
          className={cn(
            'flex flex-col justify-between gap-1.5 rounded-xl border bg-white p-2 shadow-xs transition-colors dark:bg-slate-850 lg:col-span-4',
            isCredit
              ? 'border-rose-300/90 bg-rose-50/40 dark:border-rose-700/70 dark:bg-rose-950/20'
              : 'border-slate-200/80 dark:border-slate-750'
          )}
        >
          {/* Top row: Invoice # and Issue Date */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="mb-0.5 flex items-center gap-1 text-slate-400">
                <Hash size={11} className="text-blue-500" />
                <span className="text-[10px] font-bold">رقم الفاتورة</span>
              </div>
              <span className="font-mono text-xs font-black text-slate-800 dark:text-slate-200">
                {invoiceNumber && /^[A-Za-z]+-/.test(invoiceNumber)
                  ? invoiceNumber
                  : `#${invoiceNumber || '---'}`}
              </span>
            </div>

            <div className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="mb-0.5 flex items-center gap-1 text-slate-400">
                <Calendar size={11} className="text-emerald-500" />
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
            <div className="mb-0.5 flex items-center gap-1 text-slate-400">
              <CreditCard size={11} className="text-amber-500" />
              <span className="text-[10px] font-bold">طريقة السداد</span>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200/60 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  setMetadata('invoiceType', 'cash');
                }}
                className={cn(
                  'flex items-center justify-center gap-1 rounded-md py-1 text-xs font-black transition-all',
                  invoiceType === 'cash'
                    ? 'border border-slate-200/60 bg-white text-emerald-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                <Banknote size={13} />
                <span>نقداً (Cash)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMetadata('invoiceType', 'credit');
                }}
                className={cn(
                  'flex items-center justify-center gap-1 rounded-md py-1 text-xs font-black transition-all',
                  invoiceType === 'credit'
                    ? 'border border-rose-600 bg-rose-600 text-white shadow-sm dark:border-rose-500 dark:bg-rose-600 dark:text-white'
                    : 'text-slate-500 hover:text-rose-700 dark:hover:text-rose-300'
                )}
              >
                <CreditCard size={13} />
                <span>آجل (Credit)</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. Currency, Cashbox & Warehouse Control (Span 4 cols) */}
        <div className="flex flex-col justify-between gap-1.5 rounded-xl border border-slate-200/80 bg-white p-2 shadow-xs dark:border-slate-750 dark:bg-slate-850 lg:col-span-4">
          {/* Row 1: Currency and FX */}
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <div className="mb-0.5 flex items-center gap-1 text-slate-400">
                <Coins size={11} className="text-amber-500" />
                <span className="text-[10px] font-bold">العملة</span>
              </div>
              <select
                value={currency || 'SAR'}
                onChange={e => {
                  handleCurrencyChange(e.target.value);
                }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {(currencies.data as Array<{ code: string }>)?.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                )) || <option value="SAR">SAR</option>}
              </select>
            </div>

            <div>
              <div className="mb-0.5 flex items-center gap-1 text-slate-400">
                <ArrowRightLeft size={11} className="text-indigo-500" />
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
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
          </div>

          {/* Row 2: Treasury Account & Warehouse */}
          <div className="grid grid-cols-2 gap-1.5">
            <InvoiceTreasurySelector
              paymentAccounts={paymentAccounts}
              cashboxId={cashboxId}
              currency={currency}
              onSelectCashbox={id => {
                setMetadata('cashboxId', id);
              }}
            />

            <div>
              <div className="mb-0.5 flex items-center gap-1 text-slate-400">
                <Warehouse size={11} className="text-purple-500" />
                <span className="text-[10px] font-bold">المستودع</span>
              </div>
              <select
                value={warehouseId || ''}
                onChange={e => {
                  setMetadata('warehouseId', e.target.value);
                }}
                className="w-full truncate rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
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

      {isAddCustomerOpen && (
        <Suspense fallback={null}>
          <PartyModal
            isOpen={isAddCustomerOpen}
            onClose={() => {
              setIsAddCustomerOpen(false);
            }}
            onSubmit={handleAddCustomerSubmit}
            isSubmitting={isSavingCustomer}
            partyType="customer"
          />
        </Suspense>
      )}
    </div>
  );
};

export default InvoiceMeta;
