import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Search, ChevronDown, Check, X, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, normalizeSearch } from '../../core/utils';
import type { Account, AccountType } from '../../features/accounting/types/models';

interface SearchableAccountSelectorProps {
  accounts: Account[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
  className?: string;
  /** فلترة الحسابات إلى القابلة للترحيل فقط (allow_posting !== false) — يُستخدم عند ترحيل القيود */
  postableOnly?: boolean;
}

const getAccountTypeLabel = (type?: AccountType | string) => {
  switch (type) {
    case 'asset':
      return 'أصول';
    case 'liability':
      return 'خصوم';
    case 'equity':
      return 'حقوق ملكية';
    case 'revenue':
      return 'إيرادات';
    case 'expense':
      return 'مصروفات';
    default:
      return type || '';
  }
};

const getAccountTypeBadgeClass = (type?: AccountType | string) => {
  switch (type) {
    case 'asset':
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'liability':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'equity':
      return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'revenue':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'expense':
      return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400';
  }
};

const SearchableAccountSelector: React.FC<SearchableAccountSelectorProps> = ({
  accounts,
  selectedId,
  onSelect,
  placeholder = 'ابحث برقم أو اسم الحساب...',
  className,
  postableOnly = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedId),
    [accounts, selectedId]
  );

  // حسابات قابلة للترحيل فقط عند الطلب (حسابات الأبوين / allow_posting=false تُستبعد)
  const selectableAccounts = useMemo(
    () => (postableOnly ? (accounts ?? []).filter(a => a.allow_posting !== false) : accounts ?? []),
    [accounts, postableOnly]
  );

  useEffect(() => {
    if (selectedAccount && !isOpen) {
      setSearch(`${selectedAccount.code} - ${selectedAccount.name}`);
    } else if (!selectedAccount && !isOpen) {
      setSearch('');
    }
  }, [selectedAccount, isOpen]);

  const filteredAccounts = useMemo(() => {
    const s = normalizeSearch(search);
    const isSearchSelected =
      selectedAccount && s === normalizeSearch(`${selectedAccount.code} - ${selectedAccount.name}`);
    if (!s || isSearchSelected) return selectableAccounts;

    return selectableAccounts.filter(
      a =>
        normalizeSearch(a.name).includes(s) ||
        normalizeSearch(a.code).includes(s) ||
        (a.name_ar && normalizeSearch(a.name_ar).includes(s))
    );
  }, [selectableAccounts, search, selectedAccount]);

  // Close when clicking outside
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

  return (
    <div className={cn('relative', isOpen ? 'z-50' : 'z-20', className)} ref={containerRef}>
      <div className="group relative flex items-center">
        <Search
          size={16}
          className="absolute right-3.5 text-gray-400 transition-colors group-focus-within:text-blue-500 pointer-events-none"
        />
        <input
          type="text"
          value={search}
          onFocus={() => {
            setIsOpen(true);
          }}
          onChange={e => {
            setSearch(e.target.value);
            setIsOpen(true);
            if (selectedId) {
              onSelect(''); // Clear selection on type
            }
          }}
          placeholder={placeholder}
          className={cn(
            'font-cairo w-full rounded-xl border bg-[var(--app-surface)] py-2 pl-9 pr-10 text-xs sm:text-sm font-bold outline-none transition-all shadow-sm',
            isOpen
              ? 'ring-2 ring-blue-500/20 border-blue-500 shadow-md bg-[var(--app-surface)]'
              : selectedAccount
                ? 'border-blue-200 dark:border-blue-900/50 bg-blue-50/20 dark:bg-blue-900/10'
                : 'border-[var(--app-border)] hover:border-gray-300 dark:hover:border-slate-700'
          )}
        />
        {selectedId && !isOpen && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onSelect('');
              setSearch('');
              setIsOpen(true);
            }}
            className="absolute left-8 p-1 text-gray-400 transition-colors hover:text-red-500"
            title="مسح الاختيار"
          >
            <X size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
          }}
          className="absolute left-2.5 p-1 text-gray-400 transition-colors hover:text-blue-500"
          title={isOpen ? 'إغلاق القائمة' : 'عرض الحسابات'}
        >
          <ChevronDown
            size={16}
            className={cn('transition-transform duration-200', isOpen && 'rotate-180 text-blue-500')}
          />
        </button>
      </div>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1.5 z-[100] w-[460px] min-w-full max-w-[88vw] flex max-h-[350px] flex-col rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-2xl backdrop-blur-xl ring-1 ring-black/10 dark:ring-white/10 overflow-hidden"
          >
            {/* Header / Search hint */}
            <div className="flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-surface-hover)] px-3 py-2 text-[11px] font-bold text-[var(--app-text-secondary)]">
              <span>اختر الحساب المحاسبي ({filteredAccounts.length})</span>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-blue-600 dark:text-blue-400 hover:underline text-[10px]"
                >
                  عرض الكل
                </button>
              )}
            </div>

            {/* Accounts List */}
            <div className="custom-scrollbar divide-y divide-gray-100/60 dark:divide-slate-800/60 overflow-y-auto max-h-[280px]">
              {filteredAccounts.length === 0 ? (
                <div className="space-y-2 p-8 text-center">
                  <div className="flex justify-center text-gray-300 dark:text-slate-700">
                    <Building2 size={36} />
                  </div>
                  <p className="text-xs font-bold text-gray-400">لا توجد حسابات مطابقة للبحث</p>
                  <p className="text-[10px] text-gray-400">جرب كتابة رقم الحساب أو جزء من اسمه</p>
                </div>
              ) : (
                filteredAccounts.map(acc => {
                  const isSelected = selectedId === acc.id;
                  const typeLabel = getAccountTypeLabel(acc.type);
                  const typeClass = getAccountTypeBadgeClass(acc.type);

                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        onSelect(acc.id);
                        setIsOpen(false);
                        setSearch(`${acc.code} - ${acc.name}`);
                      }}
                      className={cn(
                        'font-cairo flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-right outline-none transition-colors group',
                        isSelected
                          ? 'bg-blue-50/90 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-bold'
                          : 'text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={cn(
                            'shrink-0 rounded-md border px-2 py-0.5 font-mono text-xs font-black tracking-tight',
                            isSelected
                              ? 'border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-900/60 dark:text-blue-200'
                              : 'border-gray-200 bg-gray-100 text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 group-hover:border-blue-300'
                          )}
                        >
                          {acc.code}
                        </span>
                        <span className="text-xs font-bold leading-snug break-words text-start">
                          {acc.name || acc.name_ar}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {typeLabel && (
                          <span
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                              typeClass
                            )}
                          >
                            {typeLabel}
                          </span>
                        )}
                        {isSelected && (
                          <Check size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-[var(--app-border)] bg-[var(--app-surface-hover)] px-3 py-1.5 text-center">
              <span className="text-[10px] font-bold text-[var(--app-text-secondary)]">
                {postableOnly ? 'الحسابات القابلة للترحيل فقط' : 'جميع الحسابات'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchableAccountSelector;
