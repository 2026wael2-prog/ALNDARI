import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Wallet,
  ChevronDown,
  Search,
  Check,
  Building2,
} from 'lucide-react';
import { cn } from '../../../../core/utils';
import { type PaymentAccount } from '../../../accounting/hooks';

interface Props {
  paymentAccounts?: PaymentAccount[] | undefined;
  cashboxId: string;
  currency: string;
  onSelectCashbox: (id: string) => void;
}

export const InvoiceTreasurySelector: React.FC<Props> = ({
  paymentAccounts,
  cashboxId,
  currency,
  onSelectCashbox,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedAccount = useMemo(() => {
    return paymentAccounts?.find(a => a.id === cashboxId);
  }, [paymentAccounts, cashboxId]);

  const filteredAccounts = useMemo(() => {
    if (!paymentAccounts) return [];
    const normalizedInvoiceCurrency = (currency || 'SAR').toUpperCase();

    // Filter by currency matching (or accounts that have no currency specified)
    const currencyMatched = paymentAccounts.filter(a => {
      const accCurr = (a.currency_code ?? '').toUpperCase();
      return accCurr === '' || accCurr === normalizedInvoiceCurrency;
    });

    // Filter by search term
    const term = search.toLowerCase().trim();
    if (term === '') return currencyMatched;
    return currencyMatched.filter(
      a =>
        a.name_ar.toLowerCase().includes(term) ||
        (Boolean(a.code) && (a.code ?? '').toLowerCase().includes(term))
    );
  }, [paymentAccounts, search, currency]);

  return (
    <div className="relative" ref={containerRef}>
      <div className="mb-1 flex items-center gap-1 text-slate-400">
        <Wallet size={12} className="text-emerald-500" />
        <span className="text-[10px] font-bold">حساب الصندوق</span>
      </div>

      <button
        type="button"
        onClick={() => {
          setIsOpen(prev => !prev);
        }}
        className="flex w-full items-center justify-between gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none transition-colors hover:border-slate-300 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
      >
        <span className="truncate">
          {selectedAccount ? selectedAccount.name_ar : 'اختر الصندوق...'}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            'shrink-0 text-slate-400 transition-transform duration-200',
            isOpen && 'rotate-180 text-blue-500'
          )}
        />
      </button>

      {/* Popover Menu with high z-index */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-850">
          {paymentAccounts && paymentAccounts.length > 5 && (
            <div className="relative mb-2">
              <Search
                size={13}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                }}
                placeholder="بحث عن صندوق..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1 pl-2 pr-7 text-xs font-bold outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                autoFocus
              />
            </div>
          )}

          <div className="custom-scrollbar max-h-56 space-y-1 overflow-y-auto">
            {filteredAccounts.length === 0 ? (
              <div className="p-3 text-center text-xs font-bold text-slate-400">
                لا توجد صناديق متاحة
              </div>
            ) : (
              filteredAccounts.map(account => {
                const isSelected = account.id === cashboxId;
                const isCash = Boolean(account.cashbox_id);
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => {
                      onSelectCashbox(account.id);
                      setIsOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-right transition-all',
                      isSelected
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                    )}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                          isCash
                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'
                            : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400'
                        )}
                      >
                        {isCash ? <Wallet size={14} /> : <Building2 size={14} />}
                      </div>
                      <div className="overflow-hidden">
                        <p className="truncate text-xs font-black">{account.name_ar}</p>
                        <span className="text-[10px] font-bold text-slate-400">
                          {isCash ? 'صندوق نقدي' : 'شركة صرافة'}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={cn(
                          'rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold',
                          account.currency_code === 'SAR'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                        )}
                      >
                        {account.currency_code}
                      </span>
                      {isSelected && <Check size={14} className="text-emerald-600" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
