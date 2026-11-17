import { useRef, useState } from 'react';
import { useRequisitionsStore } from '../../store/requisitionsStore';
import { exportRequisitionsToExcel } from '../../utils/requisitionsExcelExporter';
import {
  openRequisitionsWhatsApp,
  openRequisitionsTelegram,
} from '../../utils/requisitionsShareHelper';
import {
  filledRequisitionItems,
  findBlockingIssues,
  sumRequisitionQuantities,
} from '../../utils/requisitionsValidation';
import { useSuppliers } from '@/features/parties/hooks';
import { useCompany } from '@/features/settings/hooks';
import { usePermission } from '@/core/hooks/usePermission';
import { exportToPDF } from '@/core/utils/pdfExporter';
import { formatLocalDate } from '@/core/utils/dateUtils';
import { logger } from '@/core/utils/logger';

export interface RequisitionNotification {
  type: 'success' | 'error' | 'info';
  message: string;
}

/**
 * Encapsulates state, permission checks, validation guards, save, PDF/Excel
 * exports, and WhatsApp/Telegram sharing for SalesRequisitionsView.
 */
export const useRequisitionsController = () => {
  const { data: company } = useCompany();
  const { data: suppliers } = useSuppliers('');

  const {
    items,
    supplier,
    notes,
    title,
    serverNumber,
    storageWarning,
    setSupplier,
    setNotes,
    setTitle,
    saveRequisition,
    dismissStorageWarning,
    clearItems,
  } = useRequisitionsStore();

  // Audit F6: publishing a requisition to a supplier *is* the purchase-request
  // action of the purchases module, so it is gated by `purchases:create`.
  const { hasPermission: canIssuePurchaseRequest } = usePermission('purchases:create');

  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [notification, setNotification] = useState<RequisitionNotification | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  const denyIssue = (): void => {
    showNotification(
      'error',
      'عذراً، لا تمتلك صلاحية إصدار طلبات الشراء (purchases:create). راجع مدير النظام لمنحك الصلاحية.'
    );
  };

  // Audit F17: blank placeholder rows are ignored, and an unusable quantity
  // blocks every outgoing action instead of being silently rewritten to 1.
  const validItems = filledRequisitionItems(items);
  const totalItemsCount = validItems.length;
  const totalQuantity = sumRequisitionQuantities(validItems);
  const blockingIssues = findBlockingIssues(items);

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

  const handleExportExcel = async () => {
    if (!ensureCanDispatch('يرجى تسجيل صنف واحد على الأقل قبل التصدير', false)) return;
    setIsExportingExcel(true);
    try {
      await exportRequisitionsToExcel({
        companyName: company?.name_ar || company?.name_en || 'مؤسسة الجعفري لقطع الغيار',
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

  const handleShareWhatsApp = () => {
    if (!ensureCanDispatch('يرجى كتابة صنف واحد على الأقل للمشاركة عبر واتساب', true)) return;
    openRequisitionsWhatsApp({
      companyName: company?.name_ar || company?.name_en || '',
      supplier,
      items: validItems,
      title,
      number: serverNumber,
      notes,
    });
    showNotification('success', 'تم فتح واتساب مع الرسالة المنسقة');
  };

  const handleShareTelegram = () => {
    if (!ensureCanDispatch('يرجى كتابة صنف واحد على الأقل للمشاركة عبر تليجرام', true)) return;
    openRequisitionsTelegram({
      companyName: company?.name_ar || company?.name_en || '',
      supplier,
      items: validItems,
      title,
      number: serverNumber,
      notes,
    });
    showNotification('success', 'تم فتح تليجرام مع الرسالة المنسقة');
  };

  const handleSaveRequisition = async () => {
    if (!ensureCanDispatch('الجدول فارغ، لا يوجد ما يمكن حفظه', true)) return;

    setIsSaving(true);
    try {
      const outcome = await saveRequisition();
      if (outcome.uploaded) {
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

  const handleClear = () => {
    if (
      window.confirm(
        'هل أنت متأكد من مسح جميع بنود الجدول الحالية؟ سيُفقد رقم الطلب المرتبط إن وُجد.'
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
    storageWarning,
    setSupplier,
    setNotes,
    setTitle,
    dismissStorageWarning,
    canIssuePurchaseRequest,
    searchTerm,
    setSearchTerm,
    isSaving,
    isPasteModalOpen,
    setIsPasteModalOpen,
    isHistoryModalOpen,
    setIsHistoryModalOpen,
    isExportingPdf,
    isExportingExcel,
    notification,
    printRef,
    validItems,
    totalItemsCount,
    totalQuantity,
    handleExportExcel,
    handleExportPdf,
    handleShareWhatsApp,
    handleShareTelegram,
    handleSaveRequisition,
    handleClear,
  };
};
