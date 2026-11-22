import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import Button from '../../../ui/base/Button';
import { formatCurrency } from '../../../core/utils';
import {
  useDuplicateProductGroups,
  useMergeDuplicateProduct,
} from '../hooks/useProductDuplicates';
import type { DuplicateProductGroup } from '../api/productMergeApi';

const PAGE_SIZE = 20;

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
    const key = `${group.norm_pn}::${group.norm_brand}`;
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

  return (
    <div className="custom-scrollbar h-full overflow-y-auto p-3 pb-20 md:p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        {/* Header & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <GitMerge size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black text-[var(--app-text)]">
                مركز مراجعة ودمج الأصناف المكررة (برقم القطعة والشركة الصانعة)
              </h2>
              <p className="mt-0.5 text-xs text-[var(--app-text-secondary)]">
                إجمالي المجموعات المرشحة للمراجعة:{' '}
                <strong className="font-mono text-blue-600">{totalGroups.toLocaleString()}</strong>{' '}
                مجموعة — يتم نقل أرصدة كل مستودع/فرع وفواتيره بدقة إلى الصنف الرئيسي.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[var(--app-text-secondary)]"
              />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="بحث برقم القطعة، الشركة، الاسم، SKU..."
                className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] py-1.5 pr-9 pl-3 text-xs text-[var(--app-text)]"
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

        {/* Safety Guidance Banner */}
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="leading-relaxed">
            <strong>تنبيه فني قبل الدمج:</strong> تأكد من عدم اختلاف{' '}
            <strong>المقاس</strong> (مثل <span dir="ltr">STD / 25 / 50 / 75 / 100</span> أو مقاسات الصوف)، أو{' '}
            <strong>الجهة</strong> (يمين / شمال / داخلي / خارجي)، أو <strong>المادة / اللون</strong> (حديد / كربون، بيج / أسود)، أو{' '}
            <strong>درجة الجودة</strong> (أصلي / مقلد). اختر الصنف الرئيسي (الذي يحمل الفواتير والتكلفة الصحيحة) ثم اضغط «دمج في الرئيسي».
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-10">
            <Loader2 size={28} className="animate-spin text-blue-600" />
            <p className="text-xs font-bold text-[var(--app-text-secondary)]">
              جاري فحص ومطابقة الأصناف حسب رقم القطعة والشركة الصانعة...
            </p>
          </div>
        ) : isError ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-rose-200 bg-[var(--app-surface)] p-8 text-center">
            <p className="text-xs font-bold text-rose-600">
              تعذر تحميل مجموعات الأصناف المكررة. يرجى المحاولة مرة أخرى.
            </p>
            <Button size="sm" variant="primary" onClick={() => { void refetch(); }}>
              إعادة المحاولة
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-10 text-center">
            <CheckCircle2 size={34} className="text-emerald-600" />
            <h3 className="text-sm font-black text-[var(--app-text)]">
              لا توجد أصناف مكررة مطابقة للبحث
            </h3>
            <p className="text-xs text-[var(--app-text-secondary)]">
              جميع الأصناف منظمة ولا توجد مجموعات متطابقة حالياً.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(group => {
              const groupKey = `${group.norm_pn}::${group.norm_brand}`;
              const masterId = getMasterId(group);
              const isSamePnBrand = group.norm_pn === group.norm_brand;

              return (
                <div
                  key={groupKey}
                  className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-xs"
                >
                  {/* Group Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface-hover)] px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 font-mono text-xs font-black text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                        <Package size={12} />
                        {group.norm_pn.toUpperCase()}
                      </span>
                      <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                        الشركة: {group.norm_brand}
                      </span>
                      <span className="text-xs font-bold text-[var(--app-text-secondary)]">
                        ({group.group_count} أصناف)
                      </span>
                      {isSamePnBrand && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                          <AlertTriangle size={11} />
                          رقم القطعة مكتوب في خانة الشركة — راجع الماركة الفعلية في الاسم
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Group Items Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="border-b border-[var(--app-border)] text-[11px] font-bold text-[var(--app-text-secondary)]">
                          <th className="w-16 p-2.5 text-center">الرئيسي</th>
                          <th className="p-2.5">SKU</th>
                          <th className="p-2.5">اسم الصنف</th>
                          <th className="p-2.5 text-center">سعر البيع</th>
                          <th className="p-2.5 text-center">التكلفة</th>
                          <th className="p-2.5 text-center">الفواتير</th>
                          <th className="p-2.5">المخزون بكل فرع</th>
                          <th className="w-36 p-2.5 text-center">الإجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--app-border)]">
                        {group.items.map(item => {
                          const isMaster = item.id === masterId;
                          const rowConfirmKey = `${masterId}::${item.id}`;
                          const isConfirming = confirmKey === rowConfirmKey;
                          const isBusy =
                            mergeMutation.isPending &&
                            mergeMutation.variables?.duplicateId === item.id;

                          return (
                            <tr
                              key={item.id}
                              className={
                                isMaster
                                  ? 'bg-blue-50/50 dark:bg-blue-950/20'
                                  : 'hover:bg-[var(--app-surface-hover)]/60'
                              }
                            >
                              <td className="p-2.5 text-center">
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
                                  className="h-4 w-4 cursor-pointer accent-blue-600"
                                />
                              </td>
                              <td className="p-2.5 font-mono font-bold text-[var(--app-text-secondary)]">
                                {item.sku}
                              </td>
                              <td className="p-2.5">
                                <div className="font-bold text-[var(--app-text)]">
                                  {item.name_ar}
                                </div>
                                {isMaster && (
                                  <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-blue-600">
                                    <ShieldCheck size={11} />
                                    الصنف الرئيسي المعتمد (سيبقى)
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold" dir="ltr">
                                {formatCurrency(item.sale_price)}
                              </td>
                              <td className="p-2.5 text-center font-mono text-[var(--app-text-secondary)]" dir="ltr">
                                {formatCurrency(item.cost_price)}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold">
                                {item.invoice_count}
                              </td>
                              <td className="p-2.5">
                                {item.stock_by_branch && item.stock_by_branch.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {item.stock_by_branch.map((sb, idx) => (
                                      <span
                                        key={idx}
                                        className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                      >
                                        {sb.branch_name}: {sb.quantity}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-[var(--app-text-secondary)]">
                                    0
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-center">
                                {isMaster ? (
                                  <span className="rounded-md bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-700">
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
                                      className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                      {isBusy ? '...' : 'تأكيد'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={mergeMutation.isPending}
                                      onClick={() => setConfirmKey(null)}
                                      className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[11px] font-bold text-[var(--app-text-secondary)]"
                                    >
                                      إلغاء
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={mergeMutation.isPending}
                                    onClick={() => setConfirmKey(rowConfirmKey)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-600 hover:text-white disabled:opacity-50"
                                  >
                                    <GitMerge size={12} />
                                    دمج في الرئيسي
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalGroups > PAGE_SIZE && (
          <div className="flex items-center justify-between rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2.5 text-xs">
            <span className="font-bold text-[var(--app-text-secondary)]">
              صفحة {pageIdx + 1} من {totalPages} (إجمالي {totalGroups.toLocaleString()} مجموعة)
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
  );
};

export default DuplicateProductsMergeView;
