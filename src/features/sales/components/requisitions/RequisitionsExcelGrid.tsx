/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unnecessary-condition */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { CustomizableTableWrapper } from '@/ui/table-settings/TableSettingsButton';
import { Trash2, Plus, Copy, Sparkles, ArrowUp, ArrowDown, X, AlertTriangle } from 'lucide-react';
import { useRequisitionsStore } from '../../store/requisitionsStore';
import { useProductSearch, type ProductSearchResult } from '../../hooks/useProductSearch';
import {
  filledRequisitionItems,
  findDuplicateRows,
  findQuantityIssues,
  isBlankRequisitionItem,
  sumRequisitionQuantities,
} from '../../utils/requisitionsValidation';
import { useCompany } from '@/features/settings/hooks';
import { cn, normalizeArabicDigits, parseNumberFlexible } from '@/core/utils';

interface RequisitionsExcelGridProps {
  searchTerm?: string;
}

interface DropdownAnchor {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
}

export const RequisitionsExcelGrid: React.FC<RequisitionsExcelGridProps> = ({
  searchTerm = '',
}) => {
  const { data: company } = useCompany();
  const companyId = company?.id || '';

  const { items, addItem, updateItem, removeItem, duplicateItem, moveItem } =
    useRequisitionsStore();

  // Autocomplete search state (supports BOTH name AND partNumber!)
  const [activeSearchRowId, setActiveSearchRowId] = useState<string | null>(null);
  const [activeSearchField, setActiveSearchField] = useState<'name' | 'partNumber'>('name');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownAnchor, setDropdownAnchor] = useState<DropdownAnchor | null>(null);

  // Smooth local string draft for active quantity cell so Backspace/decimals don't flash red mid-keystroke
  const [editingQtyRowId, setEditingQtyRowId] = useState<string | null>(null);
  const [editingQtyDraft, setEditingQtyDraft] = useState('');

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeInputRef = useRef<HTMLInputElement | null>(null);

  const { products, isLoading: isSearchLoading } = useProductSearch(searchQuery, {
    companyId,
    enabled: Boolean(companyId && searchQuery.trim().length >= 2 && isDropdownOpen),
  });

  const visibleSuggestions = useMemo(() => products.slice(0, 8), [products]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [visibleSuggestions.length, activeSearchRowId, activeSearchField]);

  const updateAnchorFromInput = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dropdownHeight = 250;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
    const width = Math.max(rect.width, 320);
    // Right-align to the cell in RTL while keeping within viewport
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setDropdownAnchor({
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      left,
      width,
      openUpward,
    });
  }, []);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const reposition = () => updateAnchorFromInput(activeInputRef.current);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [isDropdownOpen, updateAnchorFromInput]);

  const handleSelectProduct = useCallback(
    (rowId: string, product: ProductSearchResult) => {
      const currentRow = useRequisitionsStore.getState().items.find(row => row.id === rowId);
      updateItem(rowId, {
        productId: product.id,
        name: product.name_ar || '',
        partNumber: (product.part_number || product.sku || '').toUpperCase(),
        brand: product.brand || '',
        quantity: currentRow !== undefined && currentRow.quantity > 0 ? currentRow.quantity : 1,
      });
      setIsDropdownOpen(false);
      setActiveSearchRowId(null);
      setSearchQuery('');
    },
    [updateItem]
  );

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inGrid = gridContainerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inGrid && !inDropdown) {
        setIsDropdownOpen(false);
        setActiveSearchRowId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filteredItems = items.filter(item => {
    if (!searchTerm?.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (
      item.name.toLowerCase().includes(q) ||
      item.partNumber.toLowerCase().includes(q) ||
      item.brand.toLowerCase().includes(q) ||
      item.notes?.toLowerCase().includes(q)
    );
  });

  const filledItems = filledRequisitionItems(items);
  const totalQuantity = sumRequisitionQuantities(filledItems);
  const nonEmptyCount = filledItems.length;
  const quantityIssues = findQuantityIssues(items);
  const duplicateRowNumbers = findDuplicateRows(items);
  const duplicateRowSet = useMemo(() => new Set(duplicateRowNumbers), [duplicateRowNumbers]);
  const reorderDisabled = Boolean(searchTerm?.trim());

  const handleAutocompleteKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowId: string,
    rowIdx: number
  ) => {
    if (isDropdownOpen && activeSearchRowId === rowId) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(prev =>
          visibleSuggestions.length > 0 ? (prev + 1) % visibleSuggestions.length : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(prev =>
          visibleSuggestions.length > 0
            ? (prev - 1 + visibleSuggestions.length) % visibleSuggestions.length
            : 0
        );
        return;
      }
      if (e.key === 'Enter' && visibleSuggestions[highlightedIndex]) {
        e.preventDefault();
        handleSelectProduct(rowId, visibleSuggestions[highlightedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsDropdownOpen(false);
        return;
      }
    }

    if (e.key === 'Enter' && rowIdx === filteredItems.length - 1) {
      e.preventDefault();
      addItem();
    }
  };

  return (
    <div className="flex flex-col gap-2" ref={gridContainerRef}>
      {quantityIssues.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
          <AlertTriangle size={14} />
          <span>{quantityIssues[0]?.message}</span>
          {quantityIssues.length > 1 && <span>(و{quantityIssues.length - 1} سطر آخر)</span>}
        </div>
      )}

      {duplicateRowNumbers.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <AlertTriangle size={14} className="text-amber-600" />
          <span>
            تنبيه: يوجد أصناف مكررة في الأسطر ({duplicateRowNumbers.join('، ')}) — راجع الكميات أو
            احذف التكرار قبل الإرسال.
          </span>
        </div>
      )}

      {/* Excel Table Container with Visible Border Lines */}
      <CustomizableTableWrapper tableId="sales.requisitions" tableTitle="جدول طلبات المبيعات">
        <div className="relative overflow-x-auto rounded-lg border-2 border-slate-400 bg-white shadow-xs dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full min-w-[780px] border-collapse text-right text-[13px]">
            {/* Excel Header */}
            <thead>
              <tr className="bg-slate-900 text-white dark:bg-slate-950">
                <th className="w-12 border border-slate-600 px-2 py-2.5 text-center font-extrabold">
                  #
                </th>
                <th className="border border-slate-600 px-3 py-2.5 font-extrabold">
                  اسم القطعة المطلوبة <span className="text-amber-400">*</span>
                </th>
                <th className="w-56 border border-slate-600 px-3 py-2.5 font-extrabold">
                  رقم القطعة (Part No)
                </th>
                <th className="w-48 border border-slate-600 px-3 py-2.5 font-extrabold">
                  الشركة الصانعة (Brand)
                </th>
                <th className="w-24 border border-slate-600 px-2 py-2.5 text-center font-extrabold">
                  الكمية
                </th>
                <th className="w-60 border border-slate-600 px-3 py-2.5 font-extrabold">ملاحظات</th>
                <th className="no-print w-28 border border-slate-600 px-2 py-2.5 text-center font-extrabold">
                  إجراءات
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody>
              {filteredItems.map((item, index) => {
                const isEven = index % 2 === 0;
                const realRowNumber = items.findIndex(r => r.id === item.id) + 1;
                const isDuplicate = duplicateRowSet.has(realRowNumber);
                const isEditingQty = editingQtyRowId === item.id;
                const hasQuantityIssue =
                  !isEditingQty && !isBlankRequisitionItem(item) && item.quantity <= 0;

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      'group transition-colors',
                      isDuplicate
                        ? 'bg-amber-50/80 dark:bg-amber-950/30'
                        : isEven
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-slate-50/80 dark:bg-slate-800/40',
                      'hover:bg-blue-50/70 dark:hover:bg-slate-800/80'
                    )}
                  >
                    {/* Row Index # */}
                    <td className="border border-slate-300 bg-slate-100/80 px-1 py-1.5 text-center font-mono text-xs font-extrabold text-black dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200">
                      <div className="flex flex-col items-center justify-center">
                        <span>{realRowNumber || index + 1}</span>
                        {isDuplicate && (
                          <span
                            title="سطر مكرر"
                            className="text-[9px] font-extrabold text-amber-700 dark:text-amber-400"
                          >
                            مكرر
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Part Name Cell with Autocomplete */}
                    <td className="relative border border-slate-300 p-0 dark:border-slate-700">
                      <div className="flex h-full w-full items-center">
                        <input
                          type="text"
                          value={item.name}
                          placeholder="اكتب اسم القطعة أو ابحث في المخزن..."
                          onChange={e => {
                            const val = e.target.value;
                            updateItem(item.id, {
                              name: val,
                              ...(val.trim() === '' && item.productId ? { productId: undefined } : {}),
                            });
                            activeInputRef.current = e.currentTarget;
                            updateAnchorFromInput(e.currentTarget);
                            setActiveSearchRowId(item.id);
                            setActiveSearchField('name');
                            setSearchQuery(val);
                            setIsDropdownOpen(val.trim().length >= 2);
                          }}
                          onFocus={e => {
                            activeInputRef.current = e.currentTarget;
                            updateAnchorFromInput(e.currentTarget);
                            setActiveSearchRowId(item.id);
                            setActiveSearchField('name');
                            if (item.name.trim().length >= 2 && !item.productId) {
                              setSearchQuery(item.name);
                              setIsDropdownOpen(true);
                            }
                          }}
                          onKeyDown={e => handleAutocompleteKeyDown(e, item.id, index)}
                          className="h-9 w-full bg-transparent px-2.5 py-1 text-[13px] font-bold text-black outline-none placeholder:font-normal placeholder:text-slate-400 focus:bg-blue-50/50 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-blue-950/30"
                        />
                        {item.productId && (
                          <button
                            type="button"
                            onClick={() => {
                              updateItem(item.id, { productId: undefined });
                            }}
                            title="مرتبط بصنف من المخزون — اضغط لفك الربط"
                            className="mx-1.5 flex shrink-0 items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300"
                          >
                            <Sparkles size={11} />
                            <span>مرتبط</span>
                            <X size={10} className="mr-0.5 opacity-70" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Part Number (رقم القطعة) Cell with Autocomplete */}
                    <td className="relative border border-slate-300 p-0 dark:border-slate-700">
                      <input
                        type="text"
                        dir="ltr"
                        value={item.partNumber}
                        placeholder="e.g. 12345-ABC"
                        onChange={e => {
                          const val = e.target.value.toUpperCase();
                          updateItem(item.id, { partNumber: val });
                          activeInputRef.current = e.currentTarget;
                          updateAnchorFromInput(e.currentTarget);
                          setActiveSearchRowId(item.id);
                          setActiveSearchField('partNumber');
                          setSearchQuery(val);
                          setIsDropdownOpen(val.trim().length >= 2);
                        }}
                        onFocus={e => {
                          activeInputRef.current = e.currentTarget;
                          updateAnchorFromInput(e.currentTarget);
                          setActiveSearchRowId(item.id);
                          setActiveSearchField('partNumber');
                          if (item.partNumber.trim().length >= 2 && !item.productId) {
                            setSearchQuery(item.partNumber);
                            setIsDropdownOpen(true);
                          }
                        }}
                        onKeyDown={e => handleAutocompleteKeyDown(e, item.id, index)}
                        className="h-9 w-full bg-transparent px-2.5 py-1 text-left font-mono text-[13px] font-extrabold text-black outline-none placeholder:font-normal placeholder:text-slate-400 focus:bg-blue-50/50 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-blue-950/30"
                      />
                    </td>

                    {/* Manufacturer / Brand (الشركة الصانعة) Cell */}
                    <td className="border border-slate-300 p-0 dark:border-slate-700">
                      <input
                        type="text"
                        value={item.brand}
                        placeholder="تويوتا، بوش، دنسو..."
                        onChange={e => {
                          updateItem(item.id, { brand: e.target.value });
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && index === filteredItems.length - 1) {
                            e.preventDefault();
                            addItem();
                          }
                        }}
                        className="h-9 w-full bg-transparent px-2.5 py-1 text-[13px] font-bold text-black outline-none placeholder:font-normal placeholder:text-slate-400 focus:bg-blue-50/50 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-blue-950/30"
                      />
                    </td>

                    {/* Quantity (الكمية) Cell */}
                    <td className="border border-slate-300 p-0 text-center dark:border-slate-700">
                      <div className="flex h-9 items-center justify-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          dir="ltr"
                          value={
                            isEditingQty
                              ? editingQtyDraft
                              : hasQuantityIssue
                                ? ''
                                : String(item.quantity)
                          }
                          placeholder="0"
                          title={hasQuantityIssue ? 'الكمية غير صحيحة — أدخل رقماً أكبر من صفر' : ''}
                          onFocus={e => {
                            setEditingQtyRowId(item.id);
                            setEditingQtyDraft(item.quantity > 0 ? String(item.quantity) : '');
                            e.currentTarget.select();
                          }}
                          onChange={e => {
                            const raw = e.target.value;
                            setEditingQtyDraft(raw);
                            const normalized = normalizeArabicDigits(raw).trim();
                            if (normalized === '') {
                              updateItem(item.id, { quantity: 0 });
                              return;
                            }
                            const parsed = parseNumberFlexible(normalized);
                            updateItem(item.id, {
                              quantity: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
                            });
                          }}
                          onBlur={() => {
                            setEditingQtyRowId(null);
                            setEditingQtyDraft('');
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && index === filteredItems.length - 1) {
                              e.preventDefault();
                              addItem();
                            }
                          }}
                          className={cn(
                            'h-full w-full bg-transparent text-center font-mono text-[13px] font-extrabold outline-none',
                            hasQuantityIssue
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                              : 'text-black focus:bg-blue-100/60 dark:text-blue-200 dark:focus:bg-blue-950/50'
                          )}
                        />
                      </div>
                    </td>

                    {/* Notes (ملاحظات) Cell */}
                    <td className="border border-slate-300 p-0 dark:border-slate-700">
                      <input
                        type="text"
                        value={item.notes || ''}
                        placeholder="موديل، سنة الصنع، مواصفات خاصة..."
                        onChange={e => {
                          updateItem(item.id, { notes: e.target.value });
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && index === filteredItems.length - 1) {
                            e.preventDefault();
                            addItem();
                          }
                        }}
                        className="h-9 w-full bg-transparent px-2.5 py-1 text-[13px] font-bold text-black outline-none placeholder:font-normal placeholder:text-slate-400 focus:bg-blue-50/50 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-blue-950/30"
                      />
                    </td>

                    {/* Actions (إجراءات) */}
                    <td className="no-print border border-slate-300 px-1 py-1 text-center dark:border-slate-700">
                      <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            duplicateItem(item.id);
                          }}
                          title="تكرار السطر"
                          className="rounded p-1 text-slate-600 hover:bg-slate-200 hover:text-black dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            moveItem(item.id, 'up');
                          }}
                          disabled={index === 0 || reorderDisabled}
                          title={reorderDisabled ? 'أزل البحث السريع لإعادة الترتيب' : 'تحريك لأعلى'}
                          className="rounded p-1 text-slate-600 hover:bg-slate-200 hover:text-black disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            moveItem(item.id, 'down');
                          }}
                          disabled={index === filteredItems.length - 1 || reorderDisabled}
                          title={reorderDisabled ? 'أزل البحث السريع لإعادة الترتيب' : 'تحريك لأسفل'}
                          className="rounded p-1 text-slate-600 hover:bg-slate-200 hover:text-black disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            removeItem(item.id);
                          }}
                          title="حذف السطر"
                          className="rounded p-1 text-rose-600 hover:bg-rose-100 hover:text-rose-800 dark:hover:bg-rose-950/60"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Table Footer with Summary */}
            <tfoot>
              <tr className="bg-slate-100 font-extrabold text-black dark:bg-slate-800/90 dark:text-white">
                <td
                  colSpan={4}
                  className="border border-slate-300 px-4 py-2.5 text-left dark:border-slate-700"
                >
                  <span>إجمالي الأصناف المعبأة: </span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">
                    {nonEmptyCount}
                  </span>{' '}
                  <span>من إجمالي {items.length} سطر | إجمالي الكمية المطلوبة:</span>
                </td>
                <td className="border border-slate-300 px-2 py-2.5 text-center font-mono text-sm font-extrabold text-blue-800 dark:border-slate-700 dark:text-blue-300">
                  {totalQuantity}
                </td>
                <td
                  colSpan={2}
                  className="border border-slate-300 px-3 py-2.5 text-left text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  💡 يمكنك البحث بالاسم أو رقم القطعة (أسهم + Enter للاختيار)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CustomizableTableWrapper>

      {/* Fixed-position Autocomplete Popup (never clipped by table overflow-x-auto!) */}
      {isDropdownOpen && activeSearchRowId && dropdownAnchor && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownAnchor.openUpward ? undefined : dropdownAnchor.top,
            bottom: dropdownAnchor.openUpward
              ? window.innerHeight - dropdownAnchor.top
              : undefined,
            left: dropdownAnchor.left,
            width: dropdownAnchor.width,
            zIndex: 70,
          }}
          className="max-h-64 overflow-y-auto rounded-xl border-2 border-blue-400 bg-white p-1.5 shadow-2xl dark:border-blue-700 dark:bg-slate-900"
          dir="rtl"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-2 py-1 text-[11px] font-extrabold text-black dark:border-slate-800 dark:text-slate-200">
            <span>
              نتائج المخزون ({activeSearchField === 'partNumber' ? 'برقم القطعة' : 'بالاسم'}):
            </span>
            <button
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
              }}
              className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-black dark:hover:bg-slate-800"
            >
              <X size={13} />
            </button>
          </div>

          {isSearchLoading ? (
            <div className="p-3 text-center text-xs font-bold text-slate-600">
              جاري البحث في المخزون...
            </div>
          ) : visibleSuggestions.length === 0 ? (
            <div className="p-3 text-center text-xs font-bold text-slate-600">
              لا توجد مطابقة في المخزون، يمكنك المتابعة والكتابة يدوياً
            </div>
          ) : (
            visibleSuggestions.map((prod, idx) => (
              <button
                key={prod.id}
                type="button"
                onMouseDown={e => {
                  e.preventDefault();
                  handleSelectProduct(activeSearchRowId, prod);
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={cn(
                  'flex w-full flex-col gap-0.5 rounded-lg p-2 text-right transition-colors',
                  idx === highlightedIndex
                    ? 'bg-blue-100 dark:bg-blue-950/70'
                    : 'hover:bg-blue-50 dark:hover:bg-slate-800'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-black dark:text-white">
                    {prod.name_ar}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] font-extrabold text-blue-700 dark:text-blue-400">
                    {prod.part_number || prod.sku || 'بدون رقم'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  <span>{prod.brand ? 'الشركة: ' + prod.brand : 'بدون شركة صانعة'}</span>
                  <span className={prod.quantity <= 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}>
                    الرصيد: {prod.quantity ?? 0}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Quick Add Row Button */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => {
            addItem();
          }}
          className="shadow-2xs flex items-center gap-1.5 rounded-lg border border-dashed border-slate-400 bg-white px-3 py-1.5 text-xs font-extrabold text-black transition-colors hover:border-emerald-600 hover:bg-emerald-50/50 hover:text-emerald-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:border-emerald-500 dark:hover:bg-emerald-950/30"
        >
          <Plus size={14} className="text-emerald-600" />
          <span>إضافة سطر صنف جديد</span>
        </button>

        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
          اضغط Enter في آخر سطر لإضافة سطر جديد تلقائياً
        </span>
      </div>
    </div>
  );
};
