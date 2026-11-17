import React, { Suspense, lazy } from 'react';
import ProductExcelGrid from './ProductExcelGrid';
import ProductMicroCard from './ProductMicroCard';
import ProductDetailPane from './ProductDetailPane';
import type { Product } from '../types';

const TransfersView = lazy(() => import('./TransfersView'));
const StockAuditView = lazy(() => import('./StockAuditView'));
const WarehousesView = lazy(() => import('./WarehousesView'));
const AuditLogView = lazy(() => import('./AuditLogView'));
const CategoriesManagementView = lazy(() => import('./CategoriesManagementView'));
const CoreProductsView = lazy(() => import('./CoreProductsView'));
const InventoryBiView = lazy(() =>
  import('../../reports/components/bi/InventoryBiView').then(m => ({
    default: m.InventoryBiView,
  }))
);
const ProductBiView = lazy(() =>
  import('../../reports/components/bi/ProductBiView').then(m => ({
    default: m.ProductBiView,
  }))
);

interface InventoryViewRendererProps {
  activeView: string;
  products: Product[];
  isLoading: boolean;
  isDesktop: boolean;
  displayMode: 'table' | 'grid';
  selectedProduct: Product | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  setActiveView: (view: string) => void;
  setSelectedProduct: (product: Product | null) => void;
  handleEdit: (product: Product) => void;
  deleteProduct: (id: string) => void;
  onMaximizeProduct?: () => void;
}

const InventoryViewRenderer: React.FC<InventoryViewRendererProps> = ({
  activeView,
  products,
  isLoading,
  isDesktop,
  displayMode,
  selectedProduct,
  searchTerm,
  setSearchTerm,
  setActiveView,
  setSelectedProduct,
  handleEdit,
  deleteProduct,
  onMaximizeProduct,
}) => {
  switch (activeView) {
    case 'transfers':
      return (
        <Suspense fallback={null}>
          <TransfersView />
        </Suspense>
      );
    case 'audit':
      return (
        <Suspense fallback={null}>
          <StockAuditView />
        </Suspense>
      );
    case 'warehouses':
      return (
        <Suspense fallback={null}>
          <WarehousesView />
        </Suspense>
      );

    case 'history':
      return (
        <Suspense fallback={null}>
          <AuditLogView />
        </Suspense>
      );
    case 'categories':
      return (
        <Suspense fallback={null}>
          <CategoriesManagementView
            onFilterProduct={catName => {
              setActiveView('products');
              setSearchTerm(catName);
            }}
          />
        </Suspense>
      );

    case 'core_products':
      return (
        <Suspense fallback={null}>
          <CoreProductsView
            isDesktop={isDesktop}
            selectedProduct={selectedProduct}
            setSelectedProduct={setSelectedProduct}
            handleEdit={handleEdit}
            deleteProduct={deleteProduct}
            onMaximizeProduct={onMaximizeProduct}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
          />
        </Suspense>
      );

    case 'bi_inventory':
      return (
        <Suspense fallback={null}>
          <div className="custom-scrollbar h-full overflow-y-auto p-3 pb-16">
            <InventoryBiView />
          </div>
        </Suspense>
      );
    case 'bi_products':
      return (
        <Suspense fallback={null}>
          <div className="custom-scrollbar h-full overflow-y-auto p-3 pb-16">
            <ProductBiView />
          </div>
        </Suspense>
      );

    default: // Products View
      if (isDesktop) {
        return (
          <div className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
            <div
              className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden transition-all duration-300 ${selectedProduct ? 'lg:col-span-8' : 'lg:col-span-12'}`}
            >
              <ProductExcelGrid
                products={products}
                isLoading={isLoading}
                onDelete={deleteProduct}
                onViewDetails={setSelectedProduct}
                onEdit={handleEdit}
                searchValue={searchTerm}
                onSearchChange={setSearchTerm}
              />
            </div>
            {selectedProduct && (
              <div className="animate-in slide-in-from-right-4 fade-in h-full min-h-0 overflow-hidden duration-300 lg:col-span-4">
                <ProductDetailPane
                  product={selectedProduct}
                  onEdit={handleEdit}
                  onDelete={deleteProduct}
                  onClose={() => {
                    setSelectedProduct(null);
                  }}
                  onMaximize={onMaximizeProduct}
                />
              </div>
            )}
          </div>
        );
      }
      // Mobile View
      return displayMode === 'table' ? (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <ProductExcelGrid
            products={products}
            isLoading={isLoading}
            onDelete={deleteProduct}
            onViewDetails={setSelectedProduct}
            onEdit={handleEdit}
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
          />
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-400">
          <p className="text-xs font-bold">لا توجد منتجات تطابق البحث</p>
        </div>
      ) : (
        <div className="custom-scrollbar grid min-h-0 flex-1 auto-rows-max grid-cols-1 content-start gap-2 overflow-y-auto p-2 pb-14 sm:grid-cols-2 sm:gap-3 sm:p-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map(p => (
            <ProductMicroCard key={p.id} product={p} onClick={setSelectedProduct} />
          ))}
        </div>
      );
  }
};

export default InventoryViewRenderer;
