import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Trash2,
  Save,
  AlertCircle,
  CheckCircle2,
  ArrowRightLeft,
  Search,
  Check,
  User,
} from 'lucide-react';
import { useInvoiceDetails, useUpdateInvoice } from '../../hooks';
import { useParties } from '../../../parties/hooks';
import { usePaymentAccounts } from '../../../accounting/hooks';
import { useProductSearch, type ProductSearchResult } from '../../hooks/useProductSearch';
import { useAuthStore } from '../../../auth/store';
import { formatCurrency, cn } from '../../../../core/utils';
import PageLoader from '../../../../ui/base/PageLoader';

interface EditItemRow {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  warehouseId?: string;
}

interface EditInvoiceModalProps {
  invoiceId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const EditInvoiceModal: React.FC<EditInvoiceModalProps> = ({
  invoiceId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuthStore();
  const companyId = user?.company_id || '';

  const { data: rawInvoice, isLoading: invoiceLoading, error: invoiceError } = useInvoiceDetails(
    invoiceId
  );
  const invoice = rawInvoice as any;

  const { mutate: updateInvoice, isPending: isUpdating } = useUpdateInvoice();
  const { data: paymentAccounts } = usePaymentAccounts();

  // Local form state
  const [partyId, setPartyId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash');
  const [paymentAccountId, setPaymentAccountId] = useState<string>('');
  const [issueDate, setIssueDate] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<EditItemRow[]>([]);
  const [showConfirm, setShowConfirm] = useState<boolean>(false);

  // Customer dropdown search
  const [partySearchQuery, setPartySearchQuery] = useState('');
  const [isPartyDropdownOpen, setIsPartyDropdownOpen] = useState(false);
  const { data: filteredParties } = useParties('all', partySearchQuery);

  // Product search state
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const { products: searchResults, isLoading: searchLoading } = useProductSearch(productSearchTerm, {
    companyId,
    debounceMs: 250,
    enabled: Boolean(companyId) && productSearchTerm.trim().length >= 2,
  });

  // Populate state when invoice is fetched
  useEffect(() => {
    if (invoice) {
      setPartyId(invoice.party_id || null);
      setCustomerName(invoice.party?.name || invoice.party_name || invoice.parties?.name || 'عميل نقدي');
      setPaymentMethod(invoice.payment_method === 'credit' ? 'credit' : 'cash');
      setPaymentAccountId(invoice.payment_account_id || '');
      setIssueDate(invoice.issue_date || '');
      setDueDate(invoice.due_date || '');
      setNotes(invoice.notes || '');

      const rawItems = invoice.invoice_items || invoice.items || [];
      const initialItems: EditItemRow[] = rawItems.map((ii: any) => {
        const qty = Number(ii.quantity || 1);
        const price = Number(ii.unit_price || ii.unitPrice || 0);
        const disc = Number(ii.discount_amount || ii.discount || 0);
        const lineNet = Math.max(0, qty * price - disc);
        const taxAmt = Number(ii.tax_amount || 0);
        const derivedTaxRate =
          ii.tax_rate != null
            ? Number(ii.tax_rate)
            : ii.taxRate != null
              ? Number(ii.taxRate)
              : taxAmt > 0 && lineNet > 0
                ? Math.round((taxAmt / lineNet) * 100 * 100) / 100
                : 0;
        return {
          productId: ii.product_id || ii.product?.id || ii.productId || '',
          name: ii.product?.name_ar || ii.product_name || ii.name || 'صنف',
          sku: ii.product?.sku || ii.sku || '',
          quantity: qty,
          unitPrice: price,
          discount: disc,
          taxRate: derivedTaxRate,
          ...(ii.warehouse_id ? { warehouseId: ii.warehouse_id } : {}),
        };
      });
      setItems(initialItems);
    }
  }, [invoice]);

  // Totals calculations
  const summary = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;

    items.forEach(item => {
      const lineNet = Math.max(0, item.quantity * item.unitPrice - item.discount);
      const lineTax = (lineNet * item.taxRate) / 100;
      subtotal += item.quantity * item.unitPrice;
      discount += item.discount;
      tax += lineTax;
    });

    const total = Math.max(0, subtotal - discount + tax);
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }, [items]);

  const oldTotal = Number(invoice?.total_amount || 0);
  const oldDocumentTotal =
    invoice?.total_document_amount != null && Number(invoice.total_document_amount) > 0
      ? Number(invoice.total_document_amount)
      : oldTotal;
  const difference = summary.total - oldDocumentTotal;
  const currencyCode = invoice?.currency_code || 'SAR';

  // Item handlers
  const handleQuantityChange = (index: number, newQty: number) => {
    if (newQty <= 0) return;
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], quantity: newQty };
      return next;
    });
  };

  const handleUnitPriceChange = (index: number, newPrice: number) => {
    if (newPrice < 0) return;
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], unitPrice: newPrice };
      return next;
    });
  };

  const handleDiscountChange = (index: number, newDiscount: number) => {
    if (newDiscount < 0) return;
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], discount: newDiscount };
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      alert('يجب أن تحتوي الفاتورة على صنف واحد على الأقل.');
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddProduct = (product: ProductSearchResult) => {
    const existingIndex = items.findIndex(i => i.productId === product.id);
    if (existingIndex >= 0) {
      handleQuantityChange(existingIndex, items[existingIndex].quantity + 1);
    } else {
      setItems(prev => [
        ...prev,
        {
          productId: product.id,
          name: product.name_ar,
          sku: product.sku || '',
          quantity: 1,
          unitPrice: Number(product.sale_price || 0),
          discount: 0,
          taxRate: 0,
        },
      ]);
    }
    setProductSearchTerm('');
    setIsProductSearchOpen(false);
  };

  const handleSave = () => {
    if (items.length === 0) {
      alert('لا يمكن حفظ فاتورة بدون أصناف.');
      return;
    }
    if (paymentMethod === 'credit' && !partyId) {
      alert('يجب تحديد العميل للفاتورة الآجلة.');
      return;
    }

    setShowConfirm(true);
  };

  const executeSave = () => {
    updateInvoice(
      {
        invoiceId,
        partyId: partyId || null,
        items: items.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount,
          taxRate: i.taxRate,
          ...(i.warehouseId ? { warehouseId: i.warehouseId } : {}),
        })),
        paymentMethod,
        treasuryAccountId: paymentAccountId || undefined,
        issueDate: issueDate || undefined,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        currency: currencyCode,
        exchangeRate: invoice?.exchange_rate || 1,
        paidAmount:
          paymentMethod === 'credit'
            ? invoice?.payment_method === 'credit' && Number(invoice?.advance_payment || 0) > 0
              ? Math.round(
                  (Number(invoice.advance_payment) / (Number(invoice?.exchange_rate) || 1)) * 100
                ) / 100
              : 0
            : summary.total,
        branchId: invoice?.branch_id || undefined,
      },
      {
        onSuccess: () => {
          setShowConfirm(false);
          onClose();
          onSuccess?.();
        },
      }
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/45 p-2 backdrop-blur-xs sm:p-4 animate-in fade-in duration-200">
      <div
        style={{ backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
        className="flex max-h-[95vh] w-full max-w-5xl flex-col rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
              <ArrowRightLeft size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-[var(--app-text)]">
                  تعديل فاتورة مبيعات {invoice?.invoice_number ? `#${invoice.invoice_number}` : ''}
                </h2>
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[10px] font-bold',
                    invoice?.status === 'paid'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  )}
                >
                  {invoice?.status === 'paid' ? 'مدفوعة' : 'مرحلة'}
                </span>
              </div>
              <p className="text-xs font-medium text-[var(--app-text-secondary)]">
                تعديل الأصناف، الأسعار، العميل، طريقة الدفع مع تسوية القيود والمخزون تلقائياً
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        {invoiceLoading ? (
          <div className="flex h-96 items-center justify-center">
            <PageLoader />
          </div>
        ) : invoiceError ? (
          <div className="p-10 text-center text-rose-600 dark:text-rose-400 font-bold">
            حدث خطأ أثناء تحميل بيانات الفاتورة.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Metadata Bar */}
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3.5 sm:grid-cols-2 lg:grid-cols-4">
              {/* Customer Selector */}
              <div className="relative">
                <label className="mb-1 block text-xs font-bold text-[var(--app-text-secondary)]">العميل / الطرف</label>
                <div
                  onClick={() => setIsPartyDropdownOpen(!isPartyDropdownOpen)}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs font-semibold text-[var(--app-text)] hover:border-blue-500/60 transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <User size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="truncate">{customerName || 'عميل نقدي'}</span>
                  </div>
                  <Search size={14} className="text-[var(--app-text-secondary)]" />
                </div>

                {isPartyDropdownOpen && (
                  <div className="absolute top-full right-0 z-50 mt-1 w-72 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-2xl">
                    <input
                      type="text"
                      placeholder="ابحث عن العميل..."
                      value={partySearchQuery}
                      onChange={e => setPartySearchQuery(e.target.value)}
                      className="mb-2 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1.5 text-xs text-[var(--app-text)] focus:outline-none focus:border-blue-500"
                      autoFocus
                    />
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPartyId(null);
                          setCustomerName('عميل نقدي');
                          setIsPartyDropdownOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold text-right transition-colors',
                          partyId === null ? 'bg-blue-600 text-white' : 'hover:bg-[var(--app-surface-hover)] text-[var(--app-text)]'
                        )}
                      >
                        <span>عميل نقدي (بدون حساب)</span>
                        {partyId === null && <Check size={14} />}
                      </button>
                      {(filteredParties || []).map((party: any) => (
                        <button
                          key={party.id}
                          type="button"
                          onClick={() => {
                            setPartyId(party.id);
                            setCustomerName(party.name);
                            setIsPartyDropdownOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold text-right transition-colors',
                            partyId === party.id
                              ? 'bg-blue-600 text-white'
                              : 'hover:bg-[var(--app-surface-hover)] text-[var(--app-text)]'
                          )}
                        >
                          <div className="flex flex-col">
                            <span>{party.name}</span>
                            {party.phone && (
                              <span className="text-[10px] opacity-80 font-mono" dir="ltr">
                                {party.phone}
                              </span>
                            )}
                          </div>
                          {partyId === party.id && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--app-text-secondary)]">طريقة الدفع</label>
                <div className="flex rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={cn(
                      'flex-1 rounded-md py-1.5 text-xs font-bold transition-colors',
                      paymentMethod === 'cash'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                    )}
                  >
                    نقداً (كاش)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('credit')}
                    className={cn(
                      'flex-1 rounded-md py-1.5 text-xs font-bold transition-colors',
                      paymentMethod === 'credit'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                    )}
                  >
                    آجل (ذمم)
                  </button>
                </div>
              </div>

              {/* Cashbox / Treasury Selector */}
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--app-text-secondary)]">الصندوق / الخزينة</label>
                <select
                  value={paymentAccountId}
                  onChange={e => setPaymentAccountId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs font-semibold text-[var(--app-text)] focus:outline-none focus:border-blue-500"
                >
                  <option value="">الصندوق الافتراضي للفرع</option>
                  {(paymentAccounts || []).map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name_ar} {acc.currency_code ? `(${acc.currency_code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Issue Date */}
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--app-text-secondary)]">تاريخ الفاتورة</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={e => setIssueDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--app-text)] focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            {/* Product Search & Addition */}
            <div className="relative">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)]"
                  />
                  <input
                    type="text"
                    placeholder="ابحث عن صنف لإضافته إلى الفاتورة (بالاسم أو SKU أو الباركود)..."
                    value={productSearchTerm}
                    onChange={e => {
                      setProductSearchTerm(e.target.value);
                      setIsProductSearchOpen(true);
                    }}
                    onFocus={() => setIsProductSearchOpen(true)}
                    className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] py-2.5 pr-10 pl-4 text-xs font-medium text-[var(--app-text)] focus:outline-none focus:border-blue-500"
                  />
                  {searchLoading && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                      جاري البحث...
                    </div>
                  )}
                </div>
              </div>

              {/* Search Results Dropdown */}
              {isProductSearchOpen && productSearchTerm.trim().length >= 2 && (
                <div className="absolute top-full right-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-2xl">
                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[var(--app-text-secondary)]">
                      لم يتم العثور على أصناف مطابقة.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {searchResults.map(prod => (
                        <div
                          key={prod.id}
                          onClick={() => handleAddProduct(prod)}
                          className="flex cursor-pointer items-center justify-between rounded-lg p-2.5 hover:bg-[var(--app-surface-hover)] transition-colors"
                        >
                          <div>
                            <div className="text-xs font-bold text-[var(--app-text)]">{prod.name_ar}</div>
                            <div className="text-[10px] text-[var(--app-text-secondary)] font-mono">
                              SKU: {prod.sku || '—'} | المتوفر: {prod.quantity ?? 0}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400" dir="ltr">
                              {formatCurrency(prod.sale_price, currencyCode)}
                            </span>
                            <span className="rounded bg-blue-600/15 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                              + إضافة
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text)]">
                    <th className="py-2.5 px-3 font-bold text-center w-10">#</th>
                    <th className="py-2.5 px-3 font-bold">الصنف</th>
                    <th className="py-2.5 px-3 font-bold text-center w-28">الكمية</th>
                    <th className="py-2.5 px-3 font-bold text-center w-28">السعر الإفرادي</th>
                    <th className="py-2.5 px-3 font-bold text-center w-24">الخصم</th>
                    <th className="py-2.5 px-3 font-bold text-left w-28">الإجمالي</th>
                    <th className="py-2.5 px-2 font-bold text-center w-12">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border)]">
                  {items.map((item, index) => {
                    const lineTotal = Math.max(0, item.quantity * item.unitPrice - item.discount);
                    return (
                      <tr key={`${item.productId}-${index}`} className="hover:bg-[var(--app-surface-hover)]">
                        <td className="py-2.5 px-3 text-center font-mono text-[var(--app-text-secondary)] text-xs">
                          {index + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-[var(--app-text)] text-xs">{item.name}</div>
                          {item.sku && (
                            <div className="font-mono text-[10px] text-[var(--app-text-secondary)]">SKU: {item.sku}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(index, item.quantity - 1)}
                              className="h-6 w-6 rounded border border-[var(--app-border)] bg-[var(--app-surface-hover)] text-[var(--app-text)] hover:bg-[var(--app-border)] flex items-center justify-center font-bold"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => handleQuantityChange(index, Number(e.target.value))}
                              className="h-7 w-14 rounded border border-[var(--app-border)] bg-[var(--app-bg)] text-center text-xs font-bold text-[var(--app-text)] font-mono focus:outline-none focus:border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(index, item.quantity + 1)}
                              className="h-6 w-6 rounded border border-[var(--app-border)] bg-[var(--app-surface-hover)] text-[var(--app-text)] hover:bg-[var(--app-border)] flex items-center justify-center font-bold"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={e => handleUnitPriceChange(index, Number(e.target.value))}
                            className="h-7 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] text-center text-xs font-bold text-[var(--app-text)] font-mono focus:outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.discount}
                            onChange={e => handleDiscountChange(index, Number(e.target.value))}
                            className="h-7 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] text-center text-xs font-bold text-[var(--app-text)] font-mono focus:outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-600 dark:text-emerald-400" dir="ltr">
                          {formatCurrency(lineTotal, currencyCode)}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="rounded p-1.5 text-[var(--app-text-secondary)] hover:bg-rose-500/15 hover:text-rose-600 transition-colors"
                            title="حذف الصنف"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Notes & Summary */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--app-text-secondary)]">ملاحظات الفاتورة</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="أدخل أي ملاحظات تخص الفاتورة أو سبب التعديل..."
                  className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5 text-xs text-[var(--app-text)] focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Totals & Impact Box */}
              <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-4 space-y-2">
                <div className="flex justify-between text-xs text-[var(--app-text-secondary)] font-medium">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono font-bold text-[var(--app-text)]" dir="ltr">
                    {formatCurrency(summary.subtotal, currencyCode)}
                  </span>
                </div>
                {summary.discount > 0 && (
                  <div className="flex justify-between text-xs text-rose-600 dark:text-rose-400 font-medium">
                    <span>إجمالي الخصم:</span>
                    <span className="font-mono font-bold" dir="ltr">
                      -{formatCurrency(summary.discount, currencyCode)}
                    </span>
                  </div>
                )}
                {summary.tax > 0 && (
                  <div className="flex justify-between text-xs text-[var(--app-text-secondary)] font-medium">
                    <span>الضريبة:</span>
                    <span className="font-mono font-bold text-[var(--app-text)]" dir="ltr">
                      {formatCurrency(summary.tax, currencyCode)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-[var(--app-border)] pt-2 text-sm font-black text-[var(--app-text)]">
                  <span>الإجمالي الجديد:</span>
                  <span className="font-mono text-base font-black text-emerald-600 dark:text-emerald-400" dir="ltr">
                    {formatCurrency(summary.total, currencyCode)}
                  </span>
                </div>

                {/* Comparison with Old Total */}
                <div className="mt-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5 text-xs space-y-1">
                  <div className="flex justify-between text-[var(--app-text-secondary)] font-medium">
                    <span>الإجمالي السابق:</span>
                    <span className="font-mono font-bold text-[var(--app-text)]" dir="ltr">
                      {formatCurrency(oldDocumentTotal, currencyCode)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-[var(--app-text)]">
                    <span>الفارق المحاسبي:</span>
                    <span
                      className={cn(
                        'font-mono font-black',
                        difference > 0 ? 'text-amber-600 dark:text-amber-400' : difference < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--app-text-secondary)]'
                      )}
                      dir="ltr"
                    >
                      {difference > 0 ? `+${formatCurrency(difference, currencyCode)}` : formatCurrency(difference, currencyCode)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Accounting notice banner */}
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-900 dark:text-blue-200 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
                <span>المعالجة المحاسبية والمخزنية الآلية:</span>
              </div>
              <ul className="pr-6 list-disc space-y-0.5 text-[11px] font-medium">
                <li>تسوية المخزون فورياً: إرجاع كميات الأصناف المحذوفة/المخفضة وخصم الأصناف الجديدة.</li>
                <li>تحديث قيود اليومية للعميل، الخزينة، إيراد المبيعات، والضريبة لتطابق الإجمالي الجديد.</li>
                <li>تحديث رصيد العميل وكشف الحساب تلقائياً دون أي تأثير جانبي أو تعارض.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-[var(--app-border)] bg-[var(--app-bg)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isUpdating}
            className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-xs font-bold text-[var(--app-text)] hover:bg-[var(--app-surface-hover)] transition-colors"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isUpdating || invoiceLoading || items.length === 0}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
          >
            <Save size={15} />
            <span>حفظ التعديلات واعتماد القيود</span>
          </button>
        </div>

        {/* Confirmation Dialog */}
        {showConfirm && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
            <div
              style={{ backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
              className="w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl text-right space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[var(--app-text)]">تأكيد تعديل الفاتورة</h3>
                  <p className="text-xs font-medium text-[var(--app-text-secondary)]">يرجى مراجعة تفاصيل التعديل قبل الاعتماد</p>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--app-text-secondary)]">العميل:</span>
                  <span className="font-bold text-[var(--app-text)]">{customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--app-text-secondary)]">طريقة الدفع:</span>
                  <span className="font-bold text-[var(--app-text)]">
                    {paymentMethod === 'cash' ? 'نقداً (كاش)' : 'آجل (ذمم)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--app-text-secondary)]">عدد الأصناف:</span>
                  <span className="font-bold text-[var(--app-text)] font-mono">{items.length}</span>
                </div>
                <div className="flex justify-between border-t border-[var(--app-border)] pt-2 font-bold">
                  <span className="text-[var(--app-text)]">الإجمالي الجديد:</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400" dir="ltr">
                    {formatCurrency(summary.total, currencyCode)}
                  </span>
                </div>
              </div>

              <p className="text-[11px] font-medium text-[var(--app-text-secondary)] leading-relaxed">
                سيتم تنفيذ تسوية المخزون وإعادة إنشاء بنود القيود المحاسبية تلقائياً في معاملة واحدة غير قابلة للتجزئة.
              </p>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  disabled={isUpdating}
                  className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-xs font-bold text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={executeSave}
                  disabled={isUpdating}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUpdating ? 'جاري الحفظ والترحيل...' : 'تأكيد الحفظ والترحيل'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default EditInvoiceModal;
