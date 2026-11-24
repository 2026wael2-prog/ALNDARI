import React, { useState } from 'react';
import { Check, Coins, Search, User } from 'lucide-react';
import { useParties } from '../../../parties/hooks';
import { cn } from '../../../../core/utils';

interface PaymentAccountOption {
  id: string;
  name_ar: string;
  currency_code?: string | null;
}

interface EditInvoiceMetaBarProps {
  partyId: string | null;
  customerName: string;
  onSelectParty: (id: string | null, name: string) => void;
  paymentMethod: 'cash' | 'credit';
  onPaymentMethodChange: (method: 'cash' | 'credit') => void;
  paymentAccountId: string;
  onPaymentAccountChange: (id: string) => void;
  paymentAccounts: PaymentAccountOption[];
  issueDate: string;
  onIssueDateChange: (date: string) => void;
  currencyCode: string;
  originalCurrency: string;
  isCurrencyChanged: boolean;
  exchangeRateDisplay: number;
  onExchangeRateChange: (rate: number) => void;
  onCurrencyChange: (nextCurrency: 'SAR' | 'YER') => void;
}

export const EditInvoiceMetaBar: React.FC<EditInvoiceMetaBarProps> = ({
  partyId,
  customerName,
  onSelectParty,
  paymentMethod,
  onPaymentMethodChange,
  paymentAccountId,
  onPaymentAccountChange,
  paymentAccounts,
  issueDate,
  onIssueDateChange,
  currencyCode,
  originalCurrency,
  isCurrencyChanged,
  exchangeRateDisplay,
  onExchangeRateChange,
  onCurrencyChange,
}) => {
  const [partySearchQuery, setPartySearchQuery] = useState('');
  const [isPartyDropdownOpen, setIsPartyDropdownOpen] = useState(false);
  const { data: filteredParties } = useParties('all', partySearchQuery);

  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {/* Customer Selector */}
      <div className="relative">
        <label className="mb-1 block text-xs font-bold text-[var(--app-text-secondary)]">
          العميل / الطرف
        </label>
        <div
          onClick={() => setIsPartyDropdownOpen(!isPartyDropdownOpen)}
          className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs font-semibold text-[var(--app-text)] transition-colors hover:border-blue-500/60"
        >
          <div className="flex items-center gap-2 truncate">
            <User size={14} className="shrink-0 text-blue-600 dark:text-blue-400" />
            <span className="truncate">{customerName || 'عميل نقدي'}</span>
          </div>
          <Search size={14} className="text-[var(--app-text-secondary)]" />
        </div>

        {isPartyDropdownOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-2xl">
            <input
              type="text"
              placeholder="ابحث عن العميل..."
              value={partySearchQuery}
              onChange={e => setPartySearchQuery(e.target.value)}
              className="mb-2 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1.5 text-xs text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <div className="max-h-48 space-y-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  onSelectParty(null, 'عميل نقدي');
                  setIsPartyDropdownOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-right text-xs font-semibold transition-colors',
                  partyId === null
                    ? 'bg-blue-600 text-white'
                    : 'text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
                )}
              >
                <span>عميل نقدي (بدون حساب)</span>
                {partyId === null && <Check size={14} />}
              </button>
              {(filteredParties || []).map(party => (
                <button
                  key={party.id}
                  type="button"
                  onClick={() => {
                    onSelectParty(party.id, party.name);
                    setIsPartyDropdownOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-right text-xs font-semibold transition-colors',
                    partyId === party.id
                      ? 'bg-blue-600 text-white'
                      : 'text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
                  )}
                >
                  <div className="flex flex-col">
                    <span>{party.name}</span>
                    {party.phone && (
                      <span className="font-mono text-[10px] opacity-80" dir="ltr">
                        {party.phone}
                      </span>
                    )}
                  </div>
                  {partyId === party.id && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Payment Method */}
      <div>
        <label className="mb-1 block text-xs font-bold text-[var(--app-text-secondary)]">
          طريقة الدفع
        </label>
        <div className="flex rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-0.5">
          <button
            type="button"
            onClick={() => onPaymentMethodChange('cash')}
            className={cn(
              'flex-1 rounded-md py-1.5 text-xs font-bold transition-colors',
              paymentMethod === 'cash'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
            )}
          >
            نقداً (كاش)
          </button>
          <button
            type="button"
            onClick={() => onPaymentMethodChange('credit')}
            className={cn(
              'flex-1 rounded-md py-1.5 text-xs font-bold transition-colors',
              paymentMethod === 'credit'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
            )}
          >
            آجل (ذمم)
          </button>
        </div>
      </div>

      {/* Cashbox / Treasury Selector */}
      <div>
        <label className="mb-1 block text-xs font-bold text-[var(--app-text-secondary)]">
          الصندوق / الخزينة
        </label>
        <select
          value={paymentAccountId}
          onChange={e => onPaymentAccountChange(e.target.value)}
          className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs font-semibold text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
        >
          <option value="">الصندوق الافتراضي للفرع</option>
          {paymentAccounts.map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.name_ar} {acc.currency_code ? `(${acc.currency_code})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Issue Date */}
      <div>
        <label className="mb-1 block text-xs font-bold text-[var(--app-text-secondary)]">
          تاريخ الفاتورة
        </label>
        <input
          type="date"
          value={issueDate}
          onChange={e => onIssueDateChange(e.target.value)}
          className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 font-mono text-xs font-semibold text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Currency Switcher (YER <-> SAR) + Exchange Rate */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-3 sm:col-span-2 lg:col-span-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text-secondary)]">
            <Coins size={14} className="text-amber-500" />
            عملة الفاتورة:
          </span>
          <div className="flex rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-0.5">
            <button
              type="button"
              onClick={() => onCurrencyChange('SAR')}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-black transition-colors',
                currencyCode === 'SAR'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
              )}
            >
              ريال سعودي (SAR)
            </button>
            <button
              type="button"
              onClick={() => onCurrencyChange('YER')}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-black transition-colors',
                currencyCode === 'YER'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
              )}
            >
              ريال يمني (YER)
            </button>
          </div>

          {currencyCode === 'YER' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                سعر الصرف (1 ر.س =):
              </span>
              <input
                type="number"
                min={1}
                step="any"
                value={exchangeRateDisplay}
                onChange={e => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val) && val > 0) onExchangeRateChange(val);
                }}
                className="w-20 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-center font-mono text-xs font-bold text-[var(--app-text)]"
              />
              <span className="text-[11px] font-bold text-amber-600">ر.ي</span>
            </div>
          )}
        </div>

        {isCurrencyChanged && (
          <span className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            تحويل كامل: ستُنقل الفاتورة من حساب ({originalCurrency}) إلى حساب ({currencyCode}) وتُلغى من العملة القديمة تلقائياً
          </span>
        )}
      </div>
    </div>
  );
};
