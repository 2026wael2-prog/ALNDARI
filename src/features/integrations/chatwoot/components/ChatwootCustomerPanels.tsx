import React from 'react';
import {
  CalendarCheck,
  Check,
  Copy,
  ExternalLink,
  MessageCircle,
  Phone,
  PlusCircle,
  Receipt,
  Wallet,
} from 'lucide-react';
import type { ChatwootPartySummary } from '../api/chatwootWidgetApi';
import { formatCurrency } from '@/core/utils';
import {
  getBalanceToneClass,
  getPartyTypeLabel,
  hasNonEmptyString,
  type PromiseFormState,
} from '../utils/chatwootHelpers';

export const CustomerOverviewColumn: React.FC<{
  data: ChatwootPartySummary;
  copiedSummary: boolean;
  onOpenWhatsApp: () => void;
  onCopySummary: () => void;
}> = ({ data, copiedSummary, onOpenWhatsApp, onCopySummary }) => {
  const hasPhone = hasNonEmptyString(data.party.phone);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex items-start justify-between">
          <div>
            <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {getPartyTypeLabel(data.party.type)}
            </span>
            <h2 className="mt-1 text-sm font-black text-slate-800 dark:text-white">
              {data.party.name}
            </h2>
          </div>
          <a
            href="#/parties"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50/60 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
            title="فتح ملف العميل الكامل في تبويب جديد"
          >
            <span>الملف</span>
            <ExternalLink size={11} />
          </a>
        </div>

        {hasPhone && (
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span className="text-[11px] text-slate-400">الجوال المسجل:</span>
            <div className="flex items-center gap-1.5" dir="ltr">
              <Phone size={12} className="text-slate-400" />
              <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                {data.party.phone}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <Wallet size={14} className="text-emerald-600" />
            <span>الأرصدة الحالية</span>
          </div>
          <div className="flex items-center gap-1.5">
            {hasPhone && (
              <button
                type="button"
                onClick={onOpenWhatsApp}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs transition-colors hover:bg-emerald-700"
                title="فتح محادثة واتساب ويب مع العميل مباشرةً"
              >
                <MessageCircle size={12} />
                <span>مراسلة واتساب</span>
              </button>
            )}
            <button
              type="button"
              onClick={onCopySummary}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title="نسخ كليشة الرد السريع لإرسالها للعميل"
            >
              {copiedSummary ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
              <span>{copiedSummary ? 'تم النسخ!' : 'نسخ النص'}</span>
            </button>
          </div>
        </div>

        {data.balances.length === 0 ? (
          <p className="text-xs text-slate-400">لا توجد حركات مالية مسجلة</p>
        ) : (
          <div className="space-y-1.5">
            {data.balances.map(b => (
              <div
                key={b.currency_code}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60"
              >
                <span className="font-bold text-slate-600 dark:text-slate-400">
                  {b.currency_code}
                </span>
                <span
                  className={`font-mono text-sm font-black ${getBalanceToneClass(b.balance)}`}
                  dir="ltr"
                >
                  {formatCurrency(b.balance)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const PromiseFormPanel: React.FC<{
  form: PromiseFormState;
  onAmountChange: (val: string) => void;
  onCurrencyChange: (val: string) => void;
  onDateChange: (val: string) => void;
  onNotesChange: (val: string) => void;
  onSubmit: (e: React.SyntheticEvent) => Promise<void>;
}> = ({ form, onAmountChange, onCurrencyChange, onDateChange, onNotesChange, onSubmit }) => (
  <form
    onSubmit={e => {
      void onSubmit(e);
    }}
    className="mb-3 space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 dark:border-indigo-900/30 dark:bg-indigo-950/20"
  >
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label
          htmlFor="cw-promise-amount"
          className="block text-[10px] font-bold text-slate-600 dark:text-slate-400"
        >
          المبلغ
        </label>
        <input
          id="cw-promise-amount"
          type="number"
          required
          min="1"
          step="any"
          value={form.amount}
          onChange={e => onAmountChange(e.target.value)}
          placeholder="500"
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          dir="ltr"
        />
      </div>
      <div>
        <label
          htmlFor="cw-promise-currency"
          className="block text-[10px] font-bold text-slate-600 dark:text-slate-400"
        >
          العملة
        </label>
        <select
          id="cw-promise-currency"
          value={form.currency}
          onChange={e => onCurrencyChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="YER">YER (ريال يمني)</option>
          <option value="SAR">SAR (ريال سعودي)</option>
          <option value="USD">USD (دولار)</option>
        </select>
      </div>
    </div>

    <div>
      <label
        htmlFor="cw-promise-date"
        className="block text-[10px] font-bold text-slate-600 dark:text-slate-400"
      >
        تاريخ الوعد
      </label>
      <input
        id="cw-promise-date"
        type="date"
        required
        value={form.date}
        onChange={e => onDateChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
      />
    </div>

    <div>
      <input
        type="text"
        value={form.notes}
        onChange={e => onNotesChange(e.target.value)}
        placeholder="ملاحظات العذر أو طريقة التحويل..."
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
      />
    </div>

    <button
      type="submit"
      disabled={form.isSubmitting}
      className="w-full rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:opacity-60"
    >
      {form.isSubmitting ? 'جارٍ الحفظ...' : 'حفظ وعد السداد في ERP'}
    </button>
  </form>
);

export const PaymentPromisesCard: React.FC<{
  promises: ChatwootPartySummary['pendingPromises'];
  showPromiseForm: boolean;
  onToggleForm: () => void;
  promiseFeedback: string | null;
  promiseForm: PromiseFormState;
  onAmountChange: (val: string) => void;
  onCurrencyChange: (val: string) => void;
  onDateChange: (val: string) => void;
  onNotesChange: (val: string) => void;
  onSubmit: (e: React.SyntheticEvent) => Promise<void>;
}> = ({
  promises,
  showPromiseForm,
  onToggleForm,
  promiseFeedback,
  promiseForm,
  onAmountChange,
  onCurrencyChange,
  onDateChange,
  onNotesChange,
  onSubmit,
}) => (
  <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
    <div className="mb-2.5 flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
        <CalendarCheck size={14} className="text-indigo-600" />
        <span>وعود السداد</span>
      </div>
      <button
        type="button"
        onClick={onToggleForm}
        className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
      >
        <PlusCircle size={13} />
        <span>{showPromiseForm ? 'إلغاء' : 'إضافة وعد'}</span>
      </button>
    </div>

    {hasNonEmptyString(promiseFeedback) && (
      <div className="mb-2 rounded-xl bg-emerald-50 p-2 text-center text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        {promiseFeedback}
      </div>
    )}

    {showPromiseForm && (
      <PromiseFormPanel
        form={promiseForm}
        onAmountChange={onAmountChange}
        onCurrencyChange={onCurrencyChange}
        onDateChange={onDateChange}
        onNotesChange={onNotesChange}
        onSubmit={onSubmit}
      />
    )}

    {promises.length === 0 ? (
      <p className="text-[11px] text-slate-400">لا توجد وعود سداد معلقة</p>
    ) : (
      <div className="space-y-1.5">
        {promises.map(p => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/60"
          >
            <div>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {formatCurrency(p.amount)} {p.currency_code}
              </span>
              {hasNonEmptyString(p.notes) && (
                <p className="text-[10px] text-slate-400">{p.notes}</p>
              )}
            </div>
            <span
              className="font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400"
              dir="ltr"
            >
              {p.promise_date}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
);

export const RecentInvoicesCard: React.FC<{ invoices: ChatwootPartySummary['recentInvoices'] }> = ({
  invoices,
}) => (
  <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
    <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
      <Receipt size={14} className="text-amber-600" />
      <span>آخر الفواتير</span>
    </div>

    {invoices.length === 0 ? (
      <p className="text-[11px] text-slate-400">لا توجد فواتير مسجلة</p>
    ) : (
      <div className="space-y-1.5">
        {invoices.map(inv => (
          <div
            key={inv.id}
            className="flex items-center justify-between rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/60"
          >
            <div>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                #{inv.invoice_number}
              </span>
              <span className="mr-2 font-mono text-[10px] text-slate-400" dir="ltr">
                {inv.issue_date}
              </span>
            </div>
            <div className="text-left" dir="ltr">
              <span className="font-mono font-black text-slate-700 dark:text-slate-300">
                {formatCurrency(inv.total_amount)} {inv.currency_code}
              </span>
              {inv.remaining_amount > 0 && (
                <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                  متبقي: {formatCurrency(inv.remaining_amount)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);
