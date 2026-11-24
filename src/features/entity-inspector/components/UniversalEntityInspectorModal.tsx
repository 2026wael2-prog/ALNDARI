import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Table2,
} from 'lucide-react';
import Modal from '../../../ui/base/Modal';
import PageLoader from '../../../ui/base/PageLoader';
import { cn } from '../../../core/utils';
import { logger } from '../../../core/utils/logger';
import { useAuthStore } from '../../auth/store';
import { useBranchFilterStore } from '../../branches/store';
import { useProductMutations } from '../../inventory/hooks/useProducts';
import { useEntityInspectorStore } from '../store';
import { fetchInspectedEntity } from '../service';
import type { InspectorFieldRow, InspectorRowReturnAction } from '../types';
import { AdvancedReturnModal } from '../../returns/components/AdvancedReturnModal';
import { ENTITY_ICON_MAP, ENTITY_TYPE_LABEL, exportInspectorCsv } from './inspectorMeta';
import { InspectorBreadcrumb } from './InspectorBreadcrumb';
import { InspectorHeaderCard } from './InspectorHeaderCard';
import { InspectorOverviewGrid } from './InspectorOverviewGrid';
import { InspectorSheetTable } from './InspectorSheetTable';

const AddProductModal = lazy(() => import('../../inventory/components/AddProductModal'));

export const UniversalEntityInspectorModal: React.FC = () => {
  const stack = useEntityInspectorStore(s => s.stack);
  const back = useEntityInspectorStore(s => s.back);
  const goToIndex = useEntityInspectorStore(s => s.goToIndex);
  const close = useEntityInspectorStore(s => s.close);

  const user = useAuthStore(s => s.user);
  const activeBranchId = useBranchFilterStore(s => s.activeBranchId);
  const companyId = user?.company_id || '';
  const canViewCost = user?.role !== 'cashier' && user?.role !== 'sales_rep';
  const canEditProduct = Boolean(
    user && !['viewer', 'auditor', 'cashier', 'sales_rep'].includes(user.role || '')
  );

  const currentTarget = stack[stack.length - 1] ?? null;

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [sheetSearch, setSheetSearch] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [returnModalState, setReturnModalState] = useState<InspectorRowReturnAction | null>(null);
  const [isEditProductOpen, setIsEditProductOpen] = useState(false);

  const { saveProduct, isSaving } = useProductMutations();

  useEffect(() => {
    setActiveTab('overview');
    setSheetSearch('');
    setIsEditProductOpen(false);
  }, [currentTarget?.type, currentTarget?.id]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [
      'entity-inspector',
      currentTarget?.type,
      currentTarget?.id,
      currentTarget?.subType,
      companyId,
      activeBranchId,
      canViewCost,
    ],
    queryFn: () =>
      fetchInspectedEntity(currentTarget!, {
        companyId,
        branchId: activeBranchId,
        canViewCost,
      }),
    enabled: Boolean(currentTarget?.id),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const groupedFields = useMemo(() => {
    if (!data?.fields) return [];
    const map = new Map<string, InspectorFieldRow[]>();
    for (const f of data.fields) {
      const list = map.get(f.section) ?? [];
      list.push(f);
      map.set(f.section, list);
    }
    return Array.from(map.entries());
  }, [data?.fields]);

  const activeSheet = useMemo(
    () => data?.sheets.find(s => s.id === activeTab) ?? null,
    [data?.sheets, activeTab]
  );

  const filteredSheetRows = useMemo(() => {
    if (!activeSheet) return [];
    const q = sheetSearch.trim().toLowerCase();
    if (!q) return activeSheet.rows;
    return activeSheet.rows.filter(row =>
      Object.values(row.cells).some(v => String(v).toLowerCase().includes(q))
    );
  }, [activeSheet, sheetSearch]);

  if (!currentTarget) return null;

  const Icon = ENTITY_ICON_MAP[currentTarget.type] || FileSpreadsheet;

  const handleCopy = (key: string, value: string) => {
    if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1500);
    });
  };

  const handleExportCsv = () => {
    if (!data) return;
    exportInspectorCsv(data, currentTarget.type, activeSheet, filteredSheetRows);
  };

  const modalTitle = data?.title || currentTarget.label || ENTITY_TYPE_LABEL[currentTarget.type];
  const modalDescription =
    data?.subtitle || `استعلام شامل بنمط جدول إكسل — ${ENTITY_TYPE_LABEL[currentTarget.type]}`;

  return (
    <Modal
      isOpen={Boolean(currentTarget)}
      onClose={close}
      icon={Icon}
      title={modalTitle}
      description={modalDescription}
      size="5xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--app-text-secondary)]">
            <Table2 size={14} className="text-blue-600 dark:text-blue-400" />
            <span>
              {activeSheet
                ? `ورقة: ${activeSheet.label} (${filteredSheetRows.length} سجل)`
                : `ورقة البيانات الشاملة (${data?.fields.length ?? 0} حقل)`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data?.type === 'product' && data.product && canEditProduct && (
              <button
                type="button"
                onClick={() => setIsEditProductOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-600/40 bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700"
                title="تعديل بيانات المنتج"
              >
                <Pencil size={13} />
                <span>تعديل المنتج</span>
              </button>
            )}
            {data?.returnContext && (
              <button
                type="button"
                onClick={() => {
                  const ctx = data.returnContext!;
                  setReturnModalState({
                    returnType: ctx.returnType,
                    invoiceId: ctx.invoiceId || '',
                    ...(ctx.productId ? { productId: ctx.productId } : {}),
                    ...(ctx.partyId ? { partyId: ctx.partyId } : {}),
                    ...(ctx.partyName ? { partyName: ctx.partyName } : {}),
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-rose-700"
                title="إرجاع المنتج أو إنشاء مرتجع مباشر من الفاتورة"
              >
                <RotateCcw size={13} />
                <span>
                  {data.type === 'product'
                    ? 'إرجاع هذا المنتج'
                    : data.type === 'invoice'
                      ? 'إرجاع من هذه الفاتورة'
                      : 'إنشاء مرتجع'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-bold text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-hover)] disabled:opacity-50"
            >
              <RefreshCw size={13} className={cn(isFetching && 'animate-spin')} />
              <span>تحديث</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!data}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/35 bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download size={13} />
              <span>تصدير Excel</span>
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-1.5 text-xs font-bold text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-hover)]"
            >
              إغلاق
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <InspectorBreadcrumb stack={stack} onBack={back} onGoToIndex={goToIndex} />

        {isLoading ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2">
            <PageLoader />
            <span className="text-xs font-bold text-[var(--app-text-secondary)]">
              جاري تحميل كامل البيانات والسجل...
            </span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
            <AlertCircle size={28} className="text-rose-600 dark:text-rose-400" />
            <div className="text-sm font-bold text-rose-700 dark:text-rose-300">
              {error instanceof Error ? error.message : 'تعذر تحميل بيانات العنصر'}
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : data ? (
          <>
            <InspectorHeaderCard
              data={data}
              copiedKey={copiedKey}
              canEditProduct={canEditProduct}
              onCopy={handleCopy}
              onEditProduct={() => setIsEditProductOpen(true)}
              onOpenReturn={setReturnModalState}
            />

            {/* Excel Worksheet Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] pb-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('overview');
                    setSheetSearch('');
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-extrabold transition-all',
                    activeTab === 'overview'
                      ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                      : 'border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
                  )}
                >
                  <FileSpreadsheet size={13} />
                  <span>البطاقة الكاملة</span>
                </button>

                {data.sheets.map(sheet => {
                  const isSelected = activeTab === sheet.id;
                  return (
                    <button
                      key={sheet.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(sheet.id);
                        setSheetSearch('');
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-extrabold transition-all',
                        isSelected
                          ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                          : 'border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
                      )}
                    >
                      <span>{sheet.label}</span>
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.2 font-mono text-[10px] font-black',
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-secondary)]'
                        )}
                      >
                        {sheet.rows.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeSheet && activeSheet.rows.length > 0 && (
                <div className="relative w-full sm:w-56">
                  <Search
                    size={13}
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)]"
                  />
                  <input
                    type="text"
                    value={sheetSearch}
                    onChange={e => setSheetSearch(e.target.value)}
                    placeholder="تصفية سريعة في الجدول..."
                    className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] py-1.5 pl-2.5 pr-8 text-xs font-semibold text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {activeTab === 'overview' ? (
              <InspectorOverviewGrid
                groupedFields={groupedFields}
                copiedKey={copiedKey}
                onCopy={handleCopy}
              />
            ) : activeSheet ? (
              <InspectorSheetTable
                sheet={activeSheet}
                rows={filteredSheetRows}
                sheetSearch={sheetSearch}
                onOpenReturn={setReturnModalState}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {isEditProductOpen && data?.type === 'product' && data.product && (
        <Suspense fallback={null}>
          <AddProductModal
            isOpen={isEditProductOpen}
            onClose={() => setIsEditProductOpen(false)}
            initialData={data.product}
            isSubmitting={isSaving}
            onSubmit={async formData => {
              try {
                await saveProduct({ data: formData, id: data.product!.id });
                setIsEditProductOpen(false);
                await refetch();
              } catch (err) {
                logger.error('UniversalEntityInspectorModal', 'Product update failed:', err);
              }
            }}
          />
        </Suspense>
      )}

      {returnModalState && (
        <AdvancedReturnModal
          isOpen={true}
          onClose={() => setReturnModalState(null)}
          returnType={returnModalState.returnType}
          initialInvoiceId={returnModalState.invoiceId || undefined}
          initialProductId={returnModalState.productId}
          partyId={returnModalState.partyId}
          partyName={returnModalState.partyName}
          onSuccess={() => {
            setReturnModalState(null);
            void refetch();
          }}
        />
      )}
    </Modal>
  );
};
