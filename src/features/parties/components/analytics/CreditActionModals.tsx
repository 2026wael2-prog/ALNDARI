import type React from 'react';
import { useState } from 'react';
import { CalendarClock, Lock, ShieldCheck, X } from 'lucide-react';
import { cn, formatCurrency } from '@/core/utils';
import type { EnrichedCustomerCreditRow } from '../../utils/creditScoring';
import {
  useLogCreditPromise,
  useUpdatePartyCreditPolicy,
} from '../../hooks/useCustomerCreditAnalytics';

const ModalShell: React.FC<{
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, icon, onClose, children }) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-3">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-black text-black dark:text-white">{title}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-black"
        >
          <X size={16} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const CreditStatusToggle: React.FC<{
  status: 'active' | 'blocked';
  onChange: (s: 'active' | 'blocked') => void;
}> = ({ status, onChange }) => (
  <div>
    <span className="mb-1 block font-black text-black dark:text-slate-200">
      حالة الائتمان (البيع الآجل)
    </span>
    <div className="grid grid-cols-2 gap-1.5">
      <button
        type="button"
        onClick={() => {
          onChange('active');
        }}
        className={cn(
          'rounded-lg border py-1.5 text-xs font-black transition-all',
          status === 'active'
            ? 'border-emerald-600 bg-emerald-600 text-white'
            : 'border-slate-300 bg-white text-black dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
        )}
      >
        نشط (مسموح بالآجل)
      </button>
      <button
        type="button"
        onClick={() => {
          onChange('blocked');
        }}
        className={cn(
          'inline-flex items-center justify-center gap-1 rounded-lg border py-1.5 text-xs font-black transition-all',
          status === 'blocked'
            ? 'border-rose-600 bg-rose-600 text-white'
            : 'border-slate-300 bg-white text-black dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
        )}
      >
        <Lock size={12} />
        تجميد الائتمان (نقدي فقط)
      </button>
    </div>
  </div>
);

const ModalFooterButtons: React.FC<{
  onClose: () => void;
  isPending: boolean;
  submitLabel: string;
  submitCls: string;
}> = ({ onClose, isPending, submitLabel, submitCls }) => (
  <div className="flex justify-end gap-2 pt-2">
    <button
      type="button"
      onClick={onClose}
      className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-black hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
    >
      إلغاء
    </button>
    <button
      type="submit"
      disabled={isPending}
      className={cn('rounded-lg px-4 py-1.5 font-black text-white shadow-xs disabled:opacity-50', submitCls)}
    >
      {isPending ? 'جاري الحفظ...' : submitLabel}
    </button>
  </div>
);

interface CreditLimitModalProps {
  customer: EnrichedCustomerCreditRow;
  currency: string;
  onClose: () => void;
}

const CreditPolicyFields: React.FC<{
  customer: EnrichedCustomerCreditRow;
  currency: string;
  creditLimit: string;
  termsDays: string;
  onLimitChange: (v: string) => void;
  onTermsChange: (v: string) => void;
}> = ({ customer, currency, creditLimit, termsDays, onLimitChange, onTermsChange }) => (
  <>
    <div className="rounded-lg bg-slate-50 p-2.5 font-bold dark:bg-slate-800/70">
      <div className="flex justify-between">
        <span>الرصيد الحالي ({currency}):</span>
        <span dir="ltr" className="font-mono font-black text-rose-700">{formatCurrency(customer.balance, currency)}</span>
      </div>
      <div className="mt-1 flex justify-between">
        <span>التصنيف الائتماني:</span>
        <span className="font-mono font-black">{customer.creditGrade} ({String(customer.creditScore)} / 100)</span>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <label className="block">
        <span className="mb-1 block font-black">السقف الائتماني ({currency})</span>
        <input type="number" min={0} step="any" value={creditLimit} onChange={e => { onLimitChange(e.target.value); }} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono font-black text-black outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
      </label>
      <label className="block">
        <span className="mb-1 block font-black">مدة السداد (أيام)</span>
        <input type="number" min={1} max={365} value={termsDays} onChange={e => { onTermsChange(e.target.value); }} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono font-black text-black outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
      </label>
    </div>
  </>
);

export const CreditLimitQuickModal: React.FC<CreditLimitModalProps> = ({ customer, currency, onClose }) => {
  const [creditLimit, setCreditLimit] = useState(String(customer.credit_limit));
  const [termsDays, setTermsDays] = useState(String(customer.payment_terms_days || 30));
  const [status, setStatus] = useState<'active' | 'blocked'>(customer.status === 'blocked' ? 'blocked' : 'active');
  const { mutate: updatePolicy, isPending } = useUpdatePartyCreditPolicy();

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>): void => {
    e.preventDefault();
    updatePolicy(
      { partyId: customer.party_id, creditLimit: Math.max(0, Number(creditLimit) || 0), paymentTermsDays: Math.max(1, Number(termsDays) || 30), status },
      { onSuccess: onClose }
    );
  };

  return (
    <ModalShell title={`إدارة السياسة الائتمانية: ${customer.name}`} icon={<ShieldCheck size={17} className="text-blue-600" />} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <CreditPolicyFields customer={customer} currency={currency} creditLimit={creditLimit} termsDays={termsDays} onLimitChange={setCreditLimit} onTermsChange={setTermsDays} />
        <CreditStatusToggle status={status} onChange={setStatus} />
        <ModalFooterButtons onClose={onClose} isPending={isPending} submitLabel="حفظ السياسة الائتمانية" submitCls="bg-blue-600 hover:bg-blue-700" />
      </form>
    </ModalShell>
  );
};

const PromiseFields: React.FC<{
  subject: string;
  scheduledDate: string;
  priority: 'normal' | 'high' | 'urgent';
  description: string;
  onSubject: (v: string) => void;
  onDate: (v: string) => void;
  onPriority: (v: 'normal' | 'high' | 'urgent') => void;
  onDescription: (v: string) => void;
}> = ({ subject, scheduledDate, priority, description, onSubject, onDate, onPriority, onDescription }) => (
  <>
    <label className="block">
      <span className="mb-1 block font-black">عنوان المتابعة / وعد السداد</span>
      <input type="text" required value={subject} onChange={e => { onSubject(e.target.value); }} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-black outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
    </label>
    <div className="grid grid-cols-2 gap-2">
      <label className="block">
        <span className="mb-1 block font-black">تاريخ السداد المتوقع</span>
        <input type="date" required value={scheduledDate} onChange={e => { onDate(e.target.value); }} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono font-bold text-black outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
      </label>
      <label className="block">
        <span className="mb-1 block font-black">الأولوية</span>
        <select value={priority} onChange={e => { onPriority(e.target.value as 'normal' | 'high' | 'urgent'); }} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-black outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
          <option value="normal">عادية</option>
          <option value="high">مرتفعة</option>
          <option value="urgent">عاجلة</option>
        </select>
      </label>
    </div>
    <label className="block">
      <span className="mb-1 block font-black">تفاصيل الاتفاق (اختياري)</span>
      <textarea rows={2} value={description} onChange={e => { onDescription(e.target.value); }} placeholder="مثال: وعد العميل بتحويل دفعة عبر الكريمي يوم السبت..." className="w-full resize-none rounded-lg border border-slate-300 bg-white p-2 font-bold text-black outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
    </label>
  </>
);

interface PromiseModalProps {
  customer: EnrichedCustomerCreditRow;
  currency: string;
  onClose: () => void;
}

export const PromiseToPayModal: React.FC<PromiseModalProps> = ({ customer, currency, onClose }) => {
  const [scheduledDate, setScheduledDate] = useState(new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10));
  const [subject, setSubject] = useState(`وعد سداد مبلغ ${formatCurrency(customer.overdue_amount > 0 ? customer.overdue_amount : customer.balance, currency)}`);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>(customer.max_days_overdue > 60 ? 'urgent' : 'high');
  const { mutate: logPromise, isPending } = useLogCreditPromise();

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (subject.trim().length === 0) return;
    logPromise({ customerId: customer.party_id, subject, description, scheduledDate, priority }, { onSuccess: onClose });
  };

  return (
    <ModalShell title={`تسجيل وعد سداد: ${customer.name}`} icon={<CalendarClock size={17} className="text-indigo-600" />} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <PromiseFields subject={subject} scheduledDate={scheduledDate} priority={priority} description={description} onSubject={setSubject} onDate={setScheduledDate} onPriority={setPriority} onDescription={setDescription} />
        <ModalFooterButtons onClose={onClose} isPending={isPending} submitLabel="حفظ وعد السداد" submitCls="bg-indigo-600 hover:bg-indigo-700" />
      </form>
    </ModalShell>
  );
};
