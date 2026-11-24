import React from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';
import type { Account, JournalEntryFormData } from '../../types/index';
import type { Party } from '../../../parties/types';
import { normalizeSearch } from '../../../../core/utils';
import SearchableAccountSelector from '../../../../ui/common/SearchableAccountSelector';
import SmartPartySelect from '../../../parties/components/SmartPartySelect';

interface JournalEntryTableProps {
  fields: any[];
  watchedLines: JournalEntryFormData['lines'];
  append: (value: any) => void;
  remove: (index: number) => void;
  register: UseFormRegister<JournalEntryFormData>;
  errors: FieldErrors<JournalEntryFormData>;
  setValue: UseFormSetValue<JournalEntryFormData>;
  accounts: Account[] | undefined;
  isLoadingAccounts: boolean;
  isAccountsError?: boolean;
  onRetryAccounts?: () => void;
  parties: Party[] | undefined;
  isLoadingParties?: boolean;
}

const findSuggestedAccountIdForParty = (
  party: Party,
  accounts: Account[] | undefined
): string | null => {
  if (!accounts || accounts.length === 0) return null;
  const postable = accounts.filter(a => a.allow_posting !== false);
  const normalizedPartyName = normalizeSearch(party.name);

  // 1) Exact name match (e.g. dedicated sub-ledger account like MZ-* for this customer/supplier)
  if (normalizedPartyName) {
    const exactMatch = postable.find(
      a =>
        normalizeSearch(a.name) === normalizedPartyName ||
        (a.name_ar && normalizeSearch(a.name_ar) === normalizedPartyName)
    );
    if (exactMatch) return exactMatch.id;
  }

  // 2) Standard control account fallback (1100 Receivables / 2100 Payables)
  const targetCode = party.type === 'supplier' ? '2100' : '1100';
  const controlAccount = postable.find(a => a.code === targetCode);
  return controlAccount?.id ?? null;
};

const JournalEntryTable: React.FC<JournalEntryTableProps> = ({
  fields,
  watchedLines,
  append,
  remove,
  register,
  errors,
  setValue,
  accounts,
  isLoadingAccounts,
  isAccountsError = false,
  onRetryAccounts,
  parties,
  isLoadingParties = false,
}) => {
  const handlePartyChange = (index: number, partyId: string) => {
    setValue(`lines.${index}.party_id`, partyId || '', { shouldValidate: true });

    // Auto-select matching account ONLY if account_id is currently empty
    const currentAccountId = watchedLines?.[index]?.account_id;
    if (partyId && !currentAccountId && parties) {
      const party = parties.find(p => p.id === partyId);
      if (party) {
        const suggestedAccountId = findSuggestedAccountIdForParty(party, accounts);
        if (suggestedAccountId) {
          setValue(`lines.${index}.account_id`, suggestedAccountId, { shouldValidate: true });
        }
      }
    }
  };

  return (
    <div className="overflow-visible rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm transition-colors">
      {/* Desktop Table Header */}
      <div className="hidden grid-cols-12 gap-2.5 rounded-t-xl border-b border-[var(--app-border)] bg-[var(--app-surface-hover)] px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--app-text-secondary)] lg:grid">
        <div className="col-span-3">الحساب المحاسبي *</div>
        <div className="col-span-3">العميل / الطرف (اختياري)</div>
        <div className="col-span-2">البيان (اختياري)</div>
        <div className="col-span-2 text-start font-bold text-emerald-700 dark:text-emerald-400">
          مدين (من حـ)
        </div>
        <div className="col-span-2 text-start font-bold text-rose-700 dark:text-rose-400">
          دائن (إلى حـ)
        </div>
      </div>

      {isAccountsError && (
        <div className="flex items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
          <span>تعذر تحميل دليل الحسابات. تحقق من الاتصال وأعد المحاولة.</span>
          {onRetryAccounts && (
            <button
              type="button"
              onClick={onRetryAccounts}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] text-white hover:bg-rose-700"
            >
              <RefreshCw size={12} />
              إعادة المحاولة
            </button>
          )}
        </div>
      )}

      <div className="divide-y divide-[var(--app-border)]">
        {fields.map((field, index) => {
          const lineAccountId = watchedLines?.[index]?.account_id ?? '';
          const linePartyId = watchedLines?.[index]?.party_id ?? '';

          return (
            <div
              key={field.id}
              className="group relative grid grid-cols-1 items-start gap-2.5 px-3 py-3 transition-colors hover:bg-[var(--app-surface-hover)]/40 lg:grid-cols-12"
            >
              {/* Account Selector */}
              <div className="lg:col-span-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-[var(--app-text-secondary)] lg:hidden">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-surface-hover)] font-mono text-[10px]">
                    {index + 1}
                  </span>
                  <span>الحساب المحاسبي *</span>
                </div>
                {isLoadingAccounts ? (
                  <div className="animate-pulse rounded-xl border border-[var(--app-border)] p-2 text-xs text-[var(--app-text-secondary)]">
                    جاري تحميل الحسابات...
                  </div>
                ) : (
                  <SearchableAccountSelector
                    accounts={accounts || []}
                    selectedId={lineAccountId}
                    onSelect={(id: string) => {
                      setValue(`lines.${index}.account_id`, id, { shouldValidate: true });
                    }}
                    className="w-full"
                    postableOnly
                  />
                )}
                {errors.lines?.[index]?.account_id && (
                  <p className="mt-1 px-1 text-[11px] font-bold text-rose-500">
                    {errors.lines[index]?.account_id?.message}
                  </p>
                )}
              </div>

              {/* Customer / Party Selector */}
              <div className="lg:col-span-3">
                <div className="mb-1 text-[11px] font-bold text-[var(--app-text-secondary)] lg:hidden">
                  العميل / الطرف (اختياري)
                </div>
                {isLoadingParties && (!parties || parties.length === 0) ? (
                  <div className="animate-pulse rounded-xl border border-[var(--app-border)] p-2 text-xs text-[var(--app-text-secondary)]">
                    جاري تحميل العملاء...
                  </div>
                ) : (
                  <SmartPartySelect
                    partyType="all"
                    parties={parties || []}
                    selectedPartyId={linePartyId}
                    onSelectPartyId={id => handlePartyChange(index, id)}
                    placeholder="عميل / مورد (اختياري)..."
                    usePortal
                    compact
                  />
                )}
              </div>

              {/* Line Description */}
              <div className="lg:col-span-2">
                <div className="mb-1 text-[11px] font-bold text-[var(--app-text-secondary)] lg:hidden">
                  البيان (اختياري)
                </div>
                <input
                  type="text"
                  placeholder="شرح السطر..."
                  {...register(`lines.${index}.description` as const)}
                  className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs text-[var(--app-text)] outline-none transition-all hover:border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:hover:border-slate-700 sm:text-sm"
                />
              </div>

              {/* Debit */}
              <div className="lg:col-span-2">
                <div className="mb-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 lg:hidden">
                  مدين (من حـ)
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register(`lines.${index}.debit_amount` as const, {
                    valueAsNumber: true,
                    onChange: e => {
                      const val = parseFloat(e.target.value);
                      if (val > 0)
                        setValue(`lines.${index}.credit_amount`, 0, { shouldValidate: true });
                    },
                  })}
                  className="w-full rounded-xl border border-emerald-200 bg-emerald-50/20 px-3 py-2 text-start font-mono text-sm font-bold text-emerald-700 outline-none hover:border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-emerald-900/40 dark:bg-emerald-950/10 dark:text-emerald-400"
                  dir="ltr"
                />
              </div>

              {/* Credit + Remove */}
              <div className="lg:col-span-2">
                <div className="mb-1 text-[11px] font-bold text-rose-700 dark:text-rose-400 lg:hidden">
                  دائن (إلى حـ)
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...register(`lines.${index}.credit_amount` as const, {
                      valueAsNumber: true,
                      onChange: e => {
                        const val = parseFloat(e.target.value);
                        if (val > 0)
                          setValue(`lines.${index}.debit_amount`, 0, { shouldValidate: true });
                      },
                    })}
                    className="w-full rounded-xl border border-rose-200 bg-rose-50/20 px-3 py-2 text-start font-mono text-sm font-bold text-rose-700 outline-none hover:border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 dark:border-rose-900/40 dark:bg-rose-950/10 dark:text-rose-400"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      remove(index);
                    }}
                    disabled={fields.length <= 2}
                    className="shrink-0 rounded-lg p-2 text-[var(--app-text-secondary)] opacity-60 transition-all hover:bg-rose-50 hover:text-rose-600 hover:opacity-100 disabled:pointer-events-none disabled:opacity-20 dark:hover:bg-rose-900/20"
                    title={fields.length <= 2 ? 'الحد الأدنى للقيد سطرين' : 'حذف السطر'}
                    aria-label="حذف السطر"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-b-xl border-t border-[var(--app-border)] bg-[var(--app-surface-hover)]/30 p-2">
        <button
          type="button"
          onClick={() => {
            append({ account_id: '', party_id: '', description: '', debit_amount: 0, credit_amount: 0 });
          }}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
        >
          <Plus size={16} />
          <span>إضافة سطر جديد (طرف قيد)</span>
        </button>
        <span className="px-2 text-[11px] font-medium text-[var(--app-text-secondary)]">
          عدد أطراف القيد: {fields.length}
        </span>
      </div>
    </div>
  );
};

export default JournalEntryTable;
