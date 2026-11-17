import React from 'react';
import ServerPaginationBar from '../../../ui/common/ServerPaginationBar';
import type { Product } from '../types';
import { CoreEmptyState } from './core_products/CoreEmptyState';
import { CoreProductsFilterBar } from './core_products/CoreProductsFilterBar';
import { useCoreProductsController } from './core_products/useCoreProductsController';
import { useCoreStrategicColumns } from './core_products/useCoreStrategicColumns';
import ProductDetailPane from './ProductDetailPane';
import ProductExcelGrid from './ProductExcelGrid';

interface CoreProductsViewProps {
  isDesktop: boolean;
  selectedProduct: Product | null;
  setSelectedProduct: (product: Product | null) => void;
  handleEdit: (product: Product) => void;
  deleteProduct: (id: string) => void;
  onMaximizeProduct?: (() => void) | undefined;
  searchTerm?: string | undefined;
  onSearchChange?: ((term: string) => void) | undefined;
}

export const CoreProductsView: React.FC<CoreProductsViewProps> = ({
  isDesktop,
  selectedProduct,
  setSelectedProduct,
  handleEdit,
  deleteProduct,
  onMaximizeProduct,
  searchTerm: propSearchTerm,
  onSearchChange: propOnSearchChange,
}) => {
  const {
    filterMode,
    setFilterMode,
    selectedBrand,
    setSelectedBrand,
    selectedSupplierId,
    setSelectedSupplierId,
    selectedWarehouseId,
    setSelectedWarehouseId,
    activeSearch,
    pageSize,
    setPageSize,
    page,
    isFetching,
    isLoading,
    goToPage,
    warehouses,
    suppliers,
    availableBrands,
    productSupplierMap,
    isStatsFetching,
    onSearch,
    displayedProducts,
    stats,
    handleToggleCore,
    handleRefresh,
    effectiveTotalCount,
    effectiveTotalPages,
  } = useCoreProductsController({
    propSearchTerm,
    propOnSearchChange,
  });

  const strategicColumns = useCoreStrategicColumns(productSupplierMap);

  const gridSubtitle =
    filterMode === 'all_inventory'
      ? 'انقر على النجمة ⭐ لتعيين الصنف كصنف استراتيجي يتابعه النظام بدقة'
      : `${String(displayedProducts.length)} صنف معروض من إجمالي ${String(effectiveTotalCount)}`;

  const productGrid = (
    <ProductExcelGrid
      products={displayedProducts}
      isLoading={isLoading}
      onDelete={deleteProduct}
      onViewDetails={setSelectedProduct}
      onEdit={handleEdit}
      searchValue={activeSearch}
      onSearchChange={onSearch}
      onToggleCore={handleToggleCore}
      extraColumns={strategicColumns}
      title={
        filterMode === 'all_inventory'
          ? 'اختر الأصناف لتحديدها كمنتجات استراتيجية'
          : 'المنتجات الاستراتيجية'
      }
      subtitle={gridSubtitle}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden p-2">
      <CoreProductsFilterBar
        filterMode={filterMode}
        onFilterModeChange={mode => {
          setFilterMode(mode);
          goToPage(1);
        }}
        stats={stats}
        brands={availableBrands}
        selectedBrand={selectedBrand}
        onBrandChange={b => {
          setSelectedBrand(b);
          goToPage(1);
        }}
        suppliers={suppliers}
        selectedSupplierId={selectedSupplierId}
        onSupplierChange={sId => {
          setSelectedSupplierId(sId);
          goToPage(1);
        }}
        warehouses={warehouses}
        selectedWarehouseId={selectedWarehouseId}
        onWarehouseChange={wId => {
          setSelectedWarehouseId(wId);
          goToPage(1);
        }}
        displayedCount={displayedProducts.length}
        totalAvailableCount={effectiveTotalCount}
        onRefresh={() => {
          void handleRefresh();
        }}
        isRefreshing={isFetching || isStatsFetching}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!isLoading && displayedProducts.length === 0 ? (
          <CoreEmptyState
            activeSearch={activeSearch}
            filterMode={filterMode}
            hasCustomFilters={selectedBrand.trim() !== '' || selectedSupplierId.trim() !== ''}
            onClearSearch={() => onSearch('')}
            onClearCustomFilters={() => {
              setSelectedBrand('');
              setSelectedSupplierId('');
              goToPage(1);
            }}
            onShowAllCore={() => {
              setFilterMode('core_only');
              goToPage(1);
            }}
            onBrowseAllInventory={() => {
              setFilterMode('all_inventory');
              goToPage(1);
            }}
          />
        ) : isDesktop ? (
          <div className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
            <div
              className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden transition-all duration-300 ${
                selectedProduct !== null ? 'lg:col-span-8' : 'lg:col-span-12'
              }`}
            >
              {productGrid}
            </div>
            {selectedProduct !== null && (
              <div className="animate-in slide-in-from-right-4 fade-in h-full min-h-0 overflow-hidden duration-300 lg:col-span-4">
                <ProductDetailPane
                  product={selectedProduct}
                  onEdit={handleEdit}
                  onDelete={deleteProduct}
                  onClose={() => setSelectedProduct(null)}
                  onMaximize={onMaximizeProduct}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            {productGrid}
          </div>
        )}

        {displayedProducts.length > 0 && (
          <ServerPaginationBar
            page={page}
            totalPages={effectiveTotalPages}
            totalCount={effectiveTotalCount}
            pageSize={pageSize}
            isFetching={isFetching}
            onPageChange={goToPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[25, 50, 100, 200]}
          />
        )}
      </div>
    </div>
  );
};

export default CoreProductsView;
