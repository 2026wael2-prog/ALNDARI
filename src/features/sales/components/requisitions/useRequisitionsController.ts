import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRequisitionsStore } from '../../store/requisitionsStore';
import { requisitionsApi, resolveRequisitionErrorMessage } from '../../api/requisitionsApi';
import { exportRequisitionsToExcel } from '../../utils/requisitionsExcelExporter';
import {
  openRequisitionsWhatsApp,
  openRequisitionsTelegram,
} from '../../utils/requisitionsShareHelper';
import {
  filledRequisitionItems,
  findBlockingIssues,
  findDuplicateRows,
  sumRequisitionQuantities,
} from '../../utils/requisitionsValidation';
import { useSuppliers } from '@/features/parties/hooks';
import { useCompany } from '@/features/settings/hooks';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';
import { useAuthStore } from '@/features/auth/store';
import { usePermission } from '@/core/hooks/usePermission';
import { exportToPDF } from '@/core/utils/pdfExporter';
import { formatLocalDate } from '@/core/utils/dateUtils';
import { logger } from '@/core/utils/logger';
import type { Product } from '@/features/inventory/types';

export interface RequisitionNotification {
  type: 'success' | 'error' | 'info';
  message: string;
}

const DEFAULT_COMPANY_NAME = 'النظاري لبيع قطع غيار السيارات';

/**
 * Encapsulates state, permission checks, validation guards, save, status sync,
 * PDF/Excel/Print exports, Product Explorer & Low-Stock replenishment, and
 * WhatsApp/Telegram sharing for SalesRequisitionsView.
 */
export const useRequisitionsController = () => {
  const queryClient = useQueryClient();
  const { data: company } = useCompany();
  const { data: suppliers } = useSuppliers('');
  const { branchId } = useBranchFilter();
  const companyId = useAuthStore(state => state.user?.company_id ?? '');

  const {
    items,
    supplier,
    notes,
    title,
    serverNumber,
    serverBackedId,
    serverStatus,
    hasUnsavedChanges,
    storageWarning,
    setSupplier,
    setNotes,
    setTitle,
    setServerStatus,
    saveRequisition,
    appendCatalogItems,
    dismissStorageWarning,
    clearItems,
  } = useRequisitionsStore();

  // Audit F6: publishing a requisition to a supplier *is* the purchase-request
  // action of the purchases module, so it is gated by `purchases:create`.
  const { hasPermission: canIssuePurchaseRequest } = usePermission('purchases:create');

  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingLowStock, setIsLoadingLowStock] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isProductExplorerOpen, setIsProductExplorerOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [notification, setNotification] = useState<RequisitionNotification | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotification = useCallback(
    (type: 'success' | 'error' | 'info', message: string, durationMs = 4000) => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
      setNotification({ type, message });
      notificationTimerRef.current = setTimeout(() => {
        setNotification(null);
        notificationTimerRef.current = null;
      }, durationMs);
    },
    []
  );

  useEffect(
    () => () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
    },
    []
  );

  const invalidateHistory = useCallback(() => {
    if (companyId) {
      void queryClient.invalidateQueries({ queryKey: ['sales-requisitions', companyId] });
    }
  }, [companyId, queryClient]);

  const denyIssue = useCallback((): void => {
    showNotification(
      'error',
      'عذراً، لا تمتلك صلاحية إصدار طلبات الشراء (purchases:create). راجع مدير النظام لمنحك الصلاحية.'
    );
  }, [showNotification]);

  // Audit F17: blank placeholder rows are ignored, and an unusable quantity
  // blocks every outgoing action instead of being silently rewritten to 1.
  const validItems = filledRequisitionItems(items);
  const totalItemsCount = validItems.length;
  const totalQuantity = sumRequisitionQuantities(validItems);
  const blockingIssues = findBlockingIssues(items);
  const duplicateRows = findDuplicateRows(items);
  const isLockedStatus = serverStatus === 'cancelled' || serverStatus === 'received';

  const hasBlockingIssues = (): boolean => {
    if (blockingIssues.length === 0) return false;
    showNotification('error', blockingIssues[0]?.message ?? 'يوجد خطأ في بنود الطلب');
    return true;
  };

  const ensureCanDispatch = (emptyMessage: string, requirePermission: boolean): boolean => {
    if (requirePermission && !canIssuePurchaseRequest) {
      denyIssue();
      return false;
    }
    if (validItems.length === 0) {
      showNotification('error', emptyMessage);
      return false;
    }
    return !hasBlockingIssues();
  };

  const markSavedDraftAsSent = async (): Promise<void> => {
    if (!serverBackedId || serverStatus !== 'draft') return;
    try {
      await requisitionsApi.setRequisitionStatus(serverBackedId, 'sent');
      setServerStatus('sent');
      invalidateHistory();
    } catch (err) {
      logger.warn('SalesRequisitionsView', 'Failed to auto-mark requisition as sent', err);
    }
  };

  const handleExportExcel = async () => {
    if (!ensureCanDispatch('يرجى تسجيل صنف واحد على الأقل قبل التصدير', false)) return;
    setIsExportingExcel(true);
    try {
      await exportRequisitionsToExcel({
        companyName: company?.name_ar || company?.name_en || DEFAULT_COMPANY_NAME,
        companyAddress: company?.address || '',
        taxNumber: company?.tax_number || '',
        supplier,
        items: validItems,
        title,
        number: serverNumber,
        notes,
      });
      showNotification('success', 'تم تصدير ملف الإكسل الملون بنجاح');
    } catch (err) {
      logger.error('SalesRequisitionsView', 'Excel export failed', err);
      showNotification('error', 'حدث خطأ أثناء تصدير ملف Excel');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    if (!ensureCanDispatch('يرجى تسجيل صنف واحد على الأقل قبل تصدير PDF', false)) return;
    if (!printRef.current) {
      showNotification('error', 'تعذر العثور على ورقة الطباعة');
      return;
    }

    setIsExportingPdf(true);
    try {
      const fileName = `مطلوبات_${serverNumber ? serverNumber + '_' : ''}${supplier?.name ? supplier.name.replace(/\s+/g, '_') : 'طلب'}_${formatLocalDate()}`;
      await exportToPDF(printRef.current, fileName, {
        pageSize: 'a4',
        orientation: 'p',
        marginMm: 8,
      });
      showNotification('success', 'تم تصدير ملف PDF بالهيدر الاحترافي بنجاح');
    } catch (err) {
      logger.error('SalesRequisitionsView', 'PDF export failed', err);
      showNotification('error', 'فشل في تصدير ملف PDF');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrint = () => {
    if (!ensureCanDispatch('يرجى تسجيل صنف واحد على الأقل قبل الطباعة', false)) return;
    if (!printRef.current) {
      showNotification('error', 'تعذر العثور على ورقة الطباعة');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      showNotification('error', 'المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة أو استخدم تصدير PDF');
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${title || 'قائمة المطلوبات'}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 14px; font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif; color: #000; background: #fff; direction: rtl; }
    @page { size: A4 portrait; margin: 10mm; }
  </style>
</head>
<body>${printRef.current.innerHTML}</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleShareWhatsApp = () => {
    if (!ensureCanDispatch('يرجى كتابة صنف واحد على الأقل للمشاركة عبر واتساب', true)) return;
    openRequisitionsWhatsApp({
      companyName: company?.name_ar || company?.name_en || DEFAULT_COMPANY_NAME,
      supplier,
      items: validItems,
      title,
      number: serverNumber,
      notes,
    });
    void markSavedDraftAsSent();
    showNotification(
      'success',
      serverBackedId && serverStatus === 'draft'
        ? 'تم فتح واتساب وتحديث حالة الطلب إلى "أُرسل للمورد"'
        : 'تم فتح واتساب مع الرسالة المنسقة'
    );
  };

  const handleShareTelegram = () => {
    if (!ensureCanDispatch('يرجى كتابة صنف واحد على الأقل للمشاركة عبر تليجرام', true)) return;
    openRequisitionsTelegram({
      companyName: company?.name_ar || company?.name_en || DEFAULT_COMPANY_NAME,
      supplier,
      items: validItems,
      title,
      number: serverNumber,
      notes,
    });
    void markSavedDraftAsSent();
    showNotification(
      'success',
      serverBackedId && serverStatus === 'draft'
        ? 'تم فتح تليجرام وتحديث حالة الطلب إلى "أُرسل للمورد"'
        : 'تم فتح تليجرام مع الرسالة المنسقة'
    );
  };

  const handleSaveRequisition = async () => {
    if (!ensureCanDispatch('الجدول فارغ، لا يوجد ما يمكن حفظه', true)) return;
    if (isLockedStatus) {
      showNotification(
        'error',
        'هذا الطلب مغلق أو ملغى ولا يمكن تعديله — افتح "طلب جديد" لإنشاء طلبية جديدة'
      );
      return;
    }

    setIsSaving(true);
    try {
      const outcome = await saveRequisition({ branchId });
      if (outcome.uploaded) {
        invalidateHistory();
        const savedNumber = outcome.record.number;
        showNotification(
          'success',
          savedNumber === null
            ? 'تم حفظ الطلب على الخادم'
            : `تم حفظ الطلب برقم رسمي ${savedNumber} على الخادم`
        );
      } else {
        showNotification(
          'info',
          'تم الحفظ على هذا الجهاز فقط: ' + (outcome.error ?? 'تعذّر الاتصال بالخادم')
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectFromExplorer = useCallback(
    (product: Product) => {
      const res = appendCatalogItems([
        {
          productId: product.id,
          name: product.name_ar || '',
          partNumber: (product.part_number || product.sku || '').toUpperCase(),
          brand: product.brand || '',
          quantity: 1,
          notes: '',
        },
      ]);
      if (res.added > 0) {
        showNotification('success', `تمت إضافة "${product.name_ar}" إلى جدول المطلوبات`);
      } else {
        showNotification('info', `الصنف "${product.name_ar}" موجود مسبقاً في جدول المطلوبات`);
      }
    },
    [appendCatalogItems, showNotification]
  );

  const handleLoadLowStock = async () => {
    if (!companyId) {
      showNotification('error', 'تعذّر تحديد المنشأة الحالية');
      return;
    }
    setIsLoadingLowStock(true);
    try {
      const lowStock = await requisitionsApi.listLowStockItems(companyId, branchId, 25);
      if (lowStock.length === 0) {
        showNotification('info', 'لا توجد نواقص حرجة أو أصناف سريعة الحركة منخفضة الرصيد حالياً');
        return;
      }
      const res = appendCatalogItems(
        lowStock.map(item => ({
          productId: item.id,
          name: item.name_ar,
          partNumber: (item.part_number || item.sku || '').toUpperCase(),
          brand: item.brand,
          quantity: item.suggested_qty,
          notes: `رصيد: ${item.current_qty}${item.sold_90d > 0 ? ` | مبيعات 90 يوم: ${item.sold_90d}` : ''}`,
        }))
      );
      if (res.added > 0) {
        showNotification(
          'success',
          `تم جلب ${res.added} صنف من النواقص الأكثر طلباً${res.duplicates > 0 ? ` (تجاهل ${res.duplicates} موجود مسبقاً)` : ''}`
        );
      } else {
        showNotification('info', 'جميع أصناف النواقص المقترحة مضافة مسبقاً في الجدول');
      }
    } catch (err) {
      logger.error('SalesRequisitionsView', 'Failed to load low stock items', err);
      showNotification('error', resolveRequisitionErrorMessage(err));
    } finally {
      setIsLoadingLowStock(false);
    }
  };

  const handleNewRequisition = () => {
    if (
      hasUnsavedChanges &&
      validItems.length > 0 &&
      !window.confirm('يوجد تعديلات غير محفوظة في الطلب الحالي. هل تريد بدء طلب مطلوبات جديد؟')
    ) {
      return;
    }
    clearItems();
    showNotification('info', 'تم فتح نموذج طلب مطلوبات جديد');
  };

  const handleClear = () => {
    if (
      validItems.length === 0 ||
      window.confirm(
        'هل أنت متأكد من مسح جميع بنود الجدول الحالية؟ سيُفصل رقم الطلب المرتبط إن وُجد.'
      )
    ) {
      clearItems();
      showNotification('info', 'تم مسح الجدول');
    }
  };

  return {
    company,
    suppliers,
    supplier,
    notes,
    title,
    serverNumber,
    serverBackedId,
    serverStatus,
    hasUnsavedChanges,
    isLockedStatus,
    storageWarning,
    setSupplier,
    setNotes,
    setTitle,
    dismissStorageWarning,
    canIssuePurchaseRequest,
    searchTerm,
    setSearchTerm,
    isSaving,
    isLoadingLowStock,
    isPasteModalOpen,
    setIsPasteModalOpen,
    isHistoryModalOpen,
    setIsHistoryModalOpen,
    isProductExplorerOpen,
    setIsProductExplorerOpen,
    isExportingPdf,
    isExportingExcel,
    notification,
    printRef,
    validItems,
    totalItemsCount,
    totalQuantity,
    duplicateRows,
    handleExportExcel,
    handleExportPdf,
    handlePrint,
    handleShareWhatsApp,
    handleShareTelegram,
    handleSaveRequisition,
    handleSelectFromExplorer,
    handleLoadLowStock,
    handleNewRequisition,
    handleClear,
  };
};
