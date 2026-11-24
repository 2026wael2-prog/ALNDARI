import React from 'react';
import { Calendar, Coins, CreditCard, Hash, Wallet, Warehouse } from 'lucide-react';
import type { PaymentAccount } from '../../../../accounting/hooks/usePaymentAccounts';
import type { Warehouse as WarehouseType } from '../../../../inventory/types';
import { MetaBlock } from './MetaBlock';
import { ExchangeRateBlock } from './ExchangeRateBlock';

export interface MetadataGridProps {
  issueDate: string;
  invoiceNumber: string;
  invoiceType: string;
  cashboxId: string;
  warehouseId: string;
  currency: string;
  exchangeRate: number;
  isDivide: boolean;
  notes: string;
  paymentAccounts: PaymentAccount[];
  warehouses: WarehouseType[];
  currencies: Array<{ code: string }>;
  onChange: (field: string, value: string) => void;
  onRateChange: (value: number) => void;
}

export const MetadataGrid: React.FC<MetadataGridProps> = ({
  issueDate,
  invoiceNumber,
  invoiceType,
  cashboxId,
  warehouseId,
  currency,
  exchangeRate,
  isDivide,
  notes,
  paymentAccounts,
  warehouses,
  currencies,
  onChange,
  onRateChange,
}) => (
  <div className="flex flex-col divide-y divide-blue-100/70 dark:divide-slate-800">
    {/* شريط 1: التاريخ + رقم الفاتورة + نوع الفاتورة */}
    <div className="grid grid-cols-2 divide-x divide-x-reverse divide-blue-100/70 dark:divide-slate-800 sm:grid-cols-3">
      <MetaBlock
        label="التاريخ"
        field="issueDate"
        value={issueDate}
        icon={Calendar}
        type="date"
        colorClass="text-emerald-500"
        onChange={onChange}
      />
      <MetaBlock
        label="رقم الفاتورة"
        field="invoiceNumber"
        value={invoiceNumber}
        icon={Hash}
        type="input"
        colorClass="text-blue-600"
        onChange={onChange}
      />
      <div className="col-span-2 border-t border-blue-100/70 dark:border-slate-800 sm:col-span-1 sm:border-t-0">
        <MetaBlock
          label="نوع الفاتورة"
          field="invoiceType"
          value={invoiceType}
          icon={CreditCard}
          isSelect
          options={[
            { id: 'cash', label: 'نقدي' },
            { id: 'credit', label: 'آجل' },
          ]}
          onChange={onChange}
        />
      </div>
    </div>

    {/* شريط 2: المستودع + الصندوق/البنك + العملة + سعر الصرف */}
    <div className="grid grid-cols-2 divide-x divide-x-reverse divide-blue-100/70 dark:divide-slate-800 md:grid-cols-4">
      <MetaBlock
        label="المستودع"
        field="warehouseId"
        value={warehouseId}
        icon={Warehouse}
        isSelect
        options={warehouses.map(warehouse => ({ id: warehouse.id, label: warehouse.name_ar }))}
        onChange={onChange}
      />
      <MetaBlock
        label="الصندوق / البنك"
        field="cashboxId"
        value={cashboxId}
        icon={Wallet}
        isSelect
        options={paymentAccounts.map(account => ({ id: account.id, label: account.name_ar }))}
        onChange={onChange}
      />
      <MetaBlock
        label="العملة"
        field="currency"
        value={currency}
        icon={Coins}
        isSelect
        options={
          currencies.length > 0
            ? currencies.map(item => ({ id: item.code, label: item.code }))
            : [{ id: 'SAR', label: 'SAR' }]
        }
        onChange={onChange}
      />
      <ExchangeRateBlock
        exchangeRate={exchangeRate}
        isDivide={isDivide}
        currency={currency}
        onChange={onRateChange}
      />
    </div>

    {/* شريط 3: ملاحظات التوريد */}
    <div className="bg-gray-50/50 px-2.5 py-1 dark:bg-slate-900/40">
      <div className="flex items-center gap-2">
        <label
          htmlFor="purchase-supply-notes"
          className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"
        >
          الملاحظات:
        </label>
        <input
          id="purchase-supply-notes"
          className="w-full bg-transparent text-[11px] font-bold text-slate-800 outline-none placeholder:font-normal placeholder:text-slate-400 dark:text-slate-200 max-md:text-[10px]"
          placeholder="أدخل أي ملاحظات إضافية للتوريد..."
          value={notes}
          onChange={event => {
            onChange('notes', event.target.value);
          }}
        />
      </div>
    </div>
  </div>
);
