import React, { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { Box } from 'lucide-react';
import { useProductMutations } from '../../../inventory/hooks/index';
import type { Product, ProductFormData } from '../../../inventory/types';
import type { StockTransferRequest } from '../../../inventory/hooks/useStockTransferRequests';
import { summarizeProductBranchAvailability } from '../../../inventory/utils/branchStockSummary';
import Modal from '../../../../ui/base/Modal';
import { PaginationBar } from '../../../../ui/common/PaginationBar';
import { useProductTableConfig } from '../../hooks/useProductTableConfig';
import { useProductSelectionTable } from '../../hooks/useProductSelectionTable';
import { useRelatedProducts } from '../../hooks/useRelatedProducts';
import { productService } from '../../../inventory/service';

const ProductDetailModal = lazy(() => import('../../../inventory/components/ProductDetailModal'));
const AddProductModal = lazy(() => import('../../../inventory/components/AddProductModal'));
const CreateBranchTransferRequestModal = lazy(
  () => import('../../../inventory/components/transfers/CreateBranchTransferRequestModal')
);
const IncomingTransferApprovalModal = lazy(
  () => import('../../../inventory/components/transfers/IncomingTransferApprovalModal')
);
import { useBranchFilter } from '../../../branches/hooks/useBranchFilter';
import { useBranches } from '../../../settings/hooks';
import { useAuthStore } from '../../../auth/store';
import { logger } from '../../../../core/utils/logger';
import { useColumnResize } from './useColumnResize';
import { ProductColumnSettingsMenu } from './ProductColumnSettingsMenu';
import { ProductSelectionTableRow } from './ProductSelectionTableRow';
import { ProductSelectionToolbar } from './ProductSelectionToolbar';
import { BranchTransferHeaderBar } from './BranchTransferHeaderBar';
import { RelatedProductsPanel } from './RelatedProductsPanel';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
  initialQuery?: string;
  mode?: 'sale' | 'purchase' | 'quotation';
  warehouseId?: string | null;
}

const FONT_SIZE_CLASSES = { small: 'text-[10px]', medium: 'text-[11px]', large: 'text-[13px]' };
const HEADER_FONT_SIZE_CLASSES = {
  small: 'text-[10px]',
  medium: 'text-[10px]',
  large: 'text-[12px]',
};

const ProductSelectionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSelect,
  initialQuery = '',
  mode = 'sale',
  warehouseId,
}) => {
  const [localBranchId, setLocalBranchId] = useState<string | null>(null);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const branchMenuRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const { user } = useAuthStore();
  const isManager = user?.role === 'owner' || user?.role === 'admin';
  const { branchId: activeBranchId } = useBranchFilter();
  const { data: branches } = useBranches();
  const activeBranches = Array.isArray(branches) ? branches.filter(b => b.status === 'active') : [];

  const effectiveBranchId = localBranchId ?? activeBranchId;

  const {
    localQuery,
    setLocalQuery,
    submittedQuery,
    setSubmittedQuery,
    showInStockOnly,
    setShowInStockOnly,
    products,
    isLoading,
    sortConfig,
    handleSort,
    pageSize,
    setPageSize,
    totalPages,
    safePage,
    setPage,
    paginatedProducts,
    handlePageChange,
    focusedIndex,
    setFocusedIndex,
    tableBodyRef,
    handleKeyDown,
    handleTableKeyDown,
    handleRowClick,
  } = useProductSelectionTable({
    isOpen,
    initialQuery,
    effectiveBranchId,
    warehouseId,
    mode,
    onSelect,
  });

  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [transferRequestState, setTransferRequestState] = useState<{
    isOpen: boolean;
    product: Product | null;
    sourceBranchId: string | null;
  }>({ isOpen: false, product: null, sourceBranchId: null });
  const [incomingReviewRequests, setIncomingReviewRequests] = useState<
    StockTransferRequest[] | null
  >(null);

  const focusedProduct =
    focusedIndex >= 0
      ? (paginatedProducts[focusedIndex] ?? null)
      : (paginatedProducts[0] ?? null);

  const excludeProductIds = useMemo(
    () => paginatedProducts.slice(0, 20).map(p => p.id),
    [paginatedProducts]
  );

  const {
    relation: companionRelation,
    relatedProducts,
    isLoading: isRelatedLoading,
  } = useRelatedProducts({
    searchQuery: submittedQuery,
    focusedProduct,
    excludeProductIds,
    effectiveBranchId,
    warehouseId,
    enabled: isOpen,
  });

  const handleRequestFromBranch = (product: Product) => {
    const availability = summarizeProductBranchAvailability(product, effectiveBranchId);
    const bestOtherBranch = availability.stockedBranches.find(
      b => b.branchId && b.branchId !== effectiveBranchId
    );
    setTransferRequestState({
      isOpen: true,
      product,
      sourceBranchId: bestOtherBranch?.branchId ?? null,
    });
  };

  const { saveProduct, isSaving } = useProductMutations();

  const handleAddProduct = async (data: ProductFormData) => {
    try {
      const created = await saveProduct({ data });
      setShowAddProduct(false);

      const mapped = productService.mapRawProducts([created], undefined, effectiveBranchId)[0];
      if (mapped) {
        onSelect(mapped);
        onClose();
      }
    } catch (err) {
      logger.error('ProductSelectionModal', '[ProductSelectionModal] فشل إضافة المنتج:', err);
    }
  };

  const {
    config,
    setColumnWidth,
    toggleColumnVisibility,
    reorderColumn,
    setFontSize,
    resetConfig,
  } = useProductTableConfig();

  const { onMouseDown } = useColumnResize({ setColumnWidth });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (branchMenuRef.current && !branchMenuRef.current.contains(e.target as Node)) {
        setShowBranchMenu(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, []);

  const visibleColumns = config.columns.filter(c => c.visible);

  const selectedBranchName =
    localBranchId !== null
      ? (activeBranches.find(b => b.id === localBranchId)?.name ?? 'فرع محدد')
      : activeBranchId !== null
        ? activeBranches.find(b => b.id === activeBranchId)?.name
        : 'جميع الفروع';

  return (
    <>
      {viewProduct && (
        <Suspense fallback={null}>
          <ProductDetailModal
            product={viewProduct}
            onClose={() => {
              setViewProduct(null);
            }}
          />
        </Suspense>
      )}

      <Modal
        isOpen={isOpen}
        onClose={onClose}
        icon={Box}
        size="full"
        title="مستكشف الأصناف المتقدم"
        description="انقر مرتين على المنتج لإضافته للفاتورة"
        footer={
          <div className="flex w-full items-center justify-between gap-2 max-md:gap-2">
            <span className="font-mono text-[10px] text-gray-400">{products.length} منتج</span>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded bg-gray-100 py-2 text-[10px] font-bold uppercase transition-colors hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              إغلاق
            </button>
          </div>
        }
      >
        <div className="flex h-[76vh] flex-col bg-[var(--app-surface)]">
          {/* Live Branch Transfer Requests Header */}
          <BranchTransferHeaderBar
            activeBranchId={effectiveBranchId}
            onOpenNewRequest={() =>
              setTransferRequestState({ isOpen: true, product: null, sourceBranchId: null })
            }
            onReviewIncoming={reqs => setIncomingReviewRequests(reqs)}
          />

          {/* Toolbar */}
          <ProductSelectionToolbar
            onOpenAddProduct={() => {
              setShowAddProduct(true);
            }}
            localQuery={localQuery}
            onQueryChange={setLocalQuery}
            onSearchKeyDown={handleKeyDown}
            showInStockOnly={showInStockOnly}
            onToggleInStockOnly={() => {
              setShowInStockOnly(prev => !prev);
            }}
            isManager={isManager}
            branchMenuRef={branchMenuRef}
            showBranchMenu={showBranchMenu}
            onToggleBranchMenu={() => {
              setShowBranchMenu(prev => !prev);
            }}
            localBranchId={localBranchId}
            onSelectBranch={branchId => {
              setLocalBranchId(branchId);
              setShowBranchMenu(false);
            }}
            selectedBranchName={selectedBranchName}
            activeBranches={activeBranches}
            columnSettingsSlot={
              <ProductColumnSettingsMenu
                showSettings={showSettings}
                setShowSettings={setShowSettings}
                settingsRef={settingsRef}
                config={config}
                setFontSize={setFontSize}
                toggleColumnVisibility={toggleColumnVisibility}
                reorderColumn={reorderColumn}
                resetConfig={resetConfig}
              />
            }
          />

          {/* Table */}
          <div
            className="custom-scrollbar flex-1 overflow-auto outline-none"
            onKeyDown={handleTableKeyDown}
            tabIndex={0}
            role="grid"
            aria-label="قائمة المنتجات"
          >
            <table className="w-full min-w-max table-fixed border-collapse border-spacing-0">
              <thead className="sticky top-0 z-20 border-b-2 border-gray-300 bg-gray-100 shadow-sm dark:border-slate-600 dark:bg-slate-800">
                <tr
                  className={`${
                    HEADER_FONT_SIZE_CLASSES[config.fontSize]
                  } text-right font-extrabold uppercase tracking-tighter text-gray-600 dark:text-slate-300`}
                >
                  {visibleColumns.map(col => {
                    const isSortable = !['index', 'actions', 'branch', 'specs'].includes(col.id);
                    const isSorted = sortConfig?.key === col.id;
                    return (
                      <th
                        key={col.id}
                        style={{ width: col.width }}
                        onClick={() => {
                          handleSort(col.id);
                        }}
                        className={`relative select-none border-l border-gray-300 bg-gray-100 p-2 last:border-l-0 dark:border-slate-600 dark:bg-slate-800/80 max-md:p-2 ${
                          col.id === 'index' || col.id === 'stock' || col.id === 'actions'
                            ? 'text-center'
                            : 'pr-4'
                        } ${isSortable ? 'cursor-pointer hover:bg-gray-200 dark:hover:bg-slate-700' : ''}`}
                      >
                        <span className="inline-flex items-center gap-1 max-md:gap-1">
                          {col.label}
                          {isSorted && (
                            <span className="text-blue-500">
                              {sortConfig.direction === 'asc' ? '▲' : '▼'}
                            </span>
                          )}
                        </span>
                        {col.id !== 'index' && (
                          <div
                            onMouseDown={e => {
                              onMouseDown(e, col.id, col.width);
                            }}
                            className="absolute left-0 top-0 z-30 -ml-1 h-full w-2 cursor-col-resize transition-colors hover:bg-blue-500/40"
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody ref={tableBodyRef} className="divide-y divide-gray-200 dark:divide-slate-700">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length}
                      className="animate-pulse p-10 text-center text-[10px] font-bold text-gray-400 max-md:p-5"
                    >
                      جاري تحميل المنتجات...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length}
                      className="p-10 text-center text-sm text-gray-300 max-md:p-5"
                    >
                      لا توجد نتائج مطابقة
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((p, idx) => (
                    <ProductSelectionTableRow
                      key={p.id}
                      product={p}
                      index={idx}
                      visibleColumns={visibleColumns}
                      effectiveBranchId={effectiveBranchId}
                      mode={mode}
                      fontSizeClass={FONT_SIZE_CLASSES[config.fontSize]}
                      isFocused={focusedIndex === idx}
                      onSelect={onSelect}
                      onViewProduct={setViewProduct}
                      onRequestFromBranch={handleRequestFromBranch}
                      onRowClick={handleRowClick}
                      onMouseEnter={() => {
                        setFocusedIndex(idx);
                      }}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Smart Companion / Related Products Panel */}
          <RelatedProductsPanel
            relation={companionRelation}
            relatedProducts={relatedProducts}
            isLoading={isRelatedLoading}
            mode={mode}
            onSelectProduct={onSelect}
            onRequestFromBranch={handleRequestFromBranch}
            onSearchChipClick={term => {
              setLocalQuery(term);
              setSubmittedQuery(term);
            }}
          />

          {/* Status bar with pagination */}
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalResults={products.length}
            onPageChange={handlePageChange}
            onPageSizeChange={s => {
              setPageSize(s);
              setPage(1);
            }}
            extraInfo={
              <>
                {showInStockOnly && <span className="text-emerald-500">• عرض المتوفر فقط</span>}
                {effectiveBranchId !== null && (
                  <span className="text-indigo-500">• {selectedBranchName}</span>
                )}
              </>
            }
          />
        </div>
      </Modal>

      {/* Add New Product Modal */}
      {showAddProduct && (
        <Suspense fallback={null}>
          <AddProductModal
            isOpen={showAddProduct}
            onClose={() => {
              setShowAddProduct(false);
            }}
            onSubmit={handleAddProduct}
            isSubmitting={isSaving}
          />
        </Suspense>
      )}

      {/* Branch Transfer Request Modal (reuses existing system — zero duplication) */}
      {transferRequestState.isOpen && (
        <Suspense fallback={null}>
          <CreateBranchTransferRequestModal
            isOpen={transferRequestState.isOpen}
            onClose={() =>
              setTransferRequestState({ isOpen: false, product: null, sourceBranchId: null })
            }
            initialProduct={transferRequestState.product}
            initialSourceBranchId={transferRequestState.sourceBranchId}
          />
        </Suspense>
      )}

      {/* Incoming Branch Transfer Approval Modal */}
      {incomingReviewRequests && incomingReviewRequests.length > 0 && (
        <Suspense fallback={null}>
          <IncomingTransferApprovalModal
            isOpen={true}
            requests={incomingReviewRequests}
            onClose={() => setIncomingReviewRequests(null)}
          />
        </Suspense>
      )}
    </>
  );
};

export default ProductSelectionModal;
