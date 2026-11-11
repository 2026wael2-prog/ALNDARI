import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';
import type { JournalEntryFormData } from '../../types/index';
import SearchableAccountSelector from '../../../../ui/common/SearchableAccountSelector';

interface JournalEntryTableProps {
  fields: any[];
  append: (value: any) => void;
  remove: (index: number) => void;
  register: UseFormRegister<JournalEntryFormData>;
  errors: FieldErrors<JournalEntryFormData>;
  setValue: UseFormSetValue<JournalEntryFormData>;
  accounts: any[] | undefined;
  isLoadingAccounts: boolean;
}

const JournalEntryTable: React.FC<JournalEntryTableProps> = ({
  fields,
  append,
  remove,
  register,
  errors,
  setValue,
  accounts,
  isLoadingAccounts,
}) => {
  return (
    <div className="overflow-visible rounded-xl border border-[var(--app-border)] shadow-sm transition-colors bg-[var(--app-surface)]">
      <div className="grid grid-cols-12 gap-3 md:gap-4 rounded-t-xl bg-[var(--app-surface-hover)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--app-text-secondary)] border-b border-[var(--app-border)]">
        <div className="col-span-1 text-center">#</div>
        <div className="col-span-4">الحساب المحاسبي *</div>
        <div className="col-span-3">البيان (اختياري)</div>
        <div className="col-span-2 text-start font-bold text-emerald-700 dark:text-emerald-400">
          مدين (من حـ)
        </div>
        <div className="col-span-2 text-start font-bold text-rose-700 dark:text-rose-400">
          دائن (إلى حـ)
        </div>
      </div>

      <div className="divide-y divide-[var(--app-border)]">
        {fields.map((field, index) => (
          <div
            key={field.id}
            style={{ zIndex: fields.length - index + 10 }}
            className="group relative grid grid-cols-12 items-start gap-3 md:gap-4 px-4 py-3 transition-colors hover:bg-[var(--app-surface-hover)]/40"
          >
            <div className="col-span-1 flex items-center justify-center pt-2">
              <span
                dir="ltr"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--app-surface-hover)] text-xs font-bold text-[var(--app-text-secondary)] border border-[var(--app-border)]"
              >
                {index + 1}
              </span>
            </div>

            <div className="col-span-4">
              {isLoadingAccounts ? (
                <div className="animate-pulse p-2 text-xs text-[var(--app-text-secondary)]">
                  جاري تحميل الحسابات...
                </div>
              ) : (
                <SearchableAccountSelector
                  accounts={accounts || []}
                  selectedId={fields[index].account_id}
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

            <div className="col-span-3">
              <input
                type="text"
                placeholder="شرح إضافي اختياري للسطر..."
                {...register(`lines.${index}.description` as const)}
                className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs sm:text-sm text-[var(--app-text)] outline-none transition-all hover:border-gray-300 dark:hover:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
              />
            </div>

            <div className="col-span-2">
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
                className="w-full rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/20 dark:bg-emerald-950/10 px-3 py-2 text-start font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400 outline-none hover:border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                dir="ltr"
              />
            </div>

            <div className="col-span-2 flex items-center gap-1.5">
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
                className="w-full rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-950/10 px-3 py-2 text-start font-mono text-sm font-bold text-rose-700 dark:text-rose-400 outline-none hover:border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => {
                  remove(index);
                }}
                disabled={fields.length <= 2}
                className="shrink-0 rounded-lg p-2 text-[var(--app-text-secondary)] opacity-60 transition-all hover:bg-rose-50 hover:text-rose-600 hover:opacity-100 disabled:opacity-20 disabled:pointer-events-none dark:hover:bg-rose-900/20"
                title={fields.length <= 2 ? 'الحد الأدنى للقيد سطرين' : 'حذف السطر'}
                aria-label="حذف السطر"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-2 border-t border-[var(--app-border)] bg-[var(--app-surface-hover)]/30 rounded-b-xl flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            append({ account_id: '', description: '', debit_amount: 0, credit_amount: 0 });
          }}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          <Plus size={16} />
          <span>إضافة سطر جديد (طرف قيد)</span>
        </button>
        <span className="text-[11px] text-[var(--app-text-secondary)] px-2 font-medium">
          عدد أطراف القيد: {fields.length}
        </span>
      </div>
    </div>
  );
};

export default JournalEntryTable;
