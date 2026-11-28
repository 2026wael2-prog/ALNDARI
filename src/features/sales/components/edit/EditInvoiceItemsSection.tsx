import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Layers, Plus, Search, Trash2 } from 'lucide-react';
import { useProductSearch, type ProductSearchResult } from '../../hooks/useProductSearch';
import { cn, formatCurrency } from '../../../../core/utils';
import { EntityInfoDot } from '../../../entity-inspector';
import { CalculatorInput } from '@/ui/common/CalculatorInput';
import {
  TableSettingsButton,
  useTableCustomization,
} from '@/ui/table-settings/TableSettingsButton';
import type { Product } from '../../../inventory/types';
import type { EditItemRow } from './useEditInvoiceForm';

const ProductSelectionModal = lazy(() => import('../create/ProductSelectionModal'));

const EDIT_INVOICE_COL_WIDTHS_KEY = 'erp_edit_invoice_col_widths';

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  index: 44,
  description: 340,
  quantity: 105,
  price: 130,
  discount: 105,
  total: 145,
};

type GridField = 'name' | 'quantity' | 'price' | 'discount' | 'total';

interface EditInvoiceItemsSectionProps {
  companyId: string;
  currencyCode: string;
  exchangeRateDisplay?: number;
  items: EditItemRow[];
  showDiscount: boolean;
  onToggleDiscount: () => void;
  onAddProduct: (product: ProductSearchResult) => void;
  onAddEmptyRow: () => number;
  onReplaceItemProduct: (index: number, product: Product | ProductSearchResult) => void;
  onQuantityChange: (index: number, qty: number) => void;
  onUnitPriceChange: (index: number, price: number) => void;
  onDiscountChange: (index: number, discount: number) => void;
  onLineTotalChange: (index: number, newTotal: number) => void;
  onRemoveItem: (index: number) => void;
}

const loadInitialWidths = (): Record<string, number> => {
  try {
    const saved = localStorage.getItem(EDIT_INVOICE_COL_WIDTHS_KEY);
    return saved ? { ...DEFAULT_COL_WIDTHS, ...JSON.parse(saved) } : DEFAULT_COL_WIDTHS;
  } catch {
    return DEFAULT_COL_WIDTHS;
  }
};

export const EditInvoiceItemsSection: React.FC<EditInvoiceItemsSectionProps> = ({
  companyId,
  currencyCode,
  exchangeRateDisplay = 1,
  items,
  showDiscount,
  onToggleDiscount,
  onAddProduct,
  onAddEmptyRow,
  onReplaceItemProduct,
  onQuantityChange,
  onUnitPriceChange,
  onDiscountChange,
  onLineTotalChange,
  onRemoveItem,
}) => {
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    rowIndex: number;
    query: string;
  }>({ isOpen: false, rowIndex: 0, query: '' });

  const tableRef = useRef<HTMLTableElement>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>(loadInitialWidths);
  const resizingRef = useRef<{ field: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(EDIT_INVOICE_COL_WIDTHS_KEY, JSON.stringify(colWidths));
    } catch {
      // ignore storage quota errors
    }
  }, [colWidths]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { field, startX, startWidth } = resizingRef.current;
    const delta = e.pageX - startX;
    setColWidths(prev => ({
      ...prev,
      [field]: Math.max(60, startWidth + delta),
    }));
  }, []);

  const onMouseUp = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [onMouseMove]);

  const onMouseDown = (e: React.MouseEvent, field: string) => {
    resizingRef.current = {
      field,
      startX: e.pageX,
      startWidth: colWidths[field] ?? DEFAULT_COL_WIDTHS[field] ?? 120,
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const { products: searchResults, isLoading: searchLoading } = useProductSearch(
    productSearchTerm,
    {
      companyId,
      debounceMs: 250,
      enabled: Boolean(companyId) && productSearchTerm.trim().length >= 2,
    }
  );

  const handleSelectSearchProduct = (prod: ProductSearchResult) => {
    onAddProduct(prod);
    setProductSearchTerm('');
    setIsProductSearchOpen(false);
  };

  const openModalForRow = (rowIndex: number, query = '') => {
    setModalState({ isOpen: true, rowIndex, query });
  };

  const handleModalSelect = (product: Product) => {
    onReplaceItemProduct(modalState.rowIndex, product);
    setModalState(prev => ({ ...prev, isOpen: false }));
    setTimeout(() => {
      const nextCell =
        tableRef.current?.querySelector<HTMLInputElement>(
          `[data-edit-row-index="${modalState.rowIndex}"][data-edit-col-field="quantity"]`
        ) ?? null;
      nextCell?.focus();
      nextCell?.select();
    }, 50);
  };

  const moveFocus = (row: number, field: GridField) => {
    setTimeout(() => {
      const nextCell =
        tableRef.current?.querySelector<HTMLInputElement>(
          `[data-edit-row-index="${row}"][data-edit-col-field="${field}"]`
        ) ?? null;
      nextCell?.focus();
      nextCell?.select();
    }, 20);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: GridField
  ) => {
    if (
      field === 'name' &&
      (e.key === 'Enter' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey))
    ) {
      e.preventDefault();
      openModalForRow(rowIndex, e.key.length === 1 ? e.key : '');
      return;
    }

    const navigationFields: GridField[] = ['name', 'quantity', 'price'];
    if (showDiscount) navigationFields.push('discount');
    navigationFields.push('total');
    const colIndex = navigationFields.indexOf(field);

    const target = e.target as HTMLInputElement;
    const isReadOnly = target.readOnly;
    const hasFullSelection =
      target.selectionStart === 0 && target.selectionEnd === target.value.length;
    const isAtStart = target.selectionStart === 0 && target.selectionEnd === 0;
    const isAtEnd =
      target.selectionStart === target.value.length && target.selectionEnd === target.value.length;
    const isEmpty = target.value.trim() === '';

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(Math.max(0, rowIndex - 1), field);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (rowIndex === items.length - 1) {
          const newIdx = onAddEmptyRow();
          setTimeout(() => moveFocus(newIdx, 'name'), 50);
        } else {
          moveFocus(rowIndex + 1, field);
        }
        break;
      case 'ArrowLeft':
        if (isReadOnly || hasFullSelection || isAtEnd || isEmpty || e.ctrlKey || e.altKey) {
          e.preventDefault();
          if (colIndex < navigationFields.length - 1) {
            moveFocus(rowIndex, navigationFields[colIndex + 1]);
          } else if (rowIndex < items.length - 1) {
            moveFocus(rowIndex + 1, navigationFields[0]);
          }
        }
        break;
      case 'ArrowRight':
        if (isReadOnly || hasFullSelection || isAtStart || isEmpty || e.ctrlKey || e.altKey) {
          e.preventDefault();
          if (colIndex > 0) {
            moveFocus(rowIndex, navigationFields[colIndex - 1]);
          } else if (rowIndex > 0) {
            moveFocus(rowIndex - 1, navigationFields[navigationFields.length - 1]);
          }
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (colIndex < navigationFields.length - 1) {
          moveFocus(rowIndex, navigationFields[colIndex + 1]);
        } else if (rowIndex === items.length - 1) {
          const newIdx = onAddEmptyRow();
          setTimeout(() => moveFocus(newIdx, 'name'), 50);
        } else {
          moveFocus(rowIndex + 1, navigationFields[0]);
        }
        break;
      case 'Tab': {
        e.preventDefault();
        const nextCol = e.shiftKey ? colIndex - 1 : colIndex + 1;
        if (nextCol >= 0 && nextCol < navigationFields.length) {
          moveFocus(rowIndex, navigationFields[nextCol]);
        } else if (!e.shiftKey && rowIndex < items.length - 1) {
          moveFocus(rowIndex + 1, navigationFields[0]);
        } else if (e.shiftKey && rowIndex > 0) {
          moveFocus(rowIndex - 1, navigationFields[navigationFields.length - 1]);
        }
        break;
      }
      default:
        return;
    }
  };

  const { containerProps: editTableCustomProps } = useTableCustomization('sales.edit_invoice');

  return (
    <div className="space-y-2.5">
      {/* Quick Search Bar */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)]"
            />
            <input
              type="text"
              placeholder="بحث سريع عن صنف لإضافته (بالاسم أو رقم القطعة أو SKU أو الباركود)..."
              value={productSearchTerm}
              onChange={e => {
                setProductSearchTerm(e.target.value);
                setIsProductSearchOpen(true);
              }}
              onFocus={() => setIsProductSearchOpen(true)}
              className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] py-2 pl-4 pr-9 text-xs font-semibold text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
            />
            {searchLoading && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                جاري البحث...
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              const emptyIdx = items.findIndex(i => !i.productId);
              openModalForRow(emptyIdx !== -1 ? emptyIdx : items.length, '');
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-600/10 px-3 py-2 text-xs font-black text-blue-700 transition-colors hover:bg-blue-600 hover:text-white dark:text-blue-300"
          >
            <Layers size={14} />
            <span>مستعرض الأصناف</span>
          </button>
        </div>

        {isProductSearchOpen && productSearchTerm.trim().length >= 2 && (
          <div className="absolute right-0 top-full z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-300 bg-[var(--app-surface)] shadow-2xl dark:border-slate-700">
            {searchResults.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--app-text-secondary)]">
                لم يتم العثور على أصناف مطابقة.
              </div>
            ) : (
              <table className="w-full border-collapse text-right text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-300 bg-slate-100 text-[11px] font-black uppercase text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <tr>
                    <th className="w-8 border-l border-slate-300 px-2 py-2 text-center dark:border-slate-700">
                      #
                    </th>
                    <th className="border-l border-slate-300 px-3 py-2 text-start font-black dark:border-slate-700">
                      اسم المنتج
                    </th>
                    <th className="w-32 border-l border-slate-300 px-2.5 py-2 text-center font-black dark:border-slate-700">
                      رقم المنتج
                    </th>
                    <th className="w-28 border-l border-slate-300 px-2.5 py-2 text-center font-black dark:border-slate-700">
                      الشركة الصانعة
                    </th>
                    <th className="w-24 border-l border-slate-300 px-2.5 py-2 text-center font-black dark:border-slate-700">
                      السعر
                    </th>
                    <th className="w-20 border-l border-slate-300 px-2 py-2 text-center font-black dark:border-slate-700">
                      المخزون
                    </th>
                    <th className="w-16 px-2 py-2 text-center font-black">إضافة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-[var(--app-surface)] dark:divide-slate-800">
                  {searchResults.map((prod, idx) => (
                    <tr
                      key={prod.id}
                      onClick={() => handleSelectSearchProduct(prod)}
                      className="group cursor-pointer transition-colors hover:bg-amber-50/70 dark:hover:bg-amber-950/20"
                    >
                      <td className="border-l border-slate-200 px-2 py-2 text-center font-mono text-[11px] font-bold text-slate-400 dark:border-slate-800">
                        {idx + 1}
                      </td>
                      <td className="border-l border-slate-200 px-3 py-2 dark:border-slate-800">
                        <div className="flex items-center gap-1.5 font-bold text-[var(--app-text)]">
                          <EntityInfoDot
                            type="product"
                            id={prod.id}
                            label={prod.name_ar}
                            size="sm"
                          />
                          <span className="truncate">{prod.name_ar}</span>
                        </div>
                      </td>
                      <td
                        className="border-l border-slate-200 px-2.5 py-2 text-center font-mono text-xs font-bold text-slate-700 dark:border-slate-800 dark:text-slate-300"
                        dir="ltr"
                      >
                        {prod.part_number || prod.sku || '—'}
                      </td>
                      <td className="border-l border-slate-200 px-2.5 py-2 text-center font-bold text-slate-600 dark:border-slate-800 dark:text-slate-400">
                        {prod.brand || '—'}
                      </td>
                      <td
                        className="border-l border-slate-200 px-2.5 py-2 text-center font-mono text-xs font-black text-emerald-600 dark:border-slate-800 dark:text-emerald-400"
                        dir="ltr"
                      >
                        {formatCurrency(
                          currencyCode === 'YER' && exchangeRateDisplay > 1
                            ? Math.round(Number(prod.sale_price || 0) * exchangeRateDisplay)
                            : Number(prod.sale_price || 0),
                          currencyCode
                        )}
                      </td>
                      <td className="border-l border-slate-200 px-2 py-2 text-center font-mono text-xs font-bold text-slate-700 dark:border-slate-800 dark:text-slate-300">
                        {prod.quantity ?? 0}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handleSelectSearchProduct(prod);
                          }}
                          className="rounded bg-blue-600/15 px-2 py-0.5 text-[10px] font-bold text-blue-700 transition-colors hover:bg-blue-600 hover:text-white dark:bg-blue-500/20 dark:text-blue-300 dark:hover:bg-blue-600 dark:hover:text-white"
                        >
                          + إضافة
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Interactive Sales-Invoice-Style Editable Grid */}
      <div
        className="flex flex-col overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm"
        {...editTableCustomProps}
      >
        {/* Table Toolbar */}
        <div className="flex items-center justify-between border-b bg-gray-50 p-1.5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-2 px-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-xs font-bold tracking-wider text-gray-700 dark:text-slate-300">
              محتويات الفاتورة
            </span>
            <span className="rounded-md bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] font-black text-blue-600 dark:text-blue-400">
              {items.filter(i => Boolean(i.productId)).length} صنف
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <TableSettingsButton
              tableId="sales.edit_invoice"
              tableTitle="جدول تعديل الفاتورة"
              compact
            />
            <div className="flex rounded-lg border bg-gray-100 p-0.5 dark:border-slate-800 dark:bg-slate-800">
              <button
                type="button"
                onClick={onToggleDiscount}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-bold transition-all',
                  showDiscount
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                    : 'text-gray-500 hover:text-gray-700 dark:text-slate-400'
                )}
              >
                خصم
              </button>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="custom-scrollbar overflow-x-auto">
          <table
            ref={tableRef}
            className="w-full min-w-[680px] table-fixed border-collapse"
          >
            <thead>
              <tr className="bg-gray-50/80 text-right text-xs font-bold text-gray-700 dark:bg-slate-800/40 dark:text-slate-200">
                <th
                  style={{ width: colWidths.index }}
                  className="border-b border-l p-2.5 text-center dark:border-slate-800"
                >
                  #
                </th>
                <th
                  style={{ width: colWidths.description }}
                  className="group relative border-b border-l p-2.5 dark:border-slate-800"
                >
                  وصف الصنف
                  <div
                    onMouseDown={e => onMouseDown(e, 'description')}
                    className="absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:w-1.5 hover:bg-blue-500/50 active:bg-blue-600"
                  />
                </th>
                <th
                  style={{ width: colWidths.quantity }}
                  className="group relative border-b border-l p-2.5 text-center dark:border-slate-800"
                >
                  الكمية
                  <div
                    onMouseDown={e => onMouseDown(e, 'quantity')}
                    className="absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:w-1.5 hover:bg-blue-500/50 active:bg-blue-600"
                  />
                </th>
                <th
                  style={{ width: colWidths.price }}
                  className="group relative border-b border-l p-2.5 text-center dark:border-slate-800"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>سعر الوحدة</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-black',
                        currencyCode === 'YER'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                      )}
                    >
                      ({currencyCode === 'YER' ? 'ر.ي' : 'ر.س'})
                    </span>
                  </div>
                  <div
                    onMouseDown={e => onMouseDown(e, 'price')}
                    className="absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:w-1.5 hover:bg-blue-500/50 active:bg-blue-600"
                  />
                </th>
                {showDiscount && (
                  <th
                    style={{ width: colWidths.discount }}
                    className="group relative border-b border-l p-2.5 text-center dark:border-slate-800"
                  >
                    الخصم
                    <div
                      onMouseDown={e => onMouseDown(e, 'discount')}
                      className="absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:w-1.5 hover:bg-blue-500/50 active:bg-blue-600"
                    />
                  </th>
                )}
                <th
                  style={{ width: colWidths.total }}
                  className="group relative border-b border-l p-2.5 text-left dark:border-slate-800"
                >
                  الإجمالي
                  <div
                    onMouseDown={e => onMouseDown(e, 'total')}
                    className="absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:w-1.5 hover:bg-blue-500/50 active:bg-blue-600"
                  />
                </th>
                <th className="w-10 border-b p-2.5 text-center dark:border-slate-800" />
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
              {items.map((item, index) => {
                const effectiveDisc = showDiscount ? item.discount : 0;
                const lineTotal = Math.max(0, item.quantity * item.unitPrice - effectiveDisc);
                return (
                  <tr
                    key={item.rowKey}
                    className="group h-11 transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
                  >
                    <td className="border-l p-2 text-center font-mono text-xs font-bold text-gray-400 dark:border-slate-800 dark:text-slate-500">
                      {index + 1}
                    </td>

                    {/* Description Cell (Click or Type to Select/Replace Product) */}
                    <td className="border-l p-0 dark:border-slate-800">
                      <div className="group/cell flex items-center gap-1.5 px-3">
                        {item.productId && (
                          <EntityInfoDot
                            type="product"
                            id={item.productId}
                            label={item.name}
                            size="xs"
                          />
                        )}
                        <input
                          type="text"
                          value={item.name}
                          data-edit-row-index={index}
                          data-edit-col-field="name"
                          onKeyDown={e => handleKeyDown(e, index, 'name')}
                          onClick={() => openModalForRow(index, item.name || '')}
                          readOnly
                          className="min-w-0 flex-1 cursor-pointer bg-transparent py-2.5 text-right text-sm font-bold text-gray-800 outline-none placeholder:text-gray-300 dark:text-slate-100 dark:placeholder:text-slate-600"
                          placeholder="اختر صنفاً..."
                        />
                        {(item.partNumber || item.sku) && (
                          <span
                            dir="ltr"
                            className="hidden shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:inline-block"
                          >
                            {item.partNumber || item.sku}
                          </span>
                        )}
                        <Search
                          size={14}
                          className="shrink-0 text-gray-400 opacity-0 transition-opacity group-hover/cell:opacity-100"
                        />
                      </div>
                    </td>

                    {/* Quantity */}
                    <td className="border-l p-0 dark:border-slate-800">
                      <CalculatorInput
                        value={item.quantity}
                        onValueChange={val => onQuantityChange(index, val)}
                        onKeyDown={e => handleKeyDown(e, index, 'quantity')}
                        allowNegative={false}
                        compact={true}
                        data-edit-row-index={index}
                        data-edit-col-field="quantity"
                        wrapperClassName="h-full"
                        className="h-full w-full bg-transparent p-2 text-center font-mono text-sm font-bold text-gray-900 outline-none focus:bg-blue-50 dark:text-white dark:focus:bg-slate-800"
                        placeholder="0"
                      />
                    </td>

                    {/* Unit Price */}
                    <td className="border-l p-0 dark:border-slate-800">
                      <CalculatorInput
                        value={item.unitPrice}
                        onValueChange={val => onUnitPriceChange(index, val)}
                        onKeyDown={e => handleKeyDown(e, index, 'price')}
                        allowNegative={false}
                        compact={true}
                        data-edit-row-index={index}
                        data-edit-col-field="price"
                        wrapperClassName="h-full"
                        className="h-full w-full bg-transparent p-2 text-center font-mono text-sm font-bold text-emerald-600 outline-none focus:bg-emerald-50 dark:text-emerald-400 dark:focus:bg-slate-800"
                        placeholder="0.00"
                      />
                    </td>

                    {/* Discount */}
                    {showDiscount && (
                      <td className="border-l p-0 dark:border-slate-800">
                        <CalculatorInput
                          value={item.discount}
                          onValueChange={val => onDiscountChange(index, val)}
                          onKeyDown={e => handleKeyDown(e, index, 'discount')}
                          allowNegative={false}
                          compact={true}
                          data-edit-row-index={index}
                          data-edit-col-field="discount"
                          wrapperClassName="h-full"
                          className="h-full w-full bg-transparent p-2 text-center font-mono text-sm font-bold text-rose-500 outline-none focus:bg-rose-50 dark:focus:bg-slate-800"
                          placeholder="0"
                        />
                      </td>
                    )}

                    {/* Editable Line Total */}
                    <td className="border-l bg-gray-50/50 p-0 dark:border-slate-800 dark:bg-slate-800/30">
                      <CalculatorInput
                        value={lineTotal !== 0 ? Number(lineTotal.toFixed(2)) : 0}
                        onValueChange={val => onLineTotalChange(index, val)}
                        onKeyDown={e => handleKeyDown(e, index, 'total')}
                        allowNegative={false}
                        compact={true}
                        data-edit-row-index={index}
                        data-edit-col-field="total"
                        wrapperClassName="h-full"
                        className="h-full w-full bg-transparent p-2 text-left font-mono text-sm font-bold text-gray-900 outline-none transition-colors focus:bg-blue-50 dark:text-white dark:focus:bg-slate-800"
                        placeholder="0.00"
                        title="يمكنك تعديل إجمالي الصنف مباشرة أو استخدام العمليات الحسابية (+ - × ÷) وسيتم تعديل سعر الوحدة تلقائياً"
                      />
                    </td>

                    {/* Delete Row */}
                    <td className="p-0">
                      <button
                        type="button"
                        onClick={() => onRemoveItem(index)}
                        aria-label="حذف السطر"
                        title="حذف الصنف"
                        className="flex h-11 w-full items-center justify-center text-gray-300 transition-all hover:bg-rose-50 hover:text-rose-600 dark:text-slate-600 dark:hover:bg-rose-950/30"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add Line Footer Button */}
        <button
          type="button"
          onClick={() => {
            const emptyIdx = items.findIndex(i => !i.productId);
            const targetIdx = emptyIdx !== -1 ? emptyIdx : onAddEmptyRow();
            openModalForRow(targetIdx, '');
          }}
          className="flex w-full items-center justify-center gap-2 border-t bg-gray-50 py-2 text-[11px] font-bold text-gray-600 transition-all hover:bg-gray-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Plus size={14} strokeWidth={3} /> إضافة سطر
        </button>
      </div>

      {modalState.isOpen && (
        <Suspense fallback={null}>
          <ProductSelectionModal
            isOpen={modalState.isOpen}
            onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
            onSelect={handleModalSelect}
            initialQuery={modalState.query}
          />
        </Suspense>
      )}
    </div>
  );
};
