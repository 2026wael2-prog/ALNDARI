import React, { useState, useMemo } from 'react';
import { X, FileSpreadsheet, FileText, Calculator } from 'lucide-react';
import { formatLocalDate } from '../../../core/utils/dateUtils';
import { calculateQuotationItem, calculateQuotationTotals } from '../services/quotationCalculator';
import { exportQuotationToExcel } from '../services/excelEngine';
import { generateQuotationPDF } from '../services/pdfEngine';
import type { QuotationItemDraft, VendorProductItem } from '../types';
import { QuotationBuilderMetadataBar } from './quotation-builder/QuotationBuilderMetadataBar';
import { QuotationBuilderItemsTable } from './quotation-builder/QuotationBuilderItemsTable';
import {
  QuotationBuilderFooter,
  QuotationBuilderTermsFields,
} from './quotation-builder/QuotationBuilderFooter';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialItems?: QuotationItemDraft[];
  allProducts: VendorProductItem[];
  companyName: string;
  supplierName: string;
  quotationNumber?: string;
  existingQuotationId?: string;
  revisionNumber?: number;
  currency?: string;
  onSubmitQuotation: (payload: {
    items: QuotationItemDraft[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    currency: string;
    leadTimeDays: number;
    warrantyDays: number;
    validityDate: string | null;
    terms: string | null;
    notes: string | null;
  }) => Promise<void>;
  isSubmitting?: boolean;
}

export const QuotationBuilderDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  initialItems = [],
  allProducts,
  companyName,
  supplierName,
  quotationNumber = 'VQ-NEW',
  existingQuotationId,
  revisionNumber = 1,
  currency: initialCurrency = 'SAR',
  onSubmitQuotation,
  isSubmitting = false,
}) => {
  const [items, setItems] = useState<QuotationItemDraft[]>(initialItems);
  const [currency, setCurrency] = useState<string>(initialCurrency);
  const [leadTimeDays, setLeadTimeDays] = useState<number>(3);
  const [warrantyDays, setWarrantyDays] = useState<number>(30);
  const [validityDate, setValidityDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return formatLocalDate(d);
  });
  const [terms, setTerms] = useState<string>(
    'الأسعار شاملة التوصيل والضمان. سداد آجل خلال 30 يوم من تاريخ الفاتورة.'
  );
  const [notes, setNotes] = useState<string>('');
  const [productSearch, setProductSearch] = useState('');
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  React.useEffect(() => {
    setItems(initialItems.length > 0 ? initialItems.map(item => calculateQuotationItem(item)) : []);
  }, [initialItems]);

  const totals = useMemo(() => calculateQuotationTotals(items), [items]);

  const handleUpdateItem = <K extends keyof QuotationItemDraft>(
    index: number,
    field: K,
    value: QuotationItemDraft[K]
  ) => {
    setItems(prev => {
      const copy = [...prev];
      const current = copy[index];
      if (!current) return prev;
      copy[index] = calculateQuotationItem({ ...current, [field]: value });
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddProductToDraft = (product: VendorProductItem) => {
    const newItem: QuotationItemDraft = calculateQuotationItem({
      product_id: product.product_id,
      product_name: product.product_name,
      oem_number: product.oem_number,
      vendor_sku: product.vendor_sku,
      quantity: 1,
      unit_of_measure: product.unit || 'حبة',
      unit_price: product.cost_price,
      discount_percentage: 0,
      discount_amount: 0,
      tax_percentage: 0,
      tax_amount: 0,
      availability: 'in_stock',
      lead_time_days: product.lead_time_days || 3,
      warranty_days: 30,
      vendor_notes: '',
    });

    setItems(prev => [...prev, newItem]);
    setProductSearch('');
    setIsAddingProduct(false);
  };

  const filteredAvailableProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    const lower = productSearch.toLowerCase();
    return allProducts
      .filter(
        p =>
          p.product_name.toLowerCase().includes(lower) ||
          p.sku.toLowerCase().includes(lower) ||
          (p.oem_number && p.oem_number.toLowerCase().includes(lower))
      )
      .slice(0, 8);
  }, [allProducts, productSearch]);

  const handleExportExcel = async () => {
    await exportQuotationToExcel({
      companyName,
      supplierName,
      quotationNumber,
      currency,
      items,
      subtotal: totals.subtotal,
      taxAmount: 0,
      totalAmount: totals.grandTotal,
      notes,
      deliveryDays: leadTimeDays,
    });
  };

  const handleExportPDF = async () => {
    await generateQuotationPDF({
      companyName,
      supplierName,
      quotationNumber,
      revisionNumber,
      issueDate: new Date().toLocaleDateString('en-CA'),
      validUntil: validityDate,
      currency,
      items,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxAmount: 0,
      totalAmount: totals.grandTotal,
      deliveryDays: leadTimeDays,
      warrantyDays,
      terms,
      notes,
    });
  };

  const handleSubmit = async () => {
    if (items.length === 0) return;
    await onSubmitQuotation({
      items,
      subtotal: totals.subtotal,
      discount: totals.discountAmount,
      tax: 0,
      total: totals.grandTotal,
      currency,
      leadTimeDays,
      warrantyDays,
      validityDate,
      terms,
      notes,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="backdrop-blur-xs animate-in fade-in fixed inset-0 z-50 flex justify-end overflow-hidden bg-slate-900/60 duration-150">
      <div className="animate-in slide-in-from-left flex h-[100dvh] w-full max-w-4xl flex-col border-r border-slate-200 bg-[var(--app-surface)] pb-[env(safe-area-inset-bottom)] shadow-2xl duration-200 dark:border-slate-800 sm:pb-0">
        {/* Compact Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 p-3 text-white sm:p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-indigo-400">
              <Calculator className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold">
                {existingQuotationId
                  ? `تعديل عرض السعر (${quotationNumber})`
                  : 'إنشاء عرض سعر وتوريد جديد'}
              </h2>
              <p className="text-[11px] text-slate-400">
                المورد: {supplierName} | المراجعة: #{revisionNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                void handleExportExcel();
              }}
              className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              title="تصدير Excel"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
            </button>
            <button
              type="button"
              onClick={() => {
                void handleExportPDF();
              }}
              className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              title="تصدير PDF"
            >
              <FileText className="h-4 w-4 text-rose-400" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <QuotationBuilderMetadataBar
            currency={currency}
            onCurrencyChange={setCurrency}
            leadTimeDays={leadTimeDays}
            onLeadTimeDaysChange={setLeadTimeDays}
            warrantyDays={warrantyDays}
            onWarrantyDaysChange={setWarrantyDays}
            validityDate={validityDate}
            onValidityDateChange={setValidityDate}
            productSearch={productSearch}
            onProductSearchChange={value => {
              setProductSearch(value);
              setIsAddingProduct(true);
            }}
            isAddingProduct={isAddingProduct}
            onFocusSearch={() => {
              setIsAddingProduct(true);
            }}
            filteredAvailableProducts={filteredAvailableProducts}
            onAddProduct={handleAddProductToDraft}
          />

          <QuotationBuilderItemsTable
            items={items}
            currency={currency}
            onUpdateItem={handleUpdateItem}
            onRemoveItem={handleRemoveItem}
          />

          <QuotationBuilderTermsFields
            terms={terms}
            onTermsChange={setTerms}
            notes={notes}
            onNotesChange={setNotes}
          />
        </div>

        <QuotationBuilderFooter
          currency={currency}
          subtotal={totals.subtotal}
          discountAmount={totals.discountAmount}
          grandTotal={totals.grandTotal}
          revisionNumber={revisionNumber}
          itemsCount={items.length}
          isSubmitting={isSubmitting}
          onClose={onClose}
          onSubmit={() => {
            void handleSubmit();
          }}
        />
      </div>
    </div>
  );
};
