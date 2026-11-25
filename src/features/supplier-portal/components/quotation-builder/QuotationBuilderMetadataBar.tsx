import React from 'react';
import { Plus, Search } from 'lucide-react';
import { formatCurrency } from '../../../../core/utils';
import type { VendorProductItem } from '../../types';

interface QuotationBuilderMetadataBarProps {
  currency: string;
  onCurrencyChange: (value: string) => void;
  leadTimeDays: number;
  onLeadTimeDaysChange: (value: number) => void;
  warrantyDays: number;
  onWarrantyDaysChange: (value: number) => void;
  validityDate: string;
  onValidityDateChange: (value: string) => void;
  productSearch: string;
  onProductSearchChange: (value: string) => void;
  isAddingProduct: boolean;
  onFocusSearch: () => void;
  filteredAvailableProducts: VendorProductItem[];
  onAddProduct: (product: VendorProductItem) => void;
}

export const QuotationBuilderMetadataBar: React.FC<QuotationBuilderMetadataBarProps> = ({
  currency,
  onCurrencyChange,
  leadTimeDays,
  onLeadTimeDaysChange,
  warrantyDays,
  onWarrantyDaysChange,
  validityDate,
  onValidityDateChange,
  productSearch,
  onProductSearchChange,
  isAddingProduct,
  onFocusSearch,
  filteredAvailableProducts,
  onAddProduct,
}) => (
  <>
    {/* Metadata Controls */}
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40 md:grid-cols-4">
      <div>
        <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
          العملة
        </label>
        <select
          value={currency}
          onChange={e => {
            onCurrencyChange(e.target.value);
          }}
          className="w-full rounded-lg border border-slate-200 bg-[var(--app-surface)] px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-indigo-500 dark:border-slate-700"
        >
          <option value="SAR">ريال سعودي (SAR)</option>
          <option value="YER">ريال يمني (YER)</option>
          <option value="USD">دولار أمريكي (USD)</option>
          <option value="OMR">ريال عماني (OMR)</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
          التوريد (أيام)
        </label>
        <input
          type="number"
          min="0"
          value={leadTimeDays}
          onChange={e => {
            onLeadTimeDaysChange(Number(e.target.value) || 0);
          }}
          className="w-full rounded-lg border border-slate-200 bg-[var(--app-surface)] px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-indigo-500 dark:border-slate-700"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
          الضمان (أيام)
        </label>
        <input
          type="number"
          min="0"
          value={warrantyDays}
          onChange={e => {
            onWarrantyDaysChange(Number(e.target.value) || 0);
          }}
          className="w-full rounded-lg border border-slate-200 bg-[var(--app-surface)] px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-indigo-500 dark:border-slate-700"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
          الصلاحية حتى
        </label>
        <input
          type="date"
          value={validityDate}
          onChange={e => {
            onValidityDateChange(e.target.value);
          }}
          className="w-full rounded-lg border border-slate-200 bg-[var(--app-surface)] px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-indigo-500 dark:border-slate-700"
        />
      </div>
    </div>

    {/* Quick Product Add Bar */}
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="ابحث لإضافة صنف جديد لعرض السعر بالاسم أو رقم OEM..."
            value={productSearch}
            onChange={e => {
              onProductSearchChange(e.target.value);
            }}
            onFocus={onFocusSearch}
            className="w-full rounded-lg border border-slate-200 bg-[var(--app-surface)] py-1.5 pl-3 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700"
          />
        </div>
      </div>

      {isAddingProduct && filteredAvailableProducts.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-[var(--app-surface)] shadow-lg dark:divide-slate-800 dark:border-slate-700">
          {filteredAvailableProducts.map(p => (
            <button
              key={p.product_id}
              type="button"
              onClick={() => {
                onAddProduct(p);
              }}
              className="flex w-full items-center justify-between p-2.5 text-right text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <div>
                <span className="block font-bold text-slate-900 dark:text-white">
                  {p.product_name}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  OEM: {p.oem_number || p.sku}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400"
                  dir="ltr"
                >
                  {formatCurrency(p.cost_price, currency)}
                </span>
                <Plus className="h-3.5 w-3.5 text-slate-400" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  </>
);
