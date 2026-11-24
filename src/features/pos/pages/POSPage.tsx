import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ShoppingCart } from 'lucide-react';
import ProductGrid from '../components/ProductGrid';
import { POSCart } from '../components/POSCart';
import ScannerOverlay from '../../../ui/base/ScannerOverlay';
import SmartRecommendations from '../../../ui/pos/SmartRecommendations';
import ProductDetailModal from '../../inventory/components/ProductDetailModal';
import { useSalesStore } from '../../sales/store';
import { usePOSStore } from '../store';
import { useAuthStore } from '../../auth/store';
import { usePOSCheckout } from '../hooks';
import { usePOSSearch } from '../hooks/usePOSSearch';
import { posSearchService } from '../services/searchService';
import { useBreakpoint } from '../../../lib/hooks/useBreakpoint';
import { formatCurrency, convertCurrency, getDefaultExchangeOperator } from '../../../core/utils';
import type { Product } from '../../inventory/types';
import { buildProductFromSearchResult } from '../utils/buildProductFromResult';
import { SuspendedOrdersModal } from '../components/SuspendedOrdersModal';
import PaymentModal from '../components/PaymentModal';
import type { POSPaymentResult } from '../components/payment/paymentTypes';
import { POSHeader } from '../components/layout/POSHeader';
import { useWarehousesWithBranches } from '../../inventory/hooks/useWarehouseStock';
import { createIdempotencyKey } from '../../../core/utils/idempotency';
import { QuickDrawerExpenseModal } from '../../reconciliation/components/QuickDrawerExpenseModal';
import { useBranches } from '../../settings/hooks';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';

type POSSearchResultItem = ReturnType<typeof usePOSSearch>['results'][number];
type WarehouseItem = ReturnType<typeof useWarehousesWithBranches>['warehouses'][number];

const hasText = (val: string | null | undefined): val is string =>
  val !== null && val !== undefined && val !== '';

const isWarehousePrimary = (warehouse: WarehouseItem): boolean =>
  Boolean((warehouse as { is_primary?: boolean }).is_primary);

const findBranchTargetWarehouse = (
  warehouses: Array<WarehouseItem>,
  branchId: string | null
): WarehouseItem | undefined => {
  if (hasText(branchId)) {
    return (
      warehouses.find(w => w.branch_id === branchId && isWarehousePrimary(w)) ??
      warehouses.find(w => w.branch_id === branchId)
    );
  }
  return warehouses.find(isWarehousePrimary) ?? warehouses[0];
};

const convertDiscountToPaymentCurrency = (params: {
  discountAmount: number;
  currency: string;
  exchangeRate: number;
  finalCurrency: string;
  finalRate: number;
}): number => {
  if (params.finalCurrency === params.currency) {
    return params.discountAmount;
  }
  const cartRate = params.exchangeRate > 0 ? params.exchangeRate : 1;
  const baseDiscount =
    params.currency === 'SAR'
      ? params.discountAmount
      : convertCurrency(
          params.discountAmount,
          cartRate,
          'toBase',
          getDefaultExchangeOperator(params.currency)
        );
  if (params.finalCurrency === 'SAR') {
    return baseDiscount;
  }
  return convertCurrency(
    baseDiscount,
    params.finalRate,
    'fromBase',
    getDefaultExchangeOperator(params.finalCurrency)
  );
};

const POSPage: React.FC = () => {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showSuspended, setShowSuspended] = useState(false);
  const [isQuickMode, setIsQuickMode] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'products' | 'cart'>('products');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [isQuickExpenseOpen, setIsQuickExpenseOpen] = useState(false);
  // [FIX] كانت نافذة الدفع (PaymentModal) كوداً ميتاً — لا تُعرض في أي مكان،
  // فكان البيع يتم بصمت بنقد/مدفوع دون التقاط المبلغ المستلم أو الباقي
  // أو تأكيد صندوق الخزينة. الآن يفتح زر الدفع النافذة.
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const isDesktop = useBreakpoint('md');

  const { warehouses } = useWarehousesWithBranches();
  const { user } = useAuthStore();
  const { branchId: activeBranchId } = useBranchFilter();
  const { data: branches = [] } = useBranches();
  const currentBranchId = activeBranchId ?? user?.branch_id ?? null;
  const currentBranch = branches.find(b => b.id === currentBranchId);
  const isInventoryOnly =
    (currentBranch as { integration_mode?: string } | undefined)?.integration_mode ===
    'inventory_only';

  const prevBranchIdRef = useRef(currentBranchId);
  useEffect(() => {
    if (warehouses.length === 0) return;
    const branchChanged = prevBranchIdRef.current !== currentBranchId;
    prevBranchIdRef.current = currentBranchId;
    const exists = hasText(selectedWarehouseId) && warehouses.some(w => w.id === selectedWarehouseId);
    if (!hasText(selectedWarehouseId) || !exists || branchChanged) {
      const target = findBranchTargetWarehouse(warehouses, currentBranchId);
      const nextId = target?.id ?? '';
      if (nextId !== selectedWarehouseId) {
        setSelectedWarehouseId(nextId);
      }
    }
  }, [warehouses, currentBranchId, selectedWarehouseId]);

  const search = usePOSSearch({
    debounceMs: 200,
    minChars: 1,
    limit: 25,
    filters: {
      in_stock_only: inStockOnly,
      warehouse_id: selectedWarehouseId,
    },
  });

  const { items, summary, selectedCustomer, currency, exchangeRate, resetCart, addProductToCart } =
    useSalesStore();
  const { suspendedOrders, suspendCurrentOrder, resumeOrder, removeSuspended } = usePOSStore();
  const { processPayment, isProcessing } = usePOSCheckout();

  // مفتاح منع التكرار لكل نية دفع — يُعاد توليده بعد نجاح الدفع فقط.
  const checkoutIdempotencyKeyRef = useRef(createIdempotencyKey('pos'));

  const handleBarcodeScanned = useCallback(
    async (code: string): Promise<void> => {
      setIsScannerOpen(false);
      const { user: currentUser } = useAuthStore.getState();
      if (!hasText(currentUser?.company_id)) return;

      const result = await posSearchService.searchByBarcode(
        currentUser.company_id,
        code,
        currentBranchId,
        selectedWarehouseId
      );
      if (result) {
        const product = buildProductFromSearchResult(result, currentUser.company_id);
        addProductToCart(product);
      } else {
        search.setQuery(code);
      }
    },
    [addProductToCart, search, currentBranchId, selectedWarehouseId]
  );

  const handleSearchSelect = useCallback(
    (result: POSSearchResultItem): void => {
      const { user: currentUser } = useAuthStore.getState();
      if (!hasText(currentUser?.company_id)) return;
      const product = buildProductFromSearchResult(result, currentUser.company_id);
      search.selectResult(result);
      addProductToCart(product);
    },
    [addProductToCart, search]
  );

  const handleViewDetails = useCallback((result: POSSearchResultItem): void => {
    const { user: currentUser } = useAuthStore.getState();
    const product = buildProductFromSearchResult(result, currentUser?.company_id ?? '');
    setDetailProduct(product);
  }, []);

  // Keyboard shortcut: Ctrl+B opens barcode scanner
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setIsScannerOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const validCartItems = useMemo(
    () => (Array.isArray(items) ? items.filter(i => i.productId) : []),
    [items]
  );

  const handleOpenPayment = useCallback(() => {
    if (isProcessing) return;
    if (validCartItems.length === 0) return;
    setIsPaymentOpen(true);
  }, [isProcessing, validCartItems.length]);

  const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId);
  const isCrossBranch =
    hasText(selectedWarehouse?.branch_id) &&
    hasText(currentBranchId) &&
    selectedWarehouse.branch_id !== currentBranchId;

  const handlePayConfirm = useCallback(
    (result: POSPaymentResult) => {
      if (isProcessing) return;

      const finalCurrency = hasText(result.paymentCurrency)
        ? result.paymentCurrency
        : hasText(currency)
          ? currency
          : 'SAR';
      const fallbackRate = exchangeRate > 0 ? exchangeRate : 410;
      const finalRate =
        finalCurrency === 'SAR'
          ? 1
          : (result.exchangeRate ?? 0) > 0
            ? (result.exchangeRate ?? fallbackRate)
            : fallbackRate;

      const needConversion = finalCurrency !== currency;

      const processedItems = validCartItems.map(i => {
        let unitPrice = i.price;
        if (needConversion) {
          unitPrice =
            finalCurrency === 'SAR'
              ? i.basePrice
              : convertCurrency(
                  i.basePrice,
                  finalRate,
                  'fromBase',
                  getDefaultExchangeOperator(finalCurrency)
                );
        }
        return {
          ...i,
          unitPrice,
          costPrice: i.costPrice || 0,
          maxStock: 0,
          ...(hasText(selectedWarehouseId) ? { warehouseId: selectedWarehouseId } : {}),
        };
      });

      const convertedDiscount = convertDiscountToPaymentCurrency({
        discountAmount: summary.discountAmount || 0,
        currency,
        exchangeRate,
        finalCurrency,
        finalRate,
      });

      processPayment(
        {
          partyId: hasText(selectedCustomer?.id) ? selectedCustomer.id : null,
          idempotencyKey: checkoutIdempotencyKeyRef.current,
          type: 'sale',
          isCrossBranch,
          items: processedItems,
          discount: convertedDiscount,
          currency: finalCurrency,
          exchangeRate: finalRate,
          paymentMethod: 'cash',
          // تأكيد صندوق الخزينة أو البنك من النافذة (يُوجَّه عبر resolveStrictPaymentAccount)
          ...(result.treasuryAccountId != null
            ? { treasuryAccountId: result.treasuryAccountId }
            : {}),
          status: 'paid' as const,
        },
        {
          onSuccess: () => {
            setIsPaymentOpen(false);
            resetCart();
            // نية دفع جديدة = مفتاح جديد (الإبقاء عليه عند الفشل يسمح
            // بإعادة المحاولة بأمان دون فاتورة مكررة).
            checkoutIdempotencyKeyRef.current = createIdempotencyKey('pos');
          },
        }
      );
    },
    [
      isProcessing,
      processPayment,
      selectedCustomer,
      validCartItems,
      resetCart,
      summary.discountAmount,
      selectedWarehouseId,
      currency,
      exchangeRate,
      isCrossBranch,
    ]
  );

  const handleSuspend = useCallback(() => {
    if (validCartItems.length === 0) return;
    suspendCurrentOrder(items, selectedCustomer);
    resetCart();
  }, [validCartItems, items, selectedCustomer, suspendCurrentOrder, resetCart]);

  return (
    <div className="font-cairo fixed inset-0 z-50 flex h-[100dvh] w-screen select-none flex-col overflow-hidden bg-gray-50 dark:bg-slate-950">
      <POSHeader
        search={search}
        inStockOnly={inStockOnly}
        setInStockOnly={setInStockOnly}
        isQuickMode={isQuickMode}
        setIsQuickMode={setIsQuickMode}
        suspendedOrdersCount={suspendedOrders.length}
        showSuspended={showSuspended}
        setShowSuspended={setShowSuspended}
        onClearCart={resetCart}
        onLaunchScanner={() => {
          setIsScannerOpen(true);
        }}
        onSearchSelect={handleSearchSelect}
        onViewDetails={handleViewDetails}
        warehouses={warehouses}
        selectedWarehouseId={selectedWarehouseId}
        onWarehouseChange={setSelectedWarehouseId}
        onOpenQuickExpense={() => {
          setIsQuickExpenseOpen(true);
        }}
      />

      <div className="relative flex flex-1 flex-row-reverse overflow-hidden bg-gray-50/50 p-2 dark:bg-slate-950/50 max-md:p-2 md:gap-4 md:p-4 lg:gap-6 lg:p-6">
        <aside
          className={` ${isDesktop ? 'w-[400px] rounded-3xl border shadow-[0_0_40px_-15px_rgba(0,0,0,0.1)] dark:border-slate-800 lg:w-[450px] xl:w-[500px] 2xl:w-[550px] 3xl:w-[600px]' : activeMobileTab === 'cart' ? 'w-full min-w-0' : 'hidden'} relative z-20 flex h-full flex-col overflow-hidden bg-[var(--app-surface)] transition-all duration-300`}
        >
          {!isDesktop && (
            <div className="flex shrink-0 items-center justify-between border-b bg-[var(--app-surface)] p-3 dark:border-slate-800 max-md:p-3">
              <button
                onClick={() => {
                  setActiveMobileTab('products');
                }}
                className="flex items-center gap-2 text-xs font-bold text-blue-600 max-md:gap-2"
              >
                <ChevronLeft size={16} /> العودة للمنتجات
              </button>
              <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
                مراجعة الطلب
              </span>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            <POSCart
              onPay={handleOpenPayment}
              onSuspend={handleSuspend}
              isProcessing={isProcessing}
              isCrossBranch={isCrossBranch}
            />
          </div>

          {!isQuickMode && (
            <div className="hidden shrink-0 border-t bg-gray-50 p-2 dark:border-slate-800 dark:bg-slate-950 max-md:p-2 md:block">
              <SmartRecommendations
                cartItems={validCartItems}
                onAdd={name => {
                  search.setQuery(name);
                }}
              />
            </div>
          )}
        </aside>

        <main
          className={` ${isDesktop ? 'flex-1 rounded-2xl border dark:border-slate-800' : activeMobileTab === 'products' ? 'flex-1' : 'hidden'} relative overflow-hidden bg-[var(--app-surface)] shadow-sm`}
        >
          <ProductGrid
            searchTerm={search.debouncedQuery}
            onAddToCart={p => {
              addProductToCart(p);
            }}
            inStockOnly={inStockOnly}
            onViewDetails={p => {
              setDetailProduct(p);
            }}
            selectedWarehouseId={selectedWarehouseId}
            isCrossBranch={isCrossBranch}
            isInventoryOnly={isInventoryOnly}
            requesterBranchId={currentBranchId ?? null}
          />
        </main>
      </div>

      {!isDesktop && activeMobileTab === 'products' && items.length > 0 && (
        <div className="animate-in slide-in-from-bottom-10 pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
          <div
            onClick={() => {
              setActiveMobileTab('cart');
            }}
            className="pointer-events-auto mx-auto flex w-full max-w-md cursor-pointer items-center justify-between rounded-2xl bg-blue-600 px-4 py-2.5 text-white shadow-xl shadow-blue-500/35 transition-all active:scale-[0.98]"
          >
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                إجمالي السلة ({items.length})
              </span>
              <span dir="ltr" className="font-mono text-base font-black leading-tight">
                {formatCurrency(summary.totalAmount, currency)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-white/20 p-1.5">
                <ShoppingCart size={17} />
              </div>
              <span className="text-xs font-bold">عرض السلة</span>
            </div>
          </div>
        </div>
      )}

      {isScannerOpen && (
        <ScannerOverlay
          onScan={code => {
            void handleBarcodeScanned(code);
          }}
          onClose={() => {
            setIsScannerOpen(false);
          }}
        />
      )}

      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onClose={() => {
            setDetailProduct(null);
          }}
        />
      )}

      {showSuspended && (
        <SuspendedOrdersModal
          orders={suspendedOrders}
          onClose={() => {
            setShowSuspended(false);
          }}
          onResume={id => {
            const res = resumeOrder(id);
            if (res) {
              const resumed = res as typeof res & { currency?: string; exchangeRate?: number };
              useSalesStore.setState({
                items: res.items,
                selectedCustomer: res.customer,
                ...(resumed.currency !== undefined && resumed.currency !== ''
                  ? { currency: resumed.currency }
                  : {}),
                ...(resumed.exchangeRate !== undefined && resumed.exchangeRate > 0
                  ? { exchangeRate: resumed.exchangeRate }
                  : {}),
              });
              useSalesStore.getState().calculateTotals();
            }
          }}
          onRemove={removeSuspended}
        />
      )}

      {/* [FIX] نافذة الدفع: التقاط المبلغ المستلم/الباقي + تأكيد صندوق الخزينة.
          النقد فقط حالياً — مسار «شركة صرافة» غير مفعّل في خط أنابيب البيع
          (paymentMethod يقبل 'cash' | 'credit' فقط) فيُخفى اختياره. */}
      {isPaymentOpen && (
        <PaymentModal
          isOpen
          onClose={() => {
            setIsPaymentOpen(false);
          }}
          total={summary.totalAmount}
          currency={currency}
          isProcessing={isProcessing}
          onConfirm={handlePayConfirm}
          allowedMethods={['cash']}
        />
      )}

      <QuickDrawerExpenseModal
        isOpen={isQuickExpenseOpen}
        onClose={() => {
          setIsQuickExpenseOpen(false);
        }}
      />
    </div>
  );
};

export default POSPage;
