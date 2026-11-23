import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  Loader2,
  Package,
  RefreshCw,
  Ruler,
  Search,
  ShieldCheck,
} from 'lucide-react';
import Button from '../../../ui/base/Button';
import { cn, formatCurrency } from '../../../core/utils';
import {
  useDuplicateProductGroups,
  useMergeDuplicateProduct,
} from '../hooks/useProductDuplicates';
import type { DuplicateProductGroup, DuplicateProductItem } from '../api/productMergeApi';
import { EntityInfoDot } from '../../entity-inspector';

const PAGE_SIZE = 25;

/**
 * استخراج المقاس من عمود `size` أولاً، وفي حال كان فارغاً يُستخرج ذكياً من اسم القطعة
 * (مثل: STD، 0.25، 0.50، 0.75، 25، 50، 75، 100، أو أبعاد الصوف 45*65*8).
 */
function resolveDisplaySize(item: DuplicateProductItem): { value: string; inferred: boolean } {
  const explicit = (item.size ?? '').trim();
  if (explicit && explicit !== '-' && explicit !== '0') {
    return { value: explicit, inferred: false };
  }
  const name = item.name_ar || '';
  const dimMatch = name.match(/\b\d{1,3}(?:\.\d+)?\s*[*xX×]\s*\d{1,3}(?:\.\d+)?(?:\s*[*xX×]\s*\d{1,3}(?:\.\d+)?)?\b/);
  if (dimMatch) {
    return { value: dimMatch[0].replace(/\s+/g, ''), inferred: true };
  }
  const stdMatch = name.match(/\b(STD|0\.25|0\.50|0\.75|1\.00|025|050|075|100)\b/i);
  if (stdMatch) {
    return { value: stdMatch[1].toUpperCase(), inferred: true };
  }
  const arSizeMatch = name.match(/(?:مقاس|قياس)\s*[:\-]?\s*([^\s،,()]+)/);
  if (arSizeMatch?.[1]) {
    return { value: arSizeMatch[1], inferred: true };
  }
  return { value: '—', inferred: false };
}

const DuplicateProductsMergeView: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pageIdx, setPageIdx] = useState(0);
  const [selectedMasters, setSelectedMasters] = useState<Record<string, string>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPageIdx(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isFetching, isError, refetch } = useDuplicateProductGroups({
    search: debouncedSearch,
    limit: PAGE_SIZE,
    offset: pageIdx * PAGE_SIZE,
  });

  const mergeMutation = useMergeDuplicateProduct();

  const groups = data?.groups ?? [];
  const totalGroups = data?.total_groups ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalGroups / PAGE_SIZE));

  const getMasterId = (group: DuplicateProductGroup): string => {
    const key = `${group.norm_pn}::${group.norm_brand}::${group.category_name ?? ''}`;
    const chosen = selectedMasters[key];
    if (chosen && group.items.some(i => i.id === chosen)) return chosen;
    return group.items[0]?.id ?? '';
  };

  const handleConfirmMerge = async (masterId: string, duplicateId: string) => {
    try {
      await mergeMutation.mutateAsync({ masterId, duplicateId });
      setConfirmKey(null);
    } catch {
      // Handled via mutation onError toast
    }
  };

  let runningRowNum = pageIdx * PAGE_SIZE;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--app-bg)] p-2 md:p-3">
      <div className="flex h-full w-full flex-col gap-2 overflow-hidden">
        {/* Compact Full-Width Toolbar */}
        <div className="flex flex-none flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400">
              <GitMerge size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black leading-tight text-[var(--app-text)]">
                مركز مراجعة ودمج الأصناف المكررة (عرض جدول إكسل)
              </h2>
              <p className="mt-0.5 text-[11px] font-semibold text-[var(--app-text-secondary)]">
                إجمالي المجموعات المرشحة:{' '}
                <strong className="font-mono text-xs font-black text-orange-600 dark:text-orange-400">
                  {totalGroups.toLocaleString()}
                </strong>{' '}
                مجموعة — يُنقل مخزون كل فرع وفواتيره بدقة إلى الصنف الرئيسي المعتمد.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-72 max-w-full sm:w-80">
              <Search
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)]"
              />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="بحث برقم القطعة، الشركة، الاسم، المقاس، SKU..."
                className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] py-1.5 pl-3 pr-9 text-xs font-bold text-[var(--app-text)] focus:border-orange-500 focus:outline-none"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void refetch();
              }}
              isLoading={isFetching}
              leftIcon={<RefreshCw size={14} />}
            >
              تحديث
            </Button>
          </div>
        </div>

        {/* Concise Technical Safety Strip */}
        <div className="flex flex-none items-center gap-2 rounded-lg border border-amber-300/80 bg-amber-50/90 px-3 py-1.5 text-[11px] font-semibold text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="truncate sm:whitespace-normal">
            <strong>تنبيه فني:</strong> راجع عمود <strong>المقاس</strong> (
            <span dir="ltr" className="font-mono font-bold">
              STD / 0.25 / 0.50 / 75 / 100
            </span>
            ) و<strong>الشركة الصانعة</strong> والجهة (يمين/شمال) قبل الدمج، ثم اختر الصنف الرئيسي واضغط «دمج في الرئيسي».
          </div>
        </div>

        {/* Main Full-Height Excel Spreadsheet Container */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-xs">
          {isLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10">
              <Loader2 size={30} className="animate-spin text-orange-600" />
              <p className="text-xs font-bold text-[var(--app-text-secondary)]">
                جاري فحص ومطابقة الأصناف حسب رقم القطعة والشركة الصانعة...
              </p>
            </div>
          ) : isError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-xs font-bold text-rose-600">
                تعذر تحميل مجموعات الأصناف المكررة. يرجى المحاولة مرة أخرى.
              </p>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  void refetch();
                }}
              >
                إعادة المحاولة
              </Button>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
              <CheckCircle2 size={36} className="text-emerald-600" />
              <h3 className="text-sm font-black text-[var(--app-text)]">
                لا توجد أصناف مكررة مطابقة للبحث
              </h3>
              <p className="text-xs text-[var(--app-text-secondary)]">
                جميع الأصناف منظمة ولا توجد مجموعات متطابقة حالياً.
              </p>
            </div>
          ) : (
            <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1160px] border-collapse text-right text-xs">
                <thead className="sticky top-0 z-20 shadow-xs">
                  <tr className="border-b-2 border-[var(--app-border)] text-[11px] font-black">
                    <th className="w-10 border-l border-[var(--app-border)] px-2 py-2.5 text-center">
                      #
                    </th>
                    <th className="w-14 border-l border-[var(--app-border)] px-2 py-2.5 text-center">
                      الرئيسي
                    </th>
                    <th className="min-w-[270px] border-l border-[var(--app-border)] px-3 py-2.5">
                      اسم القطعة
                    </th>
                    <th className="w-40 border-l border-[var(--app-border)] px-3 py-2.5 text-center">
                      رقم القطعة
                    </th>
                    <th className="w-36 border-l border-[var(--app-border)] px-3 py-2.5 text-center">
                      الشركة الصانعة
                    </th>
                    <th className="w-28 border-l border-[var(--app-border)] px-2.5 py-2.5 text-center">
                      المقاس
                    </th>
                    <th className="w-28 border-l border-[var(--app-border)] px-2.5 py-2.5 text-center">
                      SKU
                    </th>
                    <th className="w-24 border-l border-[var(--app-border)] px-2.5 py-2.5 text-center">
                      سعر البيع
                    </th>
                    <th className="w-24 border-l border-[var(--app-border)] px-2.5 py-2.5 text-center">
                      التكلفة
                    </th>
                    <th className="w-16 border-l border-[var(--app-border)] px-2 py-2.5 text-center">
                      الفواتير
                    </th>
                    <th className="min-w-[155px] border-l border-[var(--app-border)] px-2.5 py-2.5">
                      المخزون بكل فرع
                    </th>
                    <th className="w-36 px-2.5 py-2.5 text-center">الإجراء</th>
                  </tr>
                </thead>

                <tbody>
                  {groups.map((group, gIdx) => {
                    const groupKey = `${group.norm_pn}::${group.norm_brand}::${group.category_name ?? ''}`;
                    const masterId = getMasterId(group);
                    const isSamePnBrand = group.norm_pn === group.norm_brand;
                    const groupNumber = pageIdx * PAGE_SIZE + gIdx + 1;

                    // كشف اختلاف المقاسات داخل نفس المجموعة لتحذير المحاسب فوراً
                    const resolvedSizes = group.items.map(resolveDisplaySize);
                    const distinctNonEmptySizes = new Set(
                      resolvedSizes.map(s => s.value.toUpperCase()).filter(v => v !== '—')
                    );
                    const hasSizeConflict = distinctNonEmptySizes.size > 1;

                    return (
                      <React.Fragment key={groupKey}>
                        {/* Excel Group Separator Row */}
                        <tr className="border-y-2 border-orange-300/70 bg-orange-50/75 dark:border-orange-900/60 dark:bg-orange-950/25">
                          <td colSpan={12} className="px-3 py-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex h-5 min-w-[24px] items-center justify-center rounded bg-orange-600 px-1.5 font-mono text-[11px] font-black text-white">
                                  #{groupNumber}
                                </span>
                                {group.category_name && (
                                  <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-black text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                                    التصنيف: {group.category_name}
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1 rounded border border-orange-300 bg-white px-2 py-0.5 font-mono text-xs font-black text-slate-950 dark:border-orange-800 dark:bg-slate-900 dark:text-orange-200">
                                  <Package size={12} className="text-orange-600" />
                                  {group.norm_pn.toUpperCase()}
                                </span>
                                <span className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-black text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200">
                                  الشركة: {group.norm_brand}
                                </span>
                                <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300">
                                  ({group.group_count} أصناف متطابقة)
                                </span>
                                {hasSizeConflict && (
                                  <span className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-100 px-2 py-0.5 text-[11px] font-black text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                                    <Ruler size={11} />
                                    تنبيه: اختلاف مقاسات داخل المجموعة!
                                  </span>
                                )}
                                {isSamePnBrand && (
                                  <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                                    <AlertTriangle size={11} />
                                    رقم القطعة مكتوب في خانة الشركة — راجع الماركة الفعلية
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* Excel Item Rows */}
                        {group.items.map((item, itemIdx) => {
                          runningRowNum += 1;
                          const isMaster = item.id === masterId;
                          const rowConfirmKey = `${masterId}::${item.id}`;
                          const isConfirming = confirmKey === rowConfirmKey;
                          const isBusy =
                            mergeMutation.isPending &&
                            mergeMutation.variables?.duplicateId === item.id;
                          const sizeInfo = resolvedSizes[itemIdx];

                          return (
                            <tr
                              key={item.id}
                              className={cn(
                                'border-b border-[var(--app-border)] transition-colors',
                                isMaster
                                  ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                                  : itemIdx % 2 === 1
                                    ? 'bg-[var(--app-zebra)] hover:bg-orange-50/40 dark:hover:bg-slate-800/60'
                                    : 'bg-[var(--app-surface)] hover:bg-orange-50/40 dark:hover:bg-slate-800/60'
                              )}
                            >
                              {/* Row Index */}
                              <td className="border-l border-[var(--app-border)] px-2 py-2 text-center font-mono text-[11px] font-bold text-[var(--app-text-secondary)]">
                                {runningRowNum}
                              </td>

                              {/* Master Selector */}
                              <td className="border-l border-[var(--app-border)] px-2 py-2 text-center">
                                <input
                                  type="radio"
                                  name={`master-${groupKey}`}
                                  checked={isMaster}
                                  onChange={() => {
                                    setSelectedMasters(prev => ({
                                      ...prev,
                                      [groupKey]: item.id,
                                    }));
                                    setConfirmKey(null);
                                  }}
                                  aria-label={`اعتماد ${item.name_ar} كصنف رئيسي`}
                                  className="h-4 w-4 cursor-pointer accent-orange-600"
                                />
                              </td>

                              {/* اسم القطعة — مُعمّق وبارز */}
                              <td className="border-l border-[var(--app-border)] px-3 py-2">
                                <div className="flex items-start gap-1.5">
                                  <EntityInfoDot
                                    type="product"
                                    id={item.id}
                                    label={item.name_ar}
                                    size="xs"
                                    className="mt-0.5 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <div className="text-[13.5px] font-black leading-snug text-slate-950 dark:text-white">
                                      {item.name_ar}
                                    </div>
                                    {isMaster && (
                                      <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                        <ShieldCheck size={11} />
                                        الصنف الرئيسي المعتمد (سيبقى)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* رقم القطعة — مُعمّق وواضح */}
                              <td
                                className="border-l border-[var(--app-border)] bg-orange-50/45 px-3 py-2 text-center font-mono text-[13px] font-black tracking-wide text-slate-950 dark:bg-orange-950/20 dark:text-orange-200"
                                dir="ltr"
                              >
                                {item.part_number || '—'}
                              </td>

                              {/* الشركة الصانعة — مُعمّق وبارز */}
                              <td className="border-l border-[var(--app-border)] bg-indigo-50/40 px-3 py-2 text-center text-[13px] font-black text-indigo-950 dark:bg-indigo-950/20 dark:text-indigo-200">
                                {item.brand || '—'}
                              </td>

                              {/* المقاس — عمود مخصص مُعمّق */}
                              <td
                                className={cn(
                                  'border-l border-[var(--app-border)] px-2.5 py-2 text-center font-mono text-[13px] font-black',
                                  sizeInfo.value !== '—'
                                    ? 'bg-amber-50/65 text-amber-950 dark:bg-amber-950/25 dark:text-amber-200'
                                    : 'text-[var(--app-text-secondary)]'
                                )}
                                dir="ltr"
                                title={
                                  sizeInfo.inferred
                                    ? 'مستخرج تلقائياً من اسم القطعة'
                                    : 'المقاس المسجل في بطاقة الصنف'
                                }
                              >
                                {sizeInfo.value}
                              </td>

                              {/* SKU */}
                              <td
                                className="border-l border-[var(--app-border)] px-2.5 py-2 text-center font-mono text-[11px] font-bold text-[var(--app-text-secondary)]"
                                dir="ltr"
                              >
                                {item.sku}
                              </td>

                              {/* سعر البيع */}
                              <td
                                className="border-l border-[var(--app-border)] px-2.5 py-2 text-center font-mono text-xs font-extrabold text-slate-900 dark:text-slate-100"
                                dir="ltr"
                              >
                                {formatCurrency(item.sale_price)}
                              </td>

                              {/* التكلفة */}
                              <td
                                className="border-l border-[var(--app-border)] px-2.5 py-2 text-center font-mono text-xs font-semibold text-[var(--app-text-secondary)]"
                                dir="ltr"
                              >
                                {formatCurrency(item.cost_price)}
                              </td>

                              {/* الفواتير */}
                              <td className="border-l border-[var(--app-border)] px-2 py-2 text-center font-mono text-xs font-black text-slate-900 dark:text-slate-100">
                                {item.invoice_count}
                              </td>

                              {/* المخزون بكل فرع */}
                              <td className="border-l border-[var(--app-border)] px-2.5 py-2">
                                {item.stock_by_branch && item.stock_by_branch.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {item.stock_by_branch.map((sb, idx) => (
                                      <span
                                        key={idx}
                                        className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                                      >
                                        {sb.branch_name}:{' '}
                                        <span className="font-mono font-black">{sb.quantity}</span>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="font-mono text-[11px] font-bold text-[var(--app-text-secondary)]">
                                    0
                                  </span>
                                )}
                              </td>

                              {/* الإجراء */}
                              <td className="px-2.5 py-2 text-center">
                                {isMaster ? (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                    <ShieldCheck size={12} />
                                    الرئيسي
                                  </span>
                                ) : isConfirming ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      disabled={mergeMutation.isPending}
                                      onClick={() => {
                                        void handleConfirmMerge(masterId, item.id);
                                      }}
                                      className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-black text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                      {isBusy ? '...' : 'تأكيد'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={mergeMutation.isPending}
                                      onClick={() => setConfirmKey(null)}
                                      className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[11px] font-bold text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]"
                                    >
                                      إلغاء
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={mergeMutation.isPending}
                                    onClick={() => setConfirmKey(rowConfirmKey)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1 text-[11px] font-black text-orange-800 transition-colors hover:bg-orange-600 hover:text-white disabled:opacity-50 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300 dark:hover:bg-orange-600 dark:hover:text-white"
                                  >
                                    <GitMerge size={12} />
                                    دمج في الرئيسي
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pinned Bottom Pagination Bar */}
          {totalGroups > PAGE_SIZE && (
            <div className="flex flex-none items-center justify-between border-t border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-xs">
              <span className="font-bold text-[var(--app-text-secondary)]">
                صفحة <strong className="font-mono text-[var(--app-text)]">{pageIdx + 1}</strong> من{' '}
                <strong className="font-mono text-[var(--app-text)]">{totalPages}</strong> (إجمالي{' '}
                <strong className="font-mono text-orange-600 dark:text-orange-400">
                  {totalGroups.toLocaleString()}
                </strong>{' '}
                مجموعة)
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pageIdx === 0 || isFetching}
                  onClick={() => setPageIdx(p => Math.max(0, p - 1))}
                >
                  السابق
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pageIdx + 1 >= totalPages || isFetching}
                  onClick={() => setPageIdx(p => p + 1)}
                >
                  التالي
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DuplicateProductsMergeView;
