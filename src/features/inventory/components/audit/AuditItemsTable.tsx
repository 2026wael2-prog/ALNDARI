import React from 'react';
import type { UseFormRegister } from 'react-hook-form';
import { Trash2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { formatNumberDisplay } from '../../../../core/utils';
import { cn } from '../../../../core/utils';
import { normalizeSearch } from '../../../../core/utils/search';
import { parseCountedInput, toCountedQuantity } from '../../utils/auditQuantity';

export interface AuditItemTarget {
  id?: string;
  productId: string;
  name?: string;
}

export type AuditStatusFilter = 'all' | 'discrepancy' | 'matched' | 'uncounted';

interface Props {
  items: any[];
  register: UseFormRegister<any>;
  filter: string;
  category?: string | null;
  statusFilter?: AuditStatusFilter;
  isCompleted: boolean;
  onRemoveItem?: (target: AuditItemTarget) => void;
  onSave?: () => void;
}

const AuditItemsTable: React.FC<Props> = ({
  items,
  register,
  filter,
  category,
  statusFilter = 'all',
  isCompleted,
  onRemoveItem,
  onSave,
}) => {
  // [PERF-FIX] كانت التصفية والمجاميع تُحسب عند كل رسم (3 مرات على الأقل
  // للمصفوفة نفسها). الآن تُحسب مرة واحدة وتُخزَّن حتى تتغيّر الأصناف أو
  // المرشّحات، مع مرور واحد لحساب كل المجاميع.
  const filteredFields = React.useMemo(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- أصناف الجرد تصل كصفوف legacy من الخدمة (`any[]`) ولم تُنمذج بعد
      items
        .map((item, index) => ({ ...item, index }))
        .filter(field => {
          const product = field.products;
          if (!product) return false;
          // [FIX — تطبيع عربي] كانت التصفية تقارن `toLowerCase` الخام، بينما بحث
          // القاعدة مطبَّع (همزات/تاء مربوطة/أرقام عربية)، فيظهر «لا توجد أصناف
          // مطابقة» رغم وجود النتائج. الآن نفس تطبيع `normalizeSearch` وبكل كلمة.
          const searchTokens = normalizeSearch(filter).split(/\s+/).filter(Boolean);
          const haystack = normalizeSearch(
            [product.name, product.sku, product.part_number].filter(Boolean).join(' ')
          );
          const matchesSearch = searchTokens.every(token => haystack.includes(token));
          const matchesCategory = !category || product.category === category;

          // Status filter — أي قيمة غير منتهية (NaN/فراغ) تعني «غير مجرود».
          const counted = toCountedQuantity(field.counted_quantity);
          const isCounted = counted !== null;
          const expected = toCountedQuantity(field.expected_quantity) ?? 0;
          const isDiscrepancy = counted !== null && counted !== expected;
          const isMatched = counted !== null && counted === expected;

          let matchesStatus = true;
          if (statusFilter === 'discrepancy') matchesStatus = isDiscrepancy;
          else if (statusFilter === 'matched') matchesStatus = isMatched;
          else if (statusFilter === 'uncounted') matchesStatus = !isCounted;

          return matchesSearch && matchesCategory && matchesStatus;
        }),
    [items, filter, category, statusFilter]
  );

  const stats = React.useMemo(() => {
    let totalExpected = 0;
    let totalCounted = 0;
    let totalDiff = 0;
    let countedCount = 0;
    let discrepancyCount = 0;

    for (const field of filteredFields) {
      const expected = toCountedQuantity(field.expected_quantity) ?? 0;
      totalExpected += expected;

      const counted = toCountedQuantity(field.counted_quantity);
      if (counted === null) continue;

      const difference = counted - expected;
      totalCounted += counted;
      totalDiff += difference;
      countedCount += 1;
      if (difference !== 0) discrepancyCount += 1;
    }

    return {
      totalExpected,
      totalCounted,
      totalDiff,
      countedCount,
      pendingCount: filteredFields.length - countedCount,
      discrepancyCount,
    };
  }, [filteredFields]);

  const { totalExpected, totalCounted, totalDiff, countedCount, pendingCount, discrepancyCount } =
    stats;

  const showActions = !isCompleted && !!onRemoveItem;

  if (filteredFields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-[var(--app-surface)] py-16 text-center dark:border-slate-800">
        <Clock size={32} className="mb-3 text-gray-300 dark:text-slate-600" strokeWidth={1.5} />
        <p className="text-sm font-bold text-gray-500 dark:text-slate-500">لا توجد أصناف مطابقة</p>
        <p className="mt-1 text-xs text-gray-400 dark:text-slate-600">
          جرّب تغيير فلتر البحث أو الفئة
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-[var(--app-surface)] shadow-sm dark:border-slate-800">
      <div className="table-scroll-viewport custom-scrollbar overflow-x-auto">
        <table className="w-full border-collapse text-right text-xs">
          <thead className="sticky top-0 z-10 border-b-2 border-slate-700 bg-slate-800 font-bold uppercase tracking-wider text-white dark:bg-slate-900">
            <tr className="bg-slate-800 dark:bg-slate-900">
              <th className="w-8 border-l border-slate-700 p-2 text-center text-[10px] sm:w-10 sm:p-3 sm:text-xs">
                #
              </th>
              <th className="min-w-[120px] border-l border-slate-700 p-2 text-[10px] sm:min-w-[180px] sm:p-3 sm:text-xs">
                الصنف
              </th>
              <th className="hidden w-28 border-l border-slate-700 p-3 text-center md:table-cell">
                رقم القطعة
              </th>
              <th className="hidden w-20 border-l border-slate-700 p-3 text-center text-[10px] sm:text-xs lg:table-cell">
                المقاس
              </th>
              <th className="hidden w-20 border-l border-slate-700 p-3 text-center text-[10px] sm:text-xs lg:table-cell">
                الفئة
              </th>
              <th className="w-16 border-l border-slate-700 bg-blue-900/30 p-2 text-center text-[10px] sm:w-28 sm:p-3 sm:text-xs">
                دفتر
              </th>
              <th className="w-24 border-l border-slate-700 bg-emerald-900/30 p-2 text-center text-[10px] text-emerald-300 sm:w-36 sm:p-3 sm:text-xs">
                فعل ✏️
              </th>
              <th className="w-16 border-l border-slate-700 p-2 text-center text-[10px] sm:w-24 sm:p-3 sm:text-xs">
                الفرق
              </th>
              {showActions && (
                <th className="w-8 p-2 text-center text-[10px] sm:w-12 sm:p-3 sm:text-xs">X</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-slate-800">
            {filteredFields.map((field, index) => {
              const product = field.products;
              const expectedQty = toCountedQuantity(field.expected_quantity) ?? 0;
              const countedQty = toCountedQuantity(field.counted_quantity);
              const isCounted = countedQty !== null;
              const diff = countedQty === null ? null : countedQty - expectedQty;

              return (
                <tr
                  key={field.id || field.audit_item_id || field.product_id || `item-${index}`}
                  className={cn(
                    'transition-colors',
                    !isCounted && 'bg-amber-50/30 dark:bg-amber-900/5',
                    diff !== null && diff !== 0
                      ? diff > 0
                        ? 'bg-emerald-50/40 dark:bg-emerald-900/10'
                        : 'bg-rose-50/40 dark:bg-rose-900/10'
                      : isCounted
                        ? 'hover:bg-gray-50/50 dark:hover:bg-slate-800/30'
                        : ''
                  )}
                >
                  <td className="border-l p-2 text-center font-mono text-[10px] text-gray-400 dark:border-slate-800 sm:p-3 sm:text-[10px]">
                    {index + 1}
                  </td>
                  <td className="max-w-[140px] border-l p-2 dark:border-slate-800 sm:max-w-none sm:p-3">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {isCounted ? (
                        <CheckCircle2 size={10} className="shrink-0 text-emerald-500" />
                      ) : (
                        <Clock size={10} className="shrink-0 animate-pulse text-amber-400" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-black leading-tight text-gray-900 dark:text-slate-100 sm:text-xs">
                          {product?.name_ar || product?.name}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          {product?.part_number && (
                            <span className="rounded bg-blue-50 px-1 font-mono text-[10px] font-black uppercase tracking-tighter text-blue-600 dark:bg-blue-900/30 sm:hidden">
                              #{product.part_number}
                            </span>
                          )}
                          {product?.brand && (
                            <span className="text-[10px] font-bold uppercase text-blue-500 sm:text-[10px]">
                              {product.brand}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden border-l p-3 text-center font-mono font-bold text-gray-600 dark:border-slate-800 dark:text-slate-400 md:table-cell">
                    <span
                      className={cn(
                        !product?.part_number &&
                          'text-[10px] font-normal italic text-gray-300 dark:text-slate-700'
                      )}
                    >
                      {product?.part_number || 'غير متوفر'}
                    </span>
                  </td>
                  <td className="hidden border-l p-3 text-center font-mono font-bold text-gray-500 dark:border-slate-800 dark:text-slate-500 lg:table-cell">
                    {product?.size || '—'}
                  </td>
                  <td className="hidden border-l p-3 text-center dark:border-slate-800 lg:table-cell">
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-600 dark:bg-teal-900/20 dark:text-teal-400">
                      {product?.category || 'عام'}
                    </span>
                  </td>
                  <td className="border-l bg-blue-50/30 p-2 text-center font-mono text-sm font-black text-blue-600 dark:border-slate-800 dark:bg-blue-900/5 dark:text-blue-400 sm:p-3 sm:text-lg">
                    {formatNumberDisplay(expectedQty)}
                  </td>
                  <td className="border-l bg-emerald-50/20 p-1 text-center dark:border-slate-800 dark:bg-emerald-900/5 sm:p-2">
                    {isCompleted ? (
                      <div className="py-1 text-center sm:py-2">
                        <span className="font-mono text-base font-black text-emerald-600 dark:text-emerald-400 sm:text-2xl">
                          {countedQty === null ? '—' : formatNumberDisplay(countedQty)}
                        </span>
                      </div>
                    ) : (
                      <input
                        key={`qty-${field.id || field.audit_item_id || field.product_id}`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        aria-label={`الكمية الفعلية للصنف ${String(product?.name_ar || product?.name || '')}`}
                        defaultValue={countedQty === null ? '' : countedQty}
                        {...register(`items.${field.index}.counted_quantity`, {
                          // [FIX — NaN] الحقل الفارغ كان يُرجع `NaN` (valueAsNumber)
                          // فيظهر «NaN» في الفرق ويُرسل `null` يمسح الكمية المحفوظة.
                          // الآن الفراغ = `null` صريح، وأي رقم صالح يبقى كما هو.
                          setValueAs: parseCountedInput,
                          onBlur: () => {
                            if (onSave) onSave();
                          },
                        })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className="h-10 w-full rounded-lg border border-emerald-200 bg-white text-center font-mono text-base font-black text-gray-900 shadow-sm outline-none transition-all focus:border-emerald-500 dark:border-emerald-900/50 dark:bg-slate-950 dark:text-white sm:h-14 sm:rounded-xl sm:text-2xl"
                        placeholder="0"
                      />
                    )}
                  </td>
                  <td
                    className={cn(
                      'border-l p-2 text-center font-mono text-sm font-black dark:border-slate-800 sm:p-3 sm:text-lg',
                      diff === null
                        ? 'text-gray-300 dark:text-slate-700'
                        : diff > 0
                          ? 'text-emerald-500'
                          : diff < 0
                            ? 'text-rose-500'
                            : 'text-gray-400'
                    )}
                  >
                    {diff !== null ? (diff > 0 ? `+${diff}` : diff) : '—'}
                  </td>
                  {showActions && (
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          onRemoveItem({
                            id: field.id || field.audit_item_id,
                            productId: String(field.product_id || product?.id || ''),
                            name: product?.name_ar || product?.name,
                          });
                        }}
                        className="rounded-lg border border-transparent p-1.5 text-rose-400 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:hover:border-rose-900/40 dark:hover:bg-rose-900/20"
                        title="إزالة من الجلسة"
                        aria-label={`إزالة ${String(product?.name_ar || product?.name || 'الصنف')} من الجلسة`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>

          {/* ── Footer Row ── */}
          <tfoot className="border-t-2 border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60">
            <tr className="text-xs font-black">
              <td colSpan={2} className="border-l p-3 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <span className="text-gray-600 dark:text-slate-300">
                    الإجمالي:{' '}
                    <span className="text-blue-600 dark:text-blue-400">
                      {filteredFields.length} صنف
                    </span>
                  </span>
                  {pendingCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <Clock size={10} /> {pendingCount} متبقٍ
                    </span>
                  )}
                  {countedCount > 0 && (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={10} /> {countedCount} مجرود
                    </span>
                  )}
                </div>
              </td>
              <td
                colSpan={3}
                className="hidden border-l p-3 text-center text-gray-400 dark:border-slate-700 md:table-cell"
              ></td>
              <td className="border-l bg-blue-50/30 p-3 text-center font-mono text-blue-600 dark:border-slate-700 dark:text-blue-400">
                {formatNumberDisplay(totalExpected)}
              </td>
              <td className="border-l bg-emerald-50/20 p-3 text-center font-mono text-emerald-600 dark:border-slate-700 dark:text-emerald-400">
                {formatNumberDisplay(totalCounted)}
              </td>
              <td
                className={cn(
                  'border-l p-3 text-center font-mono text-lg dark:border-slate-700',
                  totalDiff > 0
                    ? 'text-emerald-600'
                    : totalDiff < 0
                      ? 'text-rose-600'
                      : 'text-gray-400'
                )}
              >
                {totalDiff > 0 ? `+${String(totalDiff)}` : totalDiff !== 0 ? totalDiff : '—'}
              </td>
              {showActions && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile: discrepancy summary */}
      {discrepancyCount > 0 && (
        <div className="flex items-center gap-2 border-t border-slate-100 bg-rose-50/30 p-3 dark:border-slate-800 dark:bg-rose-900/5">
          <AlertTriangle size={14} className="shrink-0 text-rose-500" />
          <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
            يوجد فروقات في {discrepancyCount} صنف — راجع الأرقام قبل الإغلاق
          </p>
        </div>
      )}
    </div>
  );
};

/** [PERF-FIX] يمنع إعادة رسم الجدول عند تغيّر حالة الأب غير المتعلقة بالأصناف. */
const MemoizedAuditItemsTable = React.memo(AuditItemsTable);

export default MemoizedAuditItemsTable;
