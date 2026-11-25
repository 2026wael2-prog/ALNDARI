import React from 'react';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { formatCurrency } from '../../../../core/utils';
import type {
  BranchItem,
  ChatInvoiceResult,
  ChatProductResult,
  ChatSearchResult,
  ChatTransferResult,
  ChatVinResult,
  EntityShareTab,
} from './entityShareTypes';

interface EntitySearchResultsListProps {
  activeTab: EntityShareTab;
  transferMode: 'search' | 'new';
  results: ChatSearchResult[];
  onSelectProduct: (item: ChatProductResult) => void;
  onSelectVin: (item: ChatVinResult) => void;
  onSelectInvoice: (item: ChatInvoiceResult) => void;
  onSelectTransfer: (item: ChatTransferResult) => void;
}

export const EntitySearchResultsList: React.FC<EntitySearchResultsListProps> = ({
  activeTab,
  transferMode,
  results,
  onSelectProduct,
  onSelectVin,
  onSelectInvoice,
  onSelectTransfer,
}) => (
  <div className="space-y-2">
    {activeTab === 'product' &&
      (results as ChatProductResult[]).map(item => (
        <div
          key={item.id}
          onClick={() => {
            onSelectProduct(item);
          }}
          className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--app-border)] p-3 transition-all hover:border-[var(--accent)] hover:bg-[var(--app-surface-hover)]"
        >
          <div>
            <span className="font-mono text-xs font-bold text-[var(--accent)]">
              {item.part_number || item.sku}
            </span>
            <p className="text-xs font-bold text-[var(--app-text)]">{item.name}</p>
            {item.brand && (
              <span className="text-[10px] text-[var(--app-text-secondary)]">{item.brand}</span>
            )}
          </div>
          <div className="text-end text-xs">
            <span className="font-bold text-emerald-600">{formatCurrency(item.sale_price)}</span>
            <span className="block text-[10px] text-[var(--app-text-secondary)]">
              المتوفر: {item.total_stock ?? item.stock ?? 0}
            </span>
          </div>
        </div>
      ))}

    {activeTab === 'vin' &&
      (results as ChatVinResult[]).map(item => (
        <div
          key={item.id}
          onClick={() => {
            onSelectVin(item);
          }}
          className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--app-border)] p-3 transition-all hover:border-[var(--accent)] hover:bg-[var(--app-surface-hover)]"
        >
          <div>
            <span className="font-mono text-xs font-bold text-[var(--app-text)]">{item.vin}</span>
            <p className="text-xs text-[var(--app-text-secondary)]">
              {item.decoded?.make} {item.decoded?.model} {item.decoded?.year}
            </p>
          </div>
        </div>
      ))}

    {activeTab === 'invoice' &&
      (results as ChatInvoiceResult[]).map(item => (
        <div
          key={item.id}
          onClick={() => {
            onSelectInvoice(item);
          }}
          className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--app-border)] p-3 transition-all hover:border-[var(--accent)] hover:bg-[var(--app-surface-hover)]"
        >
          <div>
            <span className="font-mono text-xs font-bold text-[var(--app-text)]">
              {item.invoice_number}
            </span>
            <p className="text-xs text-[var(--app-text-secondary)]">
              {item.customer_name || 'عميل نقدي'}
            </p>
          </div>
          <div className="text-end font-bold text-emerald-600">{formatCurrency(item.total)}</div>
        </div>
      ))}

    {activeTab === 'transfer' &&
      transferMode === 'search' &&
      (results as ChatTransferResult[]).map(item => (
        <div
          key={item.id}
          onClick={() => {
            onSelectTransfer(item);
          }}
          className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--app-border)] p-3 transition-all hover:border-[var(--accent)] hover:bg-[var(--app-surface-hover)]"
        >
          <div>
            <span className="font-mono text-xs font-bold text-[var(--accent)]">
              {item.transfer_number}
            </span>
            <p className="text-xs text-[var(--app-text-secondary)]">
              {item.from_warehouse} ➔ {item.to_warehouse}
            </p>
          </div>
          <div className="text-end text-[10px] font-semibold text-[var(--app-text-secondary)]">
            {item.status === 'completed'
              ? 'مكتملة'
              : item.status === 'approved'
                ? 'معتمدة'
                : 'قيد الانتظار'}
          </div>
        </div>
      ))}
  </div>
);

interface TransferRequestFormProps {
  search: string;
  onSearchChange: (val: string) => void;
  isLoading: boolean;
  results: ChatProductResult[];
  selectedProduct: ChatProductResult | null;
  onSelectProduct: (product: ChatProductResult | null) => void;
  branches: BranchItem[];
  targetBranchId: string;
  onTargetBranchChange: (branchId: string) => void;
  quantity: number;
  onQuantityChange: (qty: number) => void;
  onSwitchToSearch: () => void;
  onSubmit: () => void;
}

export const TransferRequestForm: React.FC<TransferRequestFormProps> = ({
  search,
  onSearchChange,
  isLoading,
  results,
  selectedProduct,
  onSelectProduct,
  branches,
  targetBranchId,
  onTargetBranchChange,
  quantity,
  onQuantityChange,
  onSwitchToSearch,
  onSubmit,
}) => (
  <div className="space-y-3.5 text-xs">
    <div className="mb-1 flex items-center justify-between">
      <span className="font-bold text-[var(--app-text)]">طلب مناقلة صنف جديد</span>
      <button
        type="button"
        onClick={onSwitchToSearch}
        className="text-[11px] font-semibold text-[var(--accent)] hover:underline"
      >
        بحث في المناقلات القائمة ➔
      </button>
    </div>

    <div>
      <label className="mb-1 block font-semibold text-[var(--app-text-secondary)]">
        اختر القطعة المطلوب مناقلتها:
      </label>
      {!selectedProduct ? (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="ابحث عن الصنف بالاسم أو رقم القطعة أو SKU..."
            value={search}
            onChange={e => {
              onSearchChange(e.target.value);
            }}
            className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-xs outline-none focus:border-[var(--accent)]"
          />
          {isLoading && (
            <div className="flex items-center justify-center py-4 text-[var(--app-text-secondary)]">
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}
          <div className="max-h-36 space-y-1 overflow-y-auto">
            {results.map(p => (
              <div
                key={p.id}
                onClick={() => {
                  onSelectProduct(p);
                }}
                className="hover:bg-[var(--accent)]/10 flex cursor-pointer items-center justify-between rounded-lg bg-[var(--app-bg)] p-2"
              >
                <div>
                  <span className="font-mono font-bold">{p.part_number || p.sku}</span>
                  <p className="text-[11px] text-[var(--app-text)]">{p.name}</p>
                </div>
                <span className="text-[10px] font-bold text-emerald-600">
                  متوفر: {p.total_stock ?? p.stock ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5">
          <div>
            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
              {selectedProduct.part_number || selectedProduct.sku}
            </span>
            <p className="text-[11px] font-semibold">{selectedProduct.name}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelectProduct(null);
            }}
            className="text-xs font-bold text-rose-500 hover:underline"
          >
            تغيير
          </button>
        </div>
      )}
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="mb-1 block font-semibold text-[var(--app-text-secondary)]">
          الفرع المستهدف:
        </label>
        <select
          value={targetBranchId}
          onChange={e => {
            onTargetBranchChange(e.target.value);
          }}
          className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-xs outline-none"
        >
          <option value="">-- اختر الفرع --</option>
          {branches.map(b => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block font-semibold text-[var(--app-text-secondary)]">
          الكمية المطلوبة:
        </label>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={e => {
            onQuantityChange(Math.max(1, parseInt(e.target.value, 10) || 1));
          }}
          className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-xs outline-none"
        />
      </div>
    </div>

    <button
      type="button"
      onClick={onSubmit}
      disabled={!selectedProduct || !targetBranchId}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-2.5 font-bold text-white shadow-md transition-all hover:opacity-90 disabled:opacity-40"
    >
      <ArrowLeftRight size={16} /> إرسال طلب المناقلة في المحادثة
    </button>
  </div>
);
