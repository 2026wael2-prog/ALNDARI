import React, { useEffect, useState } from 'react';
import { X, Banknote } from 'lucide-react';
import { useCreatePayment } from '../hooks';
import { useParties } from '../../parties/hooks';
import type { Party } from '../../parties/types';
import {
  useCashPaymentAccounts,
  useExchangePaymentAccounts,
  type PaymentAccount,
} from '../../accounting/hooks/usePaymentAccounts';
import { formatLocalDate } from '../../../core/utils';
import {
  SupplierPicker,
  PaymentFields,
  TreasuryPicker,
  PaymentFooter,
} from './payment/PaymentFormSections';

interface CreatePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreatePaymentModal: React.FC<CreatePaymentModalProps> = ({ isOpen, onClose }) => {
  const { mutate: createPayment, isPending } = useCreatePayment();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => formatLocalDate());
  const [method, setMethod] = useState<'cash' | 'bank'>('cash');
  const [notes, setNotes] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Party | null>(null);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [treasuryAccountId, setTreasuryAccountId] = useState<string | null>(null);
  const { data: suppliers } = useParties('supplier', supplierQuery);
  // نقداً → الصناديق النشطة، بنكياً → شركات الصرافة المرتبطة بحسابات دفترية
  const { data: cashAccounts } = useCashPaymentAccounts();
  const { data: exchangeAccounts } = useExchangePaymentAccounts();
  const treasuryOptions: PaymentAccount[] =
    method === 'bank' ? (exchangeAccounts ?? []) : (cashAccounts ?? []);

  // إبقاء الاختيار صالحاً عند تغيير طريقة الدفع أو تحميل القوائم، مع افتراضي أول حساب
  useEffect(() => {
    setTreasuryAccountId(prev =>
      prev !== null && treasuryOptions.some(account => account.id === prev)
        ? prev
        : (treasuryOptions[0]?.id ?? null)
    );
  }, [method, treasuryOptions.length]);

  const handleTreasurySelect = (id: string): void => {
    setTreasuryAccountId(id !== '' ? id : null);
  };

  const handleSubmit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (selectedSupplier === null || amount === '' || treasuryAccountId === null) return;
    createPayment(
      {
        supplierId: selectedSupplier.id,
        amount: parseFloat(amount),
        date,
        method,
        notes,
        treasuryAccountId,
      },
      {
        onSuccess: () => {
          onClose();
          setAmount('');
          setSelectedSupplier(null);
          setSupplierQuery('');
          setNotes('');
          setMethod('cash');
        },
      }
    );
  };
  const selectSupplier = (supplier: Party): void => {
    setSelectedSupplier(supplier);
    setSupplierQuery('');
    setIsDropdownOpen(false);
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="animate-in fade-in zoom-in my-auto w-full max-w-lg rounded-none border bg-[var(--app-surface)] shadow-2xl duration-200 dark:border-slate-800">
        <div className="flex items-center justify-between rounded-none border-b border-gray-100 bg-gray-50/50 p-6 dark:border-slate-800 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-purple-600/10 p-2 text-purple-600">
              <Banknote size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">سند صرف جديد</h2>
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                تسجيل دفعة نقدية أو بنكية للمورد
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-red-500"
          >
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          <SupplierPicker
            selectedSupplier={selectedSupplier}
            supplierQuery={supplierQuery}
            isDropdownOpen={isDropdownOpen}
            suppliers={suppliers}
            onQueryChange={query => {
              setSupplierQuery(query);
              setIsDropdownOpen(true);
            }}
            onSelect={selectSupplier}
            onClear={() => {
              setSelectedSupplier(null);
            }}
          />
          <PaymentFields
            amount={amount}
            method={method}
            date={date}
            onAmountChange={setAmount}
            onMethodChange={setMethod}
            onDateChange={setDate}
          />
          <TreasuryPicker
            accounts={treasuryOptions}
            selectedId={treasuryAccountId}
            onSelect={handleTreasurySelect}
          />
          <div className="space-y-2">
            <label
              htmlFor="purchase-payment-notes"
              className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500"
            >
              البيان / الوصف
            </label>
            <textarea
              id="purchase-payment-notes"
              value={notes}
              onChange={event => {
                setNotes(event.target.value);
              }}
              className="h-28 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-4 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200"
            />
          </div>
          <PaymentFooter
            isPending={isPending}
            canSubmit={selectedSupplier !== null && amount !== '' && treasuryAccountId !== null}
            onClose={onClose}
          />
        </form>
      </div>
    </div>
  );
};

export default CreatePaymentModal;
