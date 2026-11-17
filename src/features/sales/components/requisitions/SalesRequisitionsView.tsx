import React from 'react';
import { AlertCircle, CheckCircle, CloudOff, ShieldAlert, X } from 'lucide-react';
import { RequisitionsExcelGrid } from './RequisitionsExcelGrid';
import { RequisitionsPrintSheet } from './RequisitionsPrintSheet';
import { RequisitionsPasteModal } from './RequisitionsPasteModal';
import { RequisitionsHistoryModal } from './RequisitionsHistoryModal';
import { RequisitionsToolbar } from './RequisitionsToolbar';
import { useRequisitionsController } from './useRequisitionsController';

export const SalesRequisitionsView: React.FC = () => {
  const {
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
  } = useRequisitionsController();

  return (
    <div className="flex flex-col gap-3 pb-8" dir="rtl">
      {notification && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs font-bold transition-all ${
            notification.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
              : notification.type === 'error'
                ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
                : 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200'
          }`}
        >
          {notification.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          <span>{notification.message}</span>
        </div>
      )}

      {!canIssuePurchaseRequest && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <ShieldAlert size={15} />
          <span>
            وضع القراءة فقط: لا تمتلك صلاحية إصدار طلبات الشراء (purchases:create)، لذا الحفظ
            والمشاركة مع المورد معطّلان. التصدير والطباعة واللصق متاحة.
          </span>
        </div>
      )}

      {storageWarning && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs font-bold text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
          <span className="flex items-center gap-2">
            <CloudOff size={15} />
            تعذّر حفظ مسودة المطلوبات في هذا المتصفح (مساحة التخزين ممتلئة أو وضع التصفح الخاص) —
            صدّر الطلب أو اطبعه قبل إغلاق الصفحة.
          </span>
          <button
            type="button"
            onClick={dismissStorageWarning}
            className="rounded p-1 hover:bg-rose-100 dark:hover:bg-rose-900"
            title="إخفاء التنبيه"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <RequisitionsToolbar
        title={title}
        setTitle={setTitle}
        serverNumber={serverNumber}
        supplier={supplier}
        setSupplier={setSupplier}
        suppliers={suppliers}
        canIssuePurchaseRequest={canIssuePurchaseRequest}
        isSaving={isSaving}
        isExportingExcel={isExportingExcel}
        isExportingPdf={isExportingPdf}
        totalItemsCount={totalItemsCount}
        totalQuantity={totalQuantity}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onOpenPaste={() => {
          setIsPasteModalOpen(true);
        }}
        onOpenHistory={() => {
          setIsHistoryModalOpen(true);
        }}
        onSave={() => {
          void handleSaveRequisition();
        }}
        onExportExcel={() => {
          void handleExportExcel();
        }}
        onExportPdf={() => {
          void handleExportPdf();
        }}
        onShareWhatsApp={handleShareWhatsApp}
        onShareTelegram={handleShareTelegram}
        onClear={handleClear}
      />

      <RequisitionsExcelGrid searchTerm={searchTerm} />

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <label
          htmlFor="requisitions-general-notes"
          className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300"
        >
          ملاحظات عامة على الطلب (تظهر في التصدير ورسائل الواتساب والتليجرام):
        </label>
        <textarea
          id="requisitions-general-notes"
          rows={2}
          value={notes}
          onChange={e => {
            setNotes(e.target.value);
          }}
          placeholder="مثال: يرجى إرسال الأسعار قبل الشحن، الشحن عبر مكتب التوصيل الفلاني..."
          className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
      </div>

      {/* Hidden PDF/Print Template */}
      <div className="fixed -left-[9999px] top-0 w-[820px] bg-white text-black" aria-hidden="true">
        <div ref={printRef}>
          <RequisitionsPrintSheet
            company={{
              name: company?.name_ar || company?.name_en || 'مؤسسة الجعفري',
              phone: company?.phone ?? undefined,
              address: company?.address ?? undefined,
              tax_number: company?.tax_number ?? undefined,
              logo_url: company?.logo_url ?? undefined,
            }}
            supplier={supplier}
            items={validItems}
            notes={notes}
            title={title}
            number={serverNumber}
          />
        </div>
      </div>

      <RequisitionsPasteModal
        isOpen={isPasteModalOpen}
        onClose={() => {
          setIsPasteModalOpen(false);
        }}
      />
      <RequisitionsHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => {
          setIsHistoryModalOpen(false);
        }}
      />
    </div>
  );
};
