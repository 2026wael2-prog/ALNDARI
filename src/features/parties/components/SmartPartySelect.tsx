import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, User, X, Check, ChevronsUpDown, Phone } from 'lucide-react';
import type { Party, PartyType } from '../types';
import { filterPartiesSmart } from '../../../core/utils/partySearch';
import { cn } from '../../../core/utils';

const PARTY_TYPE_LABELS: Record<string, string> = {
  customer: 'عميل',
  supplier: 'مورد',
  both: 'عميل ومورد',
  employee: 'موظف',
};

const DROPDOWN_MAX_HEIGHT = 280;

interface SmartPartySelectProps {
  partyType: PartyType;
  parties?: Party[];
  selectedPartyId: string;
  onSelectPartyId: (id: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** Render dropdown via portal (prevents clipping inside Modals / overflow containers) */
  usePortal?: boolean;
  /** Compact styling for table rows */
  compact?: boolean;
}

export const SmartPartySelect: React.FC<SmartPartySelectProps> = ({
  partyType,
  parties = [],
  selectedPartyId,
  onSelectPartyId,
  placeholder,
  className,
  autoFocus = false,
  usePortal = false,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedParty = useMemo(
    () => parties.find(p => p.id === selectedPartyId),
    [parties, selectedPartyId]
  );

  const defaultPlaceholder =
    placeholder ||
    (partyType === 'all'
      ? 'ابحث عن عميل، مورد، أو موظف...'
      : partyType === 'customer'
        ? 'ابحث بالاسم أو الهاتف أو حروف متقطعة...'
        : partyType === 'employee'
          ? 'ابحث عن الموظف بالاسم أو الهاتف...'
          : 'ابحث عن المورد بالاسم أو الهاتف...');

  const filteredParties = useMemo(() => {
    return filterPartiesSmart(parties, query);
  }, [parties, query]);

  // Capped to top 80 items to guarantee instant DOM mount and smooth 60fps scrolling
  const displayParties = useMemo(() => {
    return filteredParties.slice(0, 80);
  }, [filteredParties]);

  const updateDropdownPosition = useCallback(() => {
    if (!usePortal || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const desiredWidth = Math.min(Math.max(rect.width, 300), Math.min(400, viewportW - 16));

    let left = rect.right - desiredWidth;
    if (left < 8) left = 8;
    if (left + desiredWidth > viewportW - 8) left = Math.max(8, viewportW - desiredWidth - 8);

    const spaceBelow = viewportH - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
    const top = openUpward
      ? Math.max(8, rect.top - Math.min(DROPDOWN_MAX_HEIGHT, spaceAbove) - 6)
      : rect.bottom + 6;

    setDropdownPos({ top, left, width: desiredWidth });
  }, [usePortal]);

  useEffect(() => {
    if (!isOpen || !usePortal) return;
    updateDropdownPosition();
    const handleReposition = () => {
      updateDropdownPosition();
    };
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, usePortal, updateDropdownPosition]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Reset highlight on query change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (partyId: string) => {
    onSelectPartyId(partyId);
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectPartyId('');
    setQuery('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < displayParties.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (displayParties[highlightedIndex]) {
        handleSelect(displayParties[highlightedIndex].id);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const dropdownContent = (
    <div
      ref={dropdownRef}
      dir="rtl"
      style={
        usePortal && dropdownPos
          ? {
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              zIndex: 20000,
            }
          : undefined
      }
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 bg-[var(--app-surface)] shadow-2xl dark:border-slate-700',
        !usePortal && 'animate-in fade-in slide-in-from-top-1 absolute z-50 mt-1.5 w-full'
      )}
    >
      {filteredParties.length === 0 ? (
        <div className="p-4 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
          {parties.length === 0
            ? 'لا توجد جهات مسجلة حالياً'
            : `لا توجد نتائج مطابقة لـ "${query}"`}
        </div>
      ) : (
        <ul
          ref={listRef}
          className="custom-scrollbar max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800/60"
        >
          {displayParties.map((party, index) => {
            const isSelected = party.id === selectedPartyId;
            const isHighlighted = index === highlightedIndex;
            const effectiveType = partyType === 'all' ? party.type : partyType;

            return (
              <li
                key={party.id}
                data-inspect-type={effectiveType}
                data-inspect-id={party.id}
                data-inspect-title={party.name}
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  handleSelect(party.id);
                }}
                onMouseEnter={() => {
                  setHighlightedIndex(index);
                }}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 transition-colors',
                  isHighlighted
                    ? 'bg-blue-50 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/50',
                  isSelected && 'bg-blue-100/50 font-black dark:bg-blue-900/60'
                )}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black',
                      effectiveType === 'customer'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : effectiveType === 'employee'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                          : effectiveType === 'both'
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    )}
                  >
                    <User size={14} />
                  </div>

                  <div className="flex flex-col truncate">
                    <span className="truncate text-sm font-bold">{party.name}</span>
                    {party.phone && (
                      <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400 dark:text-slate-400">
                        <Phone size={10} />
                        {party.phone}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {partyType === 'all' && party.type && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {PARTY_TYPE_LABELS[party.type] || party.type}
                    </span>
                  )}
                  {party.category && partyType !== 'all' && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {party.category}
                    </span>
                  )}

                  {isSelected && <Check size={16} className="text-blue-600 dark:text-blue-400" />}
                </div>
              </li>
            );
          })}
          {filteredParties.length > displayParties.length && (
            <li className="bg-slate-50/50 p-2 text-center text-xs font-bold text-slate-400 dark:bg-slate-800/30 dark:text-slate-500">
              عرض أول {displayParties.length} طرفاً من أصل {filteredParties.length} — اكتب في شريط
              البحث لتحديد طرف بعينه
            </li>
          )}
        </ul>
      )}
    </div>
  );

  return (
    <div className={cn('relative w-full', className)} ref={containerRef}>
      <div
        className={cn(
          'relative flex items-center border transition-all',
          compact
            ? 'rounded-xl bg-[var(--app-surface)] shadow-sm'
            : 'rounded-lg bg-slate-50 dark:bg-slate-800/80',
          isOpen
            ? 'border-blue-500 bg-[var(--app-surface)] ring-2 ring-blue-500/20'
            : selectedParty && compact
              ? 'border-emerald-200 bg-emerald-50/20 dark:border-emerald-900/50 dark:bg-emerald-900/10'
              : 'border-[var(--app-border)] hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
        )}
      >
        <div
          className={cn(
            'flex items-center justify-center text-slate-400',
            compact ? 'pl-1 pr-2.5' : 'pl-2 pr-3'
          )}
        >
          {compact ? <User size={14} /> : <Search size={16} />}
        </div>

        <input
          ref={inputRef}
          type="text"
          autoFocus={autoFocus}
          value={isOpen ? query : selectedParty?.name || query}
          onChange={e => {
            setQuery(e.target.value);
            if (!isOpen) {
              setIsOpen(true);
              updateDropdownPosition();
            }
          }}
          onFocus={() => {
            setIsOpen(true);
            setQuery('');
            updateDropdownPosition();
          }}
          onKeyDown={handleKeyDown}
          placeholder={selectedParty ? selectedParty.name : defaultPlaceholder}
          className={cn(
            'w-full bg-transparent font-bold text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500',
            compact ? 'py-2 pl-2 pr-1 text-xs sm:text-sm' : 'py-2 pl-8 pr-1 text-sm'
          )}
        />

        <div className="flex items-center gap-0.5 pl-1.5 pr-1">
          {(selectedPartyId || query) && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded p-1 text-slate-400 transition-colors hover:text-rose-500"
              title="مسح الاختيار"
            >
              <X size={13} />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setIsOpen(prev => {
                const next = !prev;
                if (next) updateDropdownPosition();
                return next;
              });
              if (!isOpen && inputRef.current) inputRef.current.focus();
            }}
            className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <ChevronsUpDown size={14} />
          </button>
        </div>
      </div>

      {isOpen &&
        (usePortal
          ? dropdownPos && typeof document !== 'undefined'
            ? createPortal(dropdownContent, document.body)
            : null
          : dropdownContent)}
    </div>
  );
};

export default SmartPartySelect;
