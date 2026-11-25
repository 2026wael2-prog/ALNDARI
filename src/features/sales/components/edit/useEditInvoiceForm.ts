import { useEffect, useMemo, useState } from 'react';
import { useInvoiceDetails, useUpdateInvoice } from '../../hooks';
import { usePaymentAccounts } from '../../../accounting/hooks';
import { useCurrencies } from '../../../settings/hooks';
import { useAuthStore } from '../../../auth/store';
import type { ProductSearchResult } from '../../hooks/useProductSearch';

export interface EditItemRow {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  warehouseId?: string;
}

interface RawInvoiceLine {
  product_id?: string;
  productId?: string;
  product?: { id?: string; name_ar?: string; sku?: string } | null;
  product_name?: string;
  name?: string;
  sku?: string;
  quantity?: number | string;
  unit_price?: number | string;
  unitPrice?: number | string;
  discount_amount?: number | string;
  discount?: number | string;
  tax_amount?: number | string;
  tax_rate?: number | string | null;
  taxRate?: number | string | null;
  warehouse_id?: string;
}

interface RawInvoiceDetail {
  invoice_number?: string;
  status?: string;
  party_id?: string | null;
  party?: { name?: string } | null;
  parties?: { name?: string } | null;
  party_name?: string;
  payment_method?: string;
  payment_account_id?: string;
  issue_date?: string;
  due_date?: string;
  notes?: string;
  currency_code?: string;
  exchange_rate?: number | string;
  total_amount?: number | string;
  total_document_amount?: number | string | null;
  advance_payment?: number | string;
  branch_id?: string;
  invoice_items?: RawInvoiceLine[];
  items?: RawInvoiceLine[];
}

export function useEditInvoiceForm(params: {
  invoiceId: string;
  onClose: () => void;
  onSuccess?: (() => void) | undefined;
}) {
  const { invoiceId, onClose, onSuccess } = params;
  const { user } = useAuthStore();
  const companyId = user?.company_id || '';

  const {
    data: rawInvoice,
    isLoading: invoiceLoading,
    error: invoiceError,
  } = useInvoiceDetails(invoiceId);
  const invoice = rawInvoice as RawInvoiceDetail | undefined;

  const { mutate: updateInvoice, isPending: isUpdating } = useUpdateInvoice();
  const { data: paymentAccounts } = usePaymentAccounts();
  const { rates } = useCurrencies();

  const [partyId, setPartyId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash');
  const [paymentAccountId, setPaymentAccountId] = useState<string>('');
  const [issueDate, setIssueDate] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [currencyCode, setCurrencyCode] = useState<string>('SAR');
  const [exchangeRateDisplay, setExchangeRateDisplay] = useState<number>(1);
  const [items, setItems] = useState<EditItemRow[]>([]);
  const [showConfirm, setShowConfirm] = useState<boolean>(false);

  const defaultYerRate = useMemo(() => {
    const yerRow = rates.data?.find(
      (r: { currency_code: string; rate_to_base: number }) => r.currency_code === 'YER'
    );
    const raw = Number(yerRow?.rate_to_base || 0);
    if (raw > 0 && raw < 1) return Math.round(1 / raw);
    if (raw > 1) return raw;
    return 425;
  }, [rates.data]);

  useEffect(() => {
    if (!invoice) return;

    setPartyId(invoice.party_id || null);
    setCustomerName(
      invoice.party?.name || invoice.party_name || invoice.parties?.name || 'عميل نقدي'
    );
    setPaymentMethod(invoice.payment_method === 'credit' ? 'credit' : 'cash');
    setPaymentAccountId(invoice.payment_account_id || '');
    setIssueDate(invoice.issue_date || '');
    setDueDate(invoice.due_date || '');
    setNotes(invoice.notes || '');

    const initCurr = String(invoice.currency_code || 'SAR').toUpperCase();
    setCurrencyCode(initCurr);
    const rawRate = Number(invoice.exchange_rate || 1);
    if (initCurr === 'YER') {
      setExchangeRateDisplay(
        rawRate > 0 && rawRate < 1
          ? Math.round(1 / rawRate)
          : rawRate > 1
            ? rawRate
            : defaultYerRate
      );
    } else {
      setExchangeRateDisplay(rawRate > 0 ? rawRate : 1);
    }

    const rawItems = invoice.invoice_items || invoice.items || [];
    const initialItems: EditItemRow[] = rawItems.map(ii => {
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
  }, [invoice, defaultYerRate]);

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

  const originalCurrency = String(invoice?.currency_code || 'SAR').toUpperCase();
  const isCurrencyChanged = currencyCode !== originalCurrency;
  const oldTotal = Number(invoice?.total_amount || 0);
  const oldDocumentTotal =
    invoice?.total_document_amount != null && Number(invoice.total_document_amount) > 0
      ? Number(invoice.total_document_amount)
      : oldTotal;
  const difference = isCurrencyChanged ? 0 : summary.total - oldDocumentTotal;

  const handleCurrencyChange = (nextCurrency: 'SAR' | 'YER') => {
    if (nextCurrency === currencyCode) return;
    const rate = exchangeRateDisplay > 1 ? exchangeRateDisplay : defaultYerRate;

    if (currencyCode === 'YER' && nextCurrency === 'SAR') {
      setItems(prev =>
        prev.map(item => ({
          ...item,
          unitPrice: Math.round((item.unitPrice / rate) * 100) / 100,
          discount: Math.round((item.discount / rate) * 100) / 100,
        }))
      );
      setCurrencyCode('SAR');
      setExchangeRateDisplay(1);
    } else if (currencyCode === 'SAR' && nextCurrency === 'YER') {
      setItems(prev =>
        prev.map(item => ({
          ...item,
          unitPrice: Math.round(item.unitPrice * rate),
          discount: Math.round(item.discount * rate),
        }))
      );
      setCurrencyCode('YER');
      setExchangeRateDisplay(rate);
    }

    // مزامنة حساب الصندوق/الخزينة تلقائياً مع العملة الجديدة لمنع خطأ تعارض عملة الصندوق
    const accountsList = (paymentAccounts || []) as Array<{
      id: string;
      currency_code?: string | null;
    }>;
    const currentBox = accountsList.find(a => a.id === paymentAccountId);
    const currentBoxCurr = String(currentBox?.currency_code || 'SAR').toUpperCase();
    if (!currentBox || currentBoxCurr !== nextCurrency) {
      const matchingBox = accountsList.find(
        a => String(a.currency_code || 'SAR').toUpperCase() === nextCurrency
      );
      setPaymentAccountId(matchingBox?.id || '');
    }
  };

  const handleQuantityChange = (index: number, newQty: number) => {
    if (newQty < 0) return;
    setItems(prev =>
      prev.map((item, i) => (i === index ? { ...item, quantity: newQty } : item))
    );
  };

  const handleUnitPriceChange = (index: number, newPrice: number) => {
    if (newPrice < 0) return;
    setItems(prev =>
      prev.map((item, i) => (i === index ? { ...item, unitPrice: newPrice } : item))
    );
  };

  const handleDiscountChange = (index: number, newDiscount: number) => {
    if (newDiscount < 0) return;
    setItems(prev =>
      prev.map((item, i) => (i === index ? { ...item, discount: newDiscount } : item))
    );
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
      const baseSalePrice = Number(product.sale_price || 0);
      const effectiveRate = exchangeRateDisplay > 1 ? exchangeRateDisplay : defaultYerRate;
      const convertedPrice =
        currencyCode === 'YER' ? Math.round(baseSalePrice * effectiveRate) : baseSalePrice;
      setItems(prev => [
        ...prev,
        {
          productId: product.id,
          name: product.name_ar,
          sku: product.sku || '',
          quantity: 1,
          unitPrice: convertedPrice,
          discount: 0,
          taxRate: 0,
        },
      ]);
    }
  };

  const handleSave = () => {
    if (items.length === 0) {
      alert('لا يمكن حفظ فاتورة بدون أصناف.');
      return;
    }
    if (items.some(i => !i.quantity || i.quantity <= 0)) {
      alert('يجب أن تكون كمية كل صنف أكبر من صفر.');
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
        exchangeRate:
          currencyCode === 'SAR'
            ? 1
            : exchangeRateDisplay > 1
              ? exchangeRateDisplay
              : defaultYerRate,
        paidAmount:
          paymentMethod === 'credit'
            ? !isCurrencyChanged &&
              invoice?.payment_method === 'credit' &&
              Number(invoice?.advance_payment || 0) > 0
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

  return {
    companyId,
    invoice,
    invoiceLoading,
    invoiceError,
    isUpdating,
    paymentAccounts: paymentAccounts || [],
    partyId,
    setPartyId,
    customerName,
    setCustomerName,
    paymentMethod,
    setPaymentMethod,
    paymentAccountId,
    setPaymentAccountId,
    issueDate,
    setIssueDate,
    notes,
    setNotes,
    currencyCode,
    exchangeRateDisplay,
    setExchangeRateDisplay,
    items,
    summary,
    originalCurrency,
    isCurrencyChanged,
    oldDocumentTotal,
    difference,
    showConfirm,
    setShowConfirm,
    handleCurrencyChange,
    handleQuantityChange,
    handleUnitPriceChange,
    handleDiscountChange,
    handleRemoveItem,
    handleAddProduct,
    handleSave,
    executeSave,
  };
}
