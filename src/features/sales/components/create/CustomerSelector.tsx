/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/explicit-function-return-type */
import type React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  User,
  X,
  Check,
  Phone,
  ArrowLeftRight,
  UserPlus,
  ChevronDown,
  Tag,
} from 'lucide-react';
import { useParties } from '../../../parties/hooks';
import type { Party } from '../../../parties/types';
import { useSalesStore } from '../../store';
import { useAccompanyingInfoStore } from '../../../accompanying-info';
import { cn, formatCurrency } from '../../../../core/utils';

interface Props {
  compact?: boolean;
  onAddNewCustomer?: (initialName?: string) => void;
}

type DropdownFilter = 'all' | 'customer' | 'supplier' | 'employee';

const TYPE_META: Record<
  string,
  { label: string; badgeCls: string; avatarCls: string }
> = {
  customer: {
    label: 'عميل',
    badgeCls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300',
    avatarCls: 'from-blue-600 to-indigo-600',
  },
  supplier: {
    label: 'مورد',
    badgeCls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300',
    avatarCls: 'from-amber-500 to-orange-600',
  },
  employee: {
    label: 'موظف',
    badgeCls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300',
    avatarCls: 'from-purple-600 to-fuchsia-600',
  },
  both: {
    label: 'عميل+مورد',
    badgeCls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300',
    avatarCls: 'from-emerald-600 to-teal-600',
  },
};

const getPartyMeta = (type?: string) => {
  if (type === 'supplier') return TYPE_META.supplier;
  if (type === 'employee') return TYPE_META.employee;
  if (type === 'both') return TYPE_META.both;
  return TYPE_META.customer;
};

const PartyTypeBadge: React.FC<{ type: string; inverted?: boolean }> = ({ type, inverted }) => {
  const meta = getPartyMeta(type);
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-black',
        inverted ? 'bg-white/20 text-white' : meta.badgeCls
      )}
    >
      {meta.label}
    </span>
  );
};

const getPartyBalanceDisplay = (
  party: Party,
  activeCurrency: string
): { amount: number; currency: string } | null => {
  const curr = (activeCurrency || 'SAR').toUpperCase();
  const sarBal = party.sar_balance ?? 0;
  const yerBal = party.yer_balance ?? 0;
  const fallbackBal = party.balance ?? 0;

  if (curr === 'YER' && Math.abs(yerBal) >= 0.01) return { amount: yerBal, currency: 'YER' };
  if (curr === 'SAR' && Math.abs(sarBal) >= 0.01) return { amount: sarBal, currency: 'SAR' };
  if (Math.abs(sarBal) >= 0.01) return { amount: sarBal, currency: 'SAR' };
  if (Math.abs(yerBal) >= 0.01) return { amount: yerBal, currency: 'YER' };
  if (Math.abs(fallbackBal) >= 0.01) return { amount: fallbackBal, currency: 'SAR' };
  return null;
};

const CustomerSelector: React.FC<Props> = ({ compact = false, onAddNewCustomer }) => {
  const { selectedCustomer, setCustomer, currency } = useSalesStore();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [typeFilter, setTypeFilter] = useState<DropdownFilter>('all');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { data: allParties, isLoading } = useParties('all', query);

  const partyTypeMap = useMemo(() => {
    const m = new Map<string, string>();
    (allParties ?? []).forEach(p => {
      if (p.type) m.set(p.id, p.type);
    });
    return m;
  }, [allParties]);

  const selectedPartyType =
    selectedCustomer?.type ||
    (selectedCustomer ? partyTypeMap.get(selectedCustomer.id) : undefined) ||
    'customer';

  // Type filter counts inside dropdown
  const filterCounts = useMemo(() => {
    const list = allParties ?? [];
    let customer = 0;
    let supplier = 0;
    let employee = 0;
    for (const p of list) {
      if (p.type === 'customer' || p.type === 'both') customer += 1;
      if (p.type === 'supplier' || p.type === 'both') supplier += 1;
      if (p.type === 'employee') employee += 1;
    }
    return { all: list.length, customer, supplier, employee };
  }, [allParties]);

  const displayedCustomers = useMemo(() => {
    const list = allParties ?? [];
    const scoped =
      typeFilter === 'all'
        ? list
        : list.filter(p => {
            if (typeFilter === 'customer') return p.type === 'customer' || p.type === 'both';
            if (typeFilter === 'supplier') return p.type === 'supplier' || p.type === 'both';
            return p.type === 'employee';
          });
    return query.trim() ? scoped.slice(0, 60) : scoped.slice(0, 45);
  }, [allParties, typeFilter, query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsSwitching(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, typeFilter]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const item = Array.from(listRef.current.children).at(highlightedIndex) as
      | HTMLElement
      | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isOpen]);

  const openSearchMode = () => {
    setIsSwitching(true);
    setIsOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  const handleSelect = (customer: Party) => {
    setCustomer({
      id: customer.id,
      name: customer.name,
      ...(customer.phone ? { phone: customer.phone } : {}),
      type: customer.type || 'customer',
    });
    const infoStore = useAccompanyingInfoStore.getState();
    if (infoStore.isOpen) {
      infoStore.setTarget({
        type: customer.type === 'supplier' ? 'supplier' : 'customer',
        id: customer.id,
        title: customer.name,
      });
    }
    setQuery('');
    setIsOpen(false);
    setIsSwitching(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setIsSwitching(false);
      setQuery('');
      return;
    }
    if (!isOpen || displayedCustomers.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < displayedCustomers.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : displayedCustomers.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = displayedCustomers.at(highlightedIndex);
      if (target) handleSelect(target);
    }
  };

  const showSearchInput = !selectedCustomer || isSwitching;
  const selectedMeta = getPartyMeta(selectedPartyType);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {!showSearchInput && selectedCustomer ? (
        <div
          role="button"
          tabIndex={0}
          data-inspect-type={selectedPartyType === 'supplier' ? 'supplier' : 'customer'}
          data-inspect-id={selectedCustomer.id}
          className={cn(
            'group flex cursor-pointer items-center justify-between rounded-xl border border-blue-200/90 bg-gradient-to-l from-blue-50/90 via-white to-indigo-50/60 shadow-2xs transition-all hover:border-blue-400 hover:shadow-xs dark:border-blue-800/80 dark:from-blue-950/50 dark:via-slate-900 dark:to-indigo-950/30',
            compact ? 'h-[36px] px-2 py-1' : 'h-[38px] px-2.5 py-1'
          )}
          onClick={openSearchMode}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openSearchMode();
            }
          }}
          title="انقر لتغيير العميل أو البحث عن عميل آخر"
        >
          <div className="flex min-w-0 items-center gap-2">
            <div
              className={cn(
                'flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br font-black text-white shadow-2xs',
                selectedMeta.avatarCls,
                compact ? 'h-6 w-6 text-[10px]' : 'h-7 w-7 text-xs'
              )}
            >
              {selectedCustomer.name?.trim().charAt(0) || <User size={13} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs font-black text-black dark:text-slate-100">
                  {selectedCustomer.name}
                </p>
                <PartyTypeBadge type={selectedPartyType} />
              </div>
              {!compact && selectedCustomer.phone && (
                <div className="flex items-center gap-1 font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  <Phone size={9} className="text-slate-400" />
                  <span dir="ltr">{selectedCustomer.phone}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                openSearchMode();
              }}
              className="flex items-center gap-1 rounded-lg border border-blue-200/80 bg-blue-100/70 px-2 py-1 text-[10px] font-black text-blue-800 transition-colors hover:bg-blue-600 hover:text-white dark:border-blue-800 dark:bg-blue-900/50 dark:text-blue-200 dark:hover:bg-blue-600"
              title="تبديل العميل"
            >
              <ArrowLeftRight size={10} />
              <span className="hidden sm:inline">تبديل</span>
              <ChevronDown size={10} />
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setCustomer(null);
                setIsSwitching(false);
                setIsOpen(false);
              }}
              className="rounded-lg p-1 text-slate-400 transition-all hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40"
              title="إلغاء العميل"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              setIsOpen(true);
            }}
            onClick={() => {
              setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedCustomer
                ? `تغيير العميل (${selectedCustomer.name}) — ابحث بالاسم أو الهاتف...`
                : compact
                  ? 'بحث عميل/مورد...'
                  : 'ابحث بالاسم أو رقم الهاتف (عملاء، موردين، موظفين)...'
            }
            className={cn(
              'w-full rounded-xl border border-slate-300 bg-white font-bold text-black outline-none transition-all placeholder:font-medium placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
              compact
                ? 'h-[36px] py-1 pl-7 pr-8 text-[11px]'
                : 'h-[38px] py-1.5 pl-8 pr-9 text-xs shadow-2xs'
            )}
          />
          <Search
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-500"
            size={15}
          />
          {(query.length > 0 || isSwitching) && (
            <button
              type="button"
              onClick={() => {
                if (query.length > 0) {
                  setQuery('');
                  inputRef.current?.focus();
                } else {
                  setIsSwitching(false);
                  setIsOpen(false);
                }
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              title={query.length > 0 ? 'مسح البحث' : 'إلغاء التبديل'}
            >
              <X size={13} />
            </button>
          )}

          {isOpen && (
            <div className="animate-in fade-in slide-in-from-top-1 absolute right-0 z-[80] mt-1.5 w-full min-w-[300px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900">
              {/* Filter Tabs Header */}
              <div className="flex items-center justify-between gap-1 border-b border-slate-100 bg-slate-50/95 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'all', label: 'الكل', count: filterCounts.all },
                      { id: 'customer', label: 'عملاء', count: filterCounts.customer },
                      { id: 'supplier', label: 'موردين', count: filterCounts.supplier },
                      { id: 'employee', label: 'موظفين', count: filterCounts.employee },
                    ] as const
                  ).map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onMouseDown={e => {
                        e.preventDefault();
                        setTypeFilter(tab.id);
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black transition-all',
                        typeFilter === tab.id
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-700'
                      )}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={cn(
                          'font-mono text-[9px]',
                          typeFilter === tab.id ? 'text-blue-100' : 'text-slate-400'
                        )}
                      >
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* List Body */}
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 p-5 text-xs font-bold text-slate-400">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  <span>جاري البحث في قائمة الحسابات...</span>
                </div>
              ) : displayedCustomers.length > 0 ? (
                <ul
                  ref={listRef}
                  role="listbox"
                  aria-label="قائمة العملاء والحسابات"
                  className="custom-scrollbar max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800/80"
                >
                  {displayedCustomers.map((customer, idx) => {
                    const isHighlighted = idx === highlightedIndex;
                    const isCurrent = selectedCustomer?.id === customer.id;
                    const meta = getPartyMeta(customer.type);
                    const balInfo = getPartyBalanceDisplay(customer, currency);

                    return (
                      <li
                        key={customer.id}
                        role="option"
                        aria-selected={isCurrent}
                        onMouseDown={e => {
                          e.preventDefault();
                          handleSelect(customer);
                        }}
                        onMouseEnter={() => {
                          setHighlightedIndex(idx);
                        }}
                        className={cn(
                          'flex cursor-pointer items-center justify-between gap-2 px-3 py-2 transition-colors',
                          isHighlighted
                            ? 'bg-blue-600 text-white'
                            : isCurrent
                              ? 'bg-blue-50/80 text-black dark:bg-blue-950/40 dark:text-white'
                              : 'text-black hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/70'
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black shadow-2xs',
                              isHighlighted
                                ? 'bg-white/20 text-white'
                                : cn('bg-gradient-to-br text-white', meta.avatarCls)
                            )}
                          >
                            {customer.name?.trim().charAt(0) || 'ع'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-xs font-black">{customer.name}</p>
                              <PartyTypeBadge
                                type={customer.type || 'customer'}
                                inverted={isHighlighted}
                              />
                              {isCurrent && (
                                <Check
                                  size={13}
                                  className={cn(
                                    'shrink-0',
                                    isHighlighted ? 'text-white' : 'text-blue-600'
                                  )}
                                />
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px]">
                              {customer.phone && (
                                <span
                                  dir="ltr"
                                  className={cn(
                                    'inline-flex items-center gap-0.5 font-mono font-bold',
                                    isHighlighted ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                                  )}
                                >
                                  <Phone size={9} />
                                  {customer.phone}
                                </span>
                              )}
                              {customer.category && (
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-0.5 font-bold',
                                    isHighlighted ? 'text-blue-100' : 'text-slate-400'
                                  )}
                                >
                                  <Tag size={9} />
                                  {customer.category}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Live Balance Preview on Left */}
                        <div className="flex shrink-0 flex-col items-end">
                          {balInfo ? (
                            <span
                              dir="ltr"
                              className={cn(
                                'rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-black tabular-nums',
                                isHighlighted
                                  ? 'bg-white/20 text-white'
                                  : balInfo.amount > 0
                                    ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                                    : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                              )}
                            >
                              {formatCurrency(Math.abs(balInfo.amount), balInfo.currency)}
                            </span>
                          ) : (
                            <span
                              className={cn(
                                'font-mono text-[10px] font-bold',
                                isHighlighted ? 'text-blue-100' : 'text-slate-400'
                              )}
                            >
                              0.00
                            </span>
                          )}
                          {balInfo && (
                            <span
                              className={cn(
                                'mt-0.5 text-[9px] font-black',
                                isHighlighted
                                  ? 'text-blue-100'
                                  : balInfo.amount > 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-emerald-600 dark:text-emerald-400'
                              )}
                            >
                              {balInfo.amount > 0 ? 'عليه' : 'له'}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="p-4 text-center">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {query.trim()
                      ? `لا توجد نتائج مطابقة لـ "${query.trim()}"`
                      : 'لا توجد حسابات ضمن هذا التصنيف'}
                  </p>
                </div>
              )}

              {/* Sticky Footer with Quick Add Customer */}
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/90 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-800/60">
                <span className="hidden text-[10px] font-semibold text-slate-400 sm:inline">
                  ↑↓ للتنقل • Enter للاختيار
                </span>
                {onAddNewCustomer && (
                  <button
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault();
                      const typed = query.trim();
                      setIsOpen(false);
                      setIsSwitching(false);
                      setQuery('');
                      onAddNewCustomer(typed.length > 0 ? typed : undefined);
                    }}
                    className="mr-auto inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[10.5px] font-black text-white shadow-xs transition-colors hover:bg-blue-700"
                  >
                    <UserPlus size={12} />
                    <span>
                      {query.trim() ? `إضافة "${query.trim()}" كعميل جديد` : 'إضافة عميل جديد'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerSelector;
