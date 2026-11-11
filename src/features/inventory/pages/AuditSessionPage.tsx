/**
 * صفحة جلسة الجرد.
 *
 * سبب التقسيم: كانت هذه الصفحة 634 سطراً و133 تحذيراً/خطأ ESLint، تخلط جلب
 * البيانات، وإدارة النموذج، وتعديل الأصناف، وإنشاء المنتجات، وعرض الواجهة.
 * الآن تنسّق فقط بين أربع وحدات مستقلة (كل منها قابل للاختبار وحده):
 *  • `useAuditSessionForm`   — مزامنة النموذج ↔ المسودة ↔ الخادم (+ إصلاح B4).
 *  • `useAuditItemActions`   — إضافة/زيادة/حذف الأصناف وتراجعاتها.
 *  • `useAuditProductCreation` — إنشاء منتج جديد وإضافته للجلسة.
 *  • `AuditSessionWorkspace` — العرض (إحصاءات + مرشّحات + جدول).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import {
  useAuditSession,
  useInventoryCategories,
  useInventoryMutations,
} from '../hooks/useInventoryManagement';
import { useProductMutations, useSearchProducts } from '../hooks/useProducts';
import { useInventorySession } from '../hooks/useInventorySession';
import { useAuditSessionForm } from '../hooks/useAuditSessionForm';
import { useAuditItemActions } from '../hooks/useAuditItemActions';
import { useAuditProductCreation } from '../hooks/useAuditProductCreation';
import { useAuditProgressPersistence } from '../hooks/useAuditProgressPersistence';
import { useAuthStore } from '../../auth/store';
import { calculateAuditStats } from '../utils/auditStats';
import { AuditSessionLayout } from '../components/audit/AuditSessionLayout';
import type { AuditStatusFilter } from '../components/audit/AuditItemsTable';
import type { SearchResultProduct } from '../services/productService';
import type { Product, ProductFormData } from '../types';

const isManagementRole = (role: string | undefined): boolean =>
  role === 'owner' || role === 'admin' || role === 'manager';

const AuditSessionPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data, isLoading, isError } = useAuditSession(sessionId);
  const { data: categories } = useInventoryCategories();
  const { saveProduct, isSaving: isSavingProduct } = useProductMutations();
  const {
    saveAuditProgress,
    saveAuditProgressAsync,
    finalizeAudit,
    addItemToAudit,
    removeItemFromAudit,
    isSavingProgress,
    isFinalizing,
    isAddingItem,
    isRemovingItem,
    populateWarehouseItems,
    isPopulatingWarehouse,
  } = useInventoryMutations();

  const [statusFilter, setStatusFilter] = useState<AuditStatusFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);

  const session = data?.session;
  const serverItems = useMemo(() => data?.items ?? [], [data?.items]);
  const isCompleted = session?.status === 'completed';
  const canManageAudit = isManagementRole(user?.role);
  const warehouseId = (session as { warehouse_id?: string } | undefined)?.warehouse_id;

  const {
    items: sessionItems,
    isRestoring,
    saveStatus,
    updateItems,
    mergeWithServer,
    clearSession,
  } = useInventorySession({
    sessionId: sessionId ?? '',
    ...(warehouseId === undefined ? {} : { warehouseId }),
    initialItems: serverItems,
    isCompleted,
  });

  const {
    register,
    getValues,
    displayItems,
    statsItems,
    syncItemsMutation,
    lastSyncedRef,
  } = useAuditSessionForm({
    serverItems,
    sessionItems,
    isCompleted,
    isRestoring,
    updateItems,
    mergeWithServer,
  });

  const { prepareProgressItems, handleSaveProgress } = useAuditProgressPersistence({
    sessionId,
    isCompleted,
    getValues,
    displayItems,
    serverItems,
    updateItems,
    lastSyncedRef,
  });

  const actions = useAuditItemActions({
    sessionId,
    isCompleted,
    warehouseId,
    getValues,
    syncItems: syncItemsMutation,
    addItemToAudit,
    removeItemFromAudit,
  });

  const [debouncedFilter] = useDebounce(actions.filter, 300);
  const { data: searchResults, isLoading: isLoadingSearch } = useSearchProducts(debouncedFilter);
  const stats = useMemo(() => calculateAuditStats(statsItems), [statsItems]);

  const closeAddProduct = useCallback((): void => {
    setShowAddProduct(false);
  }, []);

  const createProduct = useAuditProductCreation({
    companyId: user?.company_id ?? '',
    saveProduct,
    onCreated: actions.handleAddItem,
    onClose: closeAddProduct,
  });

  const handleSave = useCallback((): void => {
    const itemsToSave = prepareProgressItems();
    if (sessionId === undefined) {
      saveAuditProgress(itemsToSave);
      return;
    }
    saveAuditProgress({ sessionId, items: itemsToSave });
  }, [prepareProgressItems, sessionId, saveAuditProgress]);

  const executeFinalize = useCallback((): void => {
    if (sessionId === undefined) return;
    finalizeAudit(
      { sessionId, items: prepareProgressItems() },
      {
        onSuccess: () => {
          clearSession();
          setShowFinalizeConfirm(false);
          void navigate('/inventory');
        },
      }
    );
  }, [sessionId, prepareProgressItems, finalizeAudit, clearSession, navigate]);

  const handleFinalize = useCallback((): void => {
    if (stats.pending > 0) {
      setShowFinalizeConfirm(true);
      return;
    }
    executeFinalize();
  }, [stats.pending, executeFinalize]);

  const { setFilter, setShowResults } = actions;
  const handleScan = useCallback(
    (barcode: string): void => {
      setFilter(barcode);
      setShowResults(true);
      setIsScannerOpen(false);
    },
    [setFilter, setShowResults]
  );

  const handleBulkAddWarehouseProducts = useCallback(async (): Promise<void> => {
    if (sessionId === undefined) return;
    const currentItems = getValues('items');
    if (currentItems.length > 0) {
      const itemsToSave = prepareProgressItems();
      if (itemsToSave.length > 0) {
        try {
          // [FIX] كان النداء المباشر بلا try/catch: عند الفشل يستمر التنفيذ إلى
          // تعبئة المستودع فتضيع الكميات المكتوبة بصمت. الآن نتوقف ورسالة الخطأ
          // تصل من الـmutation (parseError + وضع عدم الاتصال).
          await saveAuditProgressAsync({ sessionId, items: itemsToSave });
        } catch {
          return;
        }
      }
    }
    populateWarehouseItems(sessionId, {
      onSuccess: () => {
        setShowBulkConfirm(false);
      },
      onError: () => {
        setShowBulkConfirm(false);
      },
    });
  }, [sessionId, getValues, prepareProgressItems, saveAuditProgressAsync, populateWarehouseItems]);

  const newProductInitialData = useMemo(() => {
    const trimmed = actions.filter.trim();
    if (trimmed === '') return null;
    const isBarcode = /^\d{6,}$/.test(trimmed);
    return {
      name: isBarcode ? '' : trimmed,
      name_ar: isBarcode ? '' : trimmed,
      barcode: isBarcode ? trimmed : '',
      sku: isBarcode ? '' : trimmed,
    } as unknown as Product;
  }, [actions.filter]);

  const handleCreateProduct = useCallback(
    (formData: ProductFormData): void => {
      void createProduct(formData);
    },
    [createProduct]
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center p-20 text-center">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (isError) {
    return <div className="p-8 text-center text-rose-500">حدث خطأ أثناء تحميل بيانات الجرد.</div>;
  }

  return (
    <AuditSessionLayout
      header={{
        title: typeof session?.title === 'string' ? session.title : 'جلسة جرد',
        isCompleted,
        isRestoring,
        saveStatus,
        canManageAudit,
        isSavingProgress,
        isFinalizing,
        isPopulatingWarehouse,
        onOpenAddProduct: () => {
          setShowAddProduct(true);
        },
        onOpenBulkConfirm: () => {
          setShowBulkConfirm(true);
        },
        onSave: handleSave,
        onFinalize: handleFinalize,
      }}
      search={
        isCompleted
          ? null
          : {
              filter: actions.filter,
              setFilter: actions.setFilter,
              showResults: actions.showResults,
              setShowResults: actions.setShowResults,
              isLoadingSearch,
              isAddingItem,
              searchResults: searchResults as unknown as SearchResultProduct[] | undefined,
              onAddItem: actions.handleAddItem,
              onOpenScanner: () => {
                setIsScannerOpen(true);
              },
              onOpenAddProduct: () => {
                setShowAddProduct(true);
              },
            }
      }
      workspace={{
        stats,
        session: session ?? {},
        categories,
        selectedCategory,
        onSelectCategory: setSelectedCategory,
        statusFilter,
        onSelectStatusFilter: setStatusFilter,
        items: displayItems,
        register,
        debouncedFilter,
        isCompleted,
        onRemoveItem: actions.setItemToDelete,
        onSave: handleSaveProgress,
        onBackgroundClick: () => {
          actions.setShowResults(false);
        },
      }}
      modals={{
        isScannerOpen,
        onScan: handleScan,
        onCloseScanner: () => {
          setIsScannerOpen(false);
        },
        itemToDelete: actions.itemToDelete,
        onCloseDeleteModal: () => {
          actions.setItemToDelete(null);
        },
        onConfirmDelete: actions.confirmRemoveItem,
        isRemovingItem,
        showBulkConfirm,
        onCloseBulkConfirm: () => {
          setShowBulkConfirm(false);
        },
        onConfirmBulkAdd: () => {
          void handleBulkAddWarehouseProducts();
        },
        isPopulatingWarehouse,
        showFinalizeConfirm,
        onCloseFinalizeConfirm: () => {
          setShowFinalizeConfirm(false);
        },
        onConfirmFinalize: executeFinalize,
        isFinalizing,
        pendingCount: stats.pending,
        showAddProduct,
        onCloseAddProduct: closeAddProduct,
        onCreateProduct: handleCreateProduct,
        isSavingProduct,
        newProductInitialData,
      }}
    />
  );
};

export default AuditSessionPage;
