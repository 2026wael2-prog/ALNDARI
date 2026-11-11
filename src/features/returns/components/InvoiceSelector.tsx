import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileText,
  Search,
  X,
  ChevronDown,
  Calendar,
  User,
  Package,
  Check,
  Receipt,
  RotateCcw,
} from 'lucide-react';
import type { Invoice, InvoiceItem } from '../types';
import { formatCurrency, normalizeSearch } from '../../../core/utils';

interface InvoiceSelectorProps {
  invoices: Invoice[];
  selectedInvoiceId: string;
  onSelectInvoice: (invoiceId: string) => void;
  placeholder?: string;
}

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB');
};

const getItemDetails = (item: InvoiceItem) => {
  const name = item.product?.name_ar || item.name || item.description || 'صنف غير محدد';
  const partNumber = item.product?.part_number || null;
  const brand = item.product?.brand || null;
  const sku = item.product?.sku || null;
  return { name, partNumber, brand, sku };
};

interface InvoiceOptionListProps {
  invoices: Invoice[];
  selectedInvoiceId: string;
  onSelect: (id: string) => void;
}

const InvoiceOptionList: React.FC<InvoiceOptionListProps> = ({
  invoices,
  selectedInvoiceId,
  onSelect,
}) => (
  <div className="custom-scrollbar max-h-[460px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
    {invoices.length === 0 ? (
      <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
        <FileText size={36} className="mb-2 text-slate-400 opacity-30" />
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">لا توجد فواتير مطابقة</p>
        <p className="mt-1 text-xs text-slate-400">
          تأكد من رقم الفاتورة أو اسم العميل/المورد أو رقم القطعة
        </p>
      </div>
    ) : (
      invoices.map(invoice => {
        const isSelected = invoice.id === selectedInvoiceId;
        const items = invoice.invoice_items || [];
        const isCash = invoice.payment_method === 'cash';

        return (
          <button
            key={invoice.id}
            type="button"
            onClick={() => {
              onSelect(invoice.id);
            }}
            className={`group w-full p-3.5 text-right transition-all hover:bg-blue-50/70 dark:hover:bg-blue-900/20 max-md:p-3 ${
              isSelected
                ? 'bg-blue-50 ring-1 ring-inset ring-blue-500/30 dark:bg-blue-950/40'
                : ''
            }`}
          >
            {/* Top Row: Invoice Number, Badges, Amount */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                  <FileText size={15} />
                </span>
                <span
                  dir="ltr"
                  className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400"
                >
                  {invoice.invoice_number}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isCash
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                  }`}
                >
                  {isCash ? 'نقدي' : 'أجل'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  dir="ltr"
                  className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400"
                >
                  {formatCurrency(invoice.total_amount, invoice.currency_code ?? 'SAR')}
                </span>
                {isSelected && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </div>
            </div>

            {/* Middle Row: Customer/Supplier & Date */}
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                <User size={13} className="shrink-0 text-slate-400" />
                <span className="font-semibold">{invoice.party?.name ?? 'عميل نقدي'}</span>
              </div>
              <div className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                <Calendar size={12} />
                <span>{formatDate(invoice.issue_date)}</span>
              </div>
            </div>

            {/* Bottom Row: Detailed Items and Parts Preview */}
            {items.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100/80 pt-2 dark:border-slate-800/80">
                <span className="ml-1 text-[10px] font-bold text-slate-400">
                  الأصناف ({items.length}):
                </span>
                {items.slice(0, 3).map((item, idx) => {
                  const details = getItemDetails(item);
                  return (
                    <span
                      key={item.id || idx}
                      className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-800 ring-1 ring-slate-200/60 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
                    >
                      <Package size={11} className="shrink-0 text-blue-500 dark:text-blue-400" />
                      <span className="max-w-[140px] truncate font-semibold" title={details.name}>
                        {details.name}
                      </span>
                      {details.partNumber && (
                        <span className="font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                          [{details.partNumber}]
                        </span>
                      )}
                      <span className="font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        ×{item.quantity}
                      </span>
                    </span>
                  );
                })}
                {items.length > 3 && (
                  <span className="self-center text-[10px] font-bold text-blue-600 dark:text-blue-400">
                    +{items.length - 3} أصناف أخرى
                  </span>
                )}
              </div>
            )}
          </button>
        );
      })
    )}
  </div>
);

const InvoiceSelector: React.FC<InvoiceSelectorProps> = ({
  invoices,
  selectedInvoiceId,
  onSelectInvoice,
  placeholder = 'اختر الفاتورة الأصلية...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto-focus search input
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filteredInvoices = useMemo(() => {
    // Sort invoices by date descending
    const sorted = [...invoices].sort((a, b) => {
      const dateA = new Date(a.issue_date || 0).getTime();
      const dateB = new Date(b.issue_date || 0).getTime();
      if (dateB !== dateA) return dateB - dateA;
      return (b.invoice_number || '').localeCompare(a.invoice_number || '', undefined, {
        numeric: true,
      });
    });

    const term = normalizeSearch(searchTerm);
    if (!term) return sorted;

    return sorted.filter((invoice): boolean => {
      const matchInvoice =
        normalizeSearch(invoice.invoice_number).includes(term) ||
        normalizeSearch(invoice.party?.name).includes(term) ||
        normalizeSearch(formatDate(invoice.issue_date)).includes(term);

      const matchItems = invoice.invoice_items?.some((item): boolean => {
        const name = normalizeSearch(item.product?.name_ar || item.name || item.description || '');
        const partNo = normalizeSearch(item.product?.part_number || '');
        const sku = normalizeSearch(item.product?.sku || '');
        const brand = normalizeSearch(item.product?.brand || '');
        const code = normalizeSearch(item.product_id || '');
        const price = normalizeSearch(item.unit_price?.toString() || '');
        return (
          name.includes(term) ||
          partNo.includes(term) ||
          sku.includes(term) ||
          brand.includes(term) ||
          code.includes(term) ||
          price.includes(term)
        );
      });

      return matchInvoice || matchItems === true;
    });
  }, [invoices, searchTerm]);

  const selectedInvoice = useMemo(() => {
    return invoices.find(inv => inv.id === selectedInvoiceId);
  }, [invoices, selectedInvoiceId]);

  return (
    <div className="relative" ref={containerRef}>
      <p className="mb-2 block text-sm font-bold text-gray-700 dark:text-gray-300">
        الفاتورة الأصلية <span className="text-red-500">*</span>
      </p>

      {/* Trigger Button / Card */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        className="w-full text-right outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        {selectedInvoice ? (
          <div className="flex w-full items-center justify-between rounded-xl border-2 border-blue-500/30 bg-blue-50/20 p-3.5 transition-all hover:border-blue-500/50 hover:bg-blue-50/30 dark:border-blue-500/40 dark:bg-blue-950/20 max-md:p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                <Receipt size={20} />
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <span
                    dir="ltr"
                    className="font-mono text-sm font-bold text-blue-700 dark:text-blue-300"
                  >
                    {selectedInvoice.invoice_number}
                  </span>
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    {selectedInvoice.payment_method === 'cash' ? 'نقدي' : 'أجل'}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedInvoice.party?.name ?? 'عميل نقدي'}
                  </span>
                  <span>•</span>
                  <span className="font-mono">{formatDate(selectedInvoice.issue_date)}</span>
                  <span>•</span>
                  <span>{selectedInvoice.invoice_items?.length ?? 0} أصناف</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                dir="ltr"
                className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400"
              >
                {formatCurrency(
                  selectedInvoice.total_amount,
                  selectedInvoice.currency_code ?? 'SAR'
                )}
              </span>
              <span className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-blue-600 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400">
                تغيير
                <ChevronDown
                  size={14}
                  className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </span>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 text-sm font-bold transition-all hover:border-blue-400 hover:bg-blue-50/20 dark:border-slate-700 dark:bg-slate-800/50 max-md:p-3">
            <div className="flex items-center gap-2.5 text-slate-500 dark:text-slate-400">
              <Receipt size={18} className="text-blue-500" />
              <span>{placeholder}</span>
            </div>
            <ChevronDown
              size={18}
              className={`transition-transform ${isOpen ? 'rotate-180' : ''} text-slate-400`}
            />
          </div>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute z-50 mt-2 max-h-[540px] w-full overflow-hidden rounded-2xl border-2 border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          {/* Search Header */}
          <div className="border-b border-slate-100 bg-slate-50/80 p-3 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/90 max-md:p-3">
            <div className="relative">
              <Search
                className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                }}
                placeholder="البحث برقم الفاتورة، اسم العميل، أو الصنف..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pe-9 ps-10 text-sm font-medium outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:focus:ring-blue-900/30"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                  }}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1 text-[11px]">
                <RotateCcw size={12} className="text-blue-500" />
                مرتبة بالأحدث أولاً — يدعم البحث برقم القطعة واسم الصنف
              </span>
              <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">
                {filteredInvoices.length} من {invoices.length}
              </span>
            </div>
          </div>

          {/* Invoice List */}
          <InvoiceOptionList
            invoices={filteredInvoices}
            selectedInvoiceId={selectedInvoiceId}
            onSelect={id => {
              onSelectInvoice(id);
              setIsOpen(false);
              setSearchTerm('');
            }}
          />

          {/* Footer */}
          {filteredInvoices.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50/90 px-4 py-2 text-center text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/90">
              اختر الفاتورة للبدء في تحديد الكميات والأصناف المراد إرجاعها
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InvoiceSelector;
