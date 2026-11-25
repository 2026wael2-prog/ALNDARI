import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  Car,
  Receipt,
  ArrowLeftRight,
  Search,
  Loader2,
  PlusCircle,
} from 'lucide-react';
import { chatService } from '../services/chatService';
import { useAuthStore } from '../../auth/store';
import type { EntityCardMetadata } from '../types';
import { parseError } from '../../../core/utils/errorUtils';
import { useFeedbackStore } from '../../feedback/store';
import {
  buildInvoiceCardMetadata,
  buildNewTransferRequestMetadata,
  buildProductCardMetadata,
  buildTransferCardMetadata,
  buildVinCardMetadata,
  type BranchItem,
  type ChatProductResult,
  type ChatSearchResult,
  type ChatVinResult,
  type EntityShareTab,
} from './entity-share/entityShareTypes';
import {
  EntitySearchResultsList,
  TransferRequestForm,
} from './entity-share/EntitySearchViews';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectEntity: (metadata: EntityCardMetadata, isActionRequest?: boolean) => void;
}

const ENTITY_TABS: Array<{ id: EntityShareTab; label: string; icon: React.ReactNode }> = [
  { id: 'product', label: 'قطعة غيار', icon: <Package size={14} /> },
  { id: 'transfer', label: 'مناقلة مخزون', icon: <ArrowLeftRight size={14} /> },
  { id: 'vin', label: 'رقم هيكل VIN', icon: <Car size={14} /> },
  { id: 'invoice', label: 'فاتورة', icon: <Receipt size={14} /> },
];

const SEARCH_PLACEHOLDERS: Record<EntityShareTab, string> = {
  product: 'ابحث باسم القطعة، رقم الصنف أو SKU...',
  vin: 'ابحث برقم الهيكل VIN...',
  invoice: 'ابحث برقم الفاتورة...',
  transfer: 'ابحث برقم المناقلة...',
};

export const EntityShareModal: React.FC<Props> = ({ isOpen, onClose, onSelectEntity }) => {
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const [activeTab, setActiveTab] = useState<EntityShareTab>('product');
  const [transferMode, setTransferMode] = useState<'search' | 'new'>('new');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ChatSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [targetBranchId, setTargetBranchId] = useState('');
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [transferQty, setTransferQty] = useState(1);
  const [selectedProductForTransfer, setSelectedProductForTransfer] =
    useState<ChatProductResult | null>(null);

  const companyId = user?.company_id;

  useEffect(() => {
    if (!companyId) return;
    chatService
      .getCompanyBranches(companyId)
      .then(data => {
        if (data) setBranches(data);
      })
      .catch((err: unknown) => {
        showToast(parseError(err).message, 'error');
      });
  }, [companyId, showToast]);

  useEffect(() => {
    if (!isOpen || !companyId || !search.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        if (activeTab === 'product' || (activeTab === 'transfer' && transferMode === 'new')) {
          setResults(await chatService.searchProducts(companyId, search));
        } else if (activeTab === 'vin') {
          setResults((await chatService.searchVins(companyId, search)) as unknown as ChatVinResult[]);
        } else if (activeTab === 'invoice') {
          setResults(await chatService.searchInvoices(companyId, search));
        } else if (activeTab === 'transfer' && transferMode === 'search') {
          setResults(await chatService.searchTransfers(companyId, search));
        }
      } catch (err) {
        setResults([]);
        showToast(parseError(err).message, 'error');
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [search, activeTab, transferMode, companyId, isOpen, showToast]);

  if (!isOpen) return null;

  const emitAndClose = (metadata: EntityCardMetadata, isActionRequest = false) => {
    onSelectEntity(metadata, isActionRequest);
    onClose();
  };

  const handleCreateTransferRequest = () => {
    if (!selectedProductForTransfer || !targetBranchId) return;
    const targetBranch = branches.find(b => b.id === targetBranchId);
    emitAndClose(
      buildNewTransferRequestMetadata({
        product: selectedProductForTransfer,
        fromBranchName: user?.branch_name || 'الفرع الحالي',
        targetBranchId,
        targetBranchName: targetBranch?.name || 'الفرع المستهدف',
        quantity: transferQty,
      }),
      true
    );
  };

  return (
    <div className="animate-in fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm duration-200 sm:items-center sm:p-4">
      <div className="flex h-[82dvh] max-h-[520px] w-full max-w-lg flex-col rounded-t-2xl border border-[var(--app-border)] bg-[var(--app-surface)] pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-2xl sm:pb-0">
        <div className="flex items-center justify-between border-b border-[var(--app-border)] p-3 sm:p-4">
          <h3 className="text-base font-bold text-[var(--app-text)]">
            مشاركة بطاقة ERP في المحادثة
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="bg-[var(--app-bg)]/50 flex gap-1.5 border-b border-[var(--app-border)] p-2">
          {ENTITY_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setSearch('');
                setResults([]);
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-[var(--app-surface)] text-[var(--accent)] shadow-sm'
                  : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab !== 'transfer' || transferMode === 'search' ? (
            <div className="space-y-3">
              {activeTab === 'transfer' && (
                <div className="mb-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTransferMode('new');
                      setSearch('');
                      setResults([]);
                    }}
                    className="bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-[var(--accent)] transition-all"
                  >
                    <PlusCircle size={14} /> طلب مناقلة جديد
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTransferMode('search');
                      setSearch('');
                      setResults([]);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-1.5 text-xs font-bold text-[var(--app-text)]"
                  >
                    <Search size={14} /> بحث في المناقلات القائمة
                  </button>
                </div>
              )}

              <div className="relative">
                <Search
                  size={16}
                  className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)]"
                />
                <input
                  type="text"
                  placeholder={SEARCH_PLACEHOLDERS[activeTab]}
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                  }}
                  className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] py-2 pe-3 ps-9 text-sm text-[var(--app-text)] outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
              </div>

              {isLoading && (
                <div className="flex items-center justify-center py-10 text-[var(--app-text-secondary)]">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              )}

              {!isLoading && results.length === 0 && search.trim() !== '' && (
                <div className="py-10 text-center text-xs text-[var(--app-text-secondary)]">
                  لا توجد نتائج مطابقة
                </div>
              )}

              <EntitySearchResultsList
                activeTab={activeTab}
                transferMode={transferMode}
                results={results}
                onSelectProduct={item => {
                  emitAndClose(buildProductCardMetadata(item));
                }}
                onSelectVin={item => {
                  emitAndClose(buildVinCardMetadata(item));
                }}
                onSelectInvoice={item => {
                  emitAndClose(buildInvoiceCardMetadata(item));
                }}
                onSelectTransfer={item => {
                  emitAndClose(buildTransferCardMetadata(item));
                }}
              />
            </div>
          ) : (
            <TransferRequestForm
              search={search}
              onSearchChange={setSearch}
              isLoading={isLoading}
              results={results as ChatProductResult[]}
              selectedProduct={selectedProductForTransfer}
              onSelectProduct={setSelectedProductForTransfer}
              branches={branches}
              targetBranchId={targetBranchId}
              onTargetBranchChange={setTargetBranchId}
              quantity={transferQty}
              onQuantityChange={setTransferQty}
              onSwitchToSearch={() => {
                setTransferMode('search');
                setSearch('');
                setResults([]);
              }}
              onSubmit={handleCreateTransferRequest}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default EntityShareModal;
