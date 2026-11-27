import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  Clipboard,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Hash,
  History,
  Layers,
  Loader2,
  Package,
  Phone,
  Printer,
  RotateCcw,
  Save,
  Search,
  Send,
  SendHorizontal,
  TrendingDown,
  User,
  X,
} from 'lucide-react';
import type { Party } from '@/features/parties/types';
import type { RequisitionStatus, RequisitionSupplier } from '../../types/requisitions';

interface RequisitionsToolbarProps {
  title: string;
  setTitle: (title: string) => void;
  serverNumber: string | null;
  serverStatus: RequisitionStatus | null;
  hasUnsavedChanges: boolean;
  isLockedStatus: boolean;
  supplier: RequisitionSupplier | null;
  setSupplier: (supplier: RequisitionSupplier | null) => void;
  suppliers: Party[];
  canIssuePurchaseRequest: boolean;
  isSaving: boolean;
  isLoadingLowStock: boolean;
  isExportingExcel: boolean;
  isExportingPdf: boolean;
  totalItemsCount: number;
  totalQuantity: number;
  duplicateRowsCount: number;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onNewRequisition: () => void;
  onOpenExplorer: () => void;
  onLoadLowStock: () => void;
  onOpenPaste: () => void;
  onOpenHistory: () => void;
  onSave: () => void;
  onPrint: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onShareWhatsApp: () => void;
  onShareTelegram: () => void;
  onClear: () => void;
}

const STATUS_BADGE: Record<RequisitionStatus, { label: string; className: string }> = {
  draft: {
    label: 'مسودة',
    className: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
  },
  sent: {
    label: 'أُرسل للمورد',
    className: 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800',
  },
  received: {
    label: 'تم التوريد',
    className: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
  },
  cancelled: {
    label: 'ملغي',
    className: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800',
  },
};

/**
 * Header control strip, searchable supplier picker, and KPI summary bar for SalesRequisitionsView.
 */
export const RequisitionsToolbar: React.FC<RequisitionsToolbarProps> = ({
  title,
  setTitle,
  serverNumber,
  serverStatus,
  hasUnsavedChanges,
  isLockedStatus,
  supplier,
  setSupplier,
  suppliers,
  canIssuePurchaseRequest,
  isSaving,
  isLoadingLowStock,
  isExportingExcel,
  isExportingPdf,
  totalItemsCount,
  totalQuantity,
  duplicateRowsCount,
  searchTerm,
  setSearchTerm,
  onNewRequisition,
  onOpenExplorer,
  onLoadLowStock,
  onOpenPaste,
  onOpenHistory,
  onSave,
  onPrint,
  onExportExcel,
  onExportPdf,
  onShareWhatsApp,
  onShareTelegram,
  onClear,
}) => {
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState('');
  const supplierBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (supplierBoxRef.current && !supplierBoxRef.current.contains(e.target as Node)) {
        setSupplierDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
    };
  }, []);

  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 60);
    return suppliers
      .filter(
        s =>
          s.name.toLowerCase().includes(q) ||
          (s.phone && s.phone.toLowerCase().includes(q))
      )
      .slice(0, 60);
  }, [suppliers, supplierQuery]);

  const statusMeta = serverStatus ? STATUS_BADGE[serverStatus] : null;

  return (
    <>
      {/* Control & Header Toolbar */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {/* Row 1: Title, Document Number, Status, Supplier & Phone */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-extrabold text-black dark:text-slate-200">عنوان الطلب:</span>
            <input
              type="text"
              value={title}
              onChange={e => {
                setTitle(e.target.value);
              }}
              placeholder="مثال: طلبية قطع أسبوعية..."
              className="h-8 w-52 rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-xs font-bold text-black outline-none focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-bold text-black dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            title="رقم الطلب الرسمي يُصدره الخادم تسلسلياً"
          >
            <Hash size={13} className="text-blue-600" />
            <span className="font-mono">{serverNumber || 'بدون رقم — مسودة'}</span>
            {hasUnsavedChanges && totalItemsCount > 0 && (
              <span
                className="h-2 w-2 rounded-full bg-amber-500"
                title="يوجد تعديلات غير محفوظة"
              />
            )}
          </div>

          {statusMeta && (
            <span
              className={`rounded-lg border px-2 py-1 text-[11px] font-extrabold ${statusMeta.className}`}
            >
              {statusMeta.label}
            </span>
          )}

          {/* Searchable Supplier Picker */}
          <div className="relative flex items-center gap-1.5" ref={supplierBoxRef}>
            <User size={14} className="text-blue-600" />
            <span className="text-xs font-extrabold text-black dark:text-slate-200">المورد:</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setSupplierDropdownOpen(prev => !prev);
                  setSupplierQuery('');
                }}
                className="flex h-8 w-48 items-center justify-between gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-right text-xs font-bold text-black outline-none transition-colors hover:bg-white focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <span className="truncate">
                  {supplier?.name || '-- اختر مورد (اختياري) --'}
                </span>
                <ChevronDown size={13} className="shrink-0 text-slate-500" />
              </button>

              {supplierDropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-slate-300 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="relative mb-1.5">
                    <Search
                      size={13}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      autoFocus
                      value={supplierQuery}
                      onChange={e => {
                        setSupplierQuery(e.target.value);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Escape') setSupplierDropdownOpen(false);
                      }}
                      placeholder="ابحث باسم المورد أو رقم الهاتف..."
                      className="h-8 w-full rounded-lg border border-slate-300 bg-slate-50 pl-2 pr-8 text-xs font-bold text-black outline-none focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div className="custom-scrollbar max-h-56 overflow-y-auto">
                    {supplier && (
                      <button
                        type="button"
                        onClick={() => {
                          setSupplier(null);
                          setSupplierDropdownOpen(false);
                        }}
                        className="mb-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-right text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <X size={12} />
                        <span>إلغاء تحديد المورد</span>
                      </button>
                    )}
                    {filteredSuppliers.length === 0 ? (
                      <div className="p-3 text-center text-xs font-semibold text-slate-500">
                        لا يوجد مورد مطابق
                      </div>
                    ) : (
                      filteredSuppliers.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSupplier({
                              id: s.id,
                              name: s.name,
                              phone: s.phone || '',
                            });
                            setSupplierDropdownOpen(false);
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-right text-xs transition-colors hover:bg-blue-50 dark:hover:bg-slate-800 ${
                            supplier?.id === s.id
                              ? 'bg-blue-50 font-extrabold text-blue-900 dark:bg-blue-950/50 dark:text-blue-200'
                              : 'font-bold text-black dark:text-slate-100'
                          }`}
                        >
                          <span className="truncate">{s.name}</span>
                          {s.phone && (
                            <span className="shrink-0 font-mono text-[11px] text-slate-600 dark:text-slate-400" dir="ltr">
                              {s.phone}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              <Phone size={13} className="text-slate-500" />
              <input
                type="text"
                dir="ltr"
                value={supplier?.phone || ''}
                onChange={e => {
                  const nextPhone = e.target.value;
                  if (!nextPhone.trim() && !supplier?.id && supplier?.name === 'مورد عام') {
                    setSupplier(null);
                  } else {
                    setSupplier({
                      id: supplier?.id ?? undefined,
                      name: supplier?.name || 'مورد عام',
                      phone: nextPhone || undefined,
                    });
                  }
                }}
                placeholder="رقم الواتساب"
                className="h-8 w-32 rounded-lg border border-slate-300 bg-slate-50 px-2 text-left font-mono text-xs font-bold text-black outline-none focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onNewRequisition}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-extrabold text-black transition-colors hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
              title="بدء نموذج طلب مطلوبات جديد برقم جديد"
            >
              <FilePlus2 size={14} className="text-indigo-600" />
              <span>طلب جديد</span>
            </button>

            <button
              type="button"
              onClick={onOpenExplorer}
              className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-extrabold text-indigo-900 transition-colors hover:bg-indigo-100 active:scale-95 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-900/60"
              title="اختيار قطع من مستكشف الأصناف الكامل"
            >
              <Boxes size={14} className="text-indigo-600 dark:text-indigo-400" />
              <span>مستكشف الأصناف</span>
            </button>

            <button
              type="button"
              onClick={onLoadLowStock}
              disabled={isLoadingLowStock}
              className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-extrabold text-amber-950 transition-colors hover:bg-amber-100 active:scale-95 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
              title="جلب الأصناف التي نفد مخزونها أو وصلت لحد الطلب تلقائياً"
            >
              {isLoadingLowStock ? (
                <Loader2 size={14} className="animate-spin text-amber-600" />
              ) : (
                <TrendingDown size={14} className="text-amber-600" />
              )}
              <span>{isLoadingLowStock ? 'جاري الجلب...' : 'جلب النواقص'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenPaste}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-extrabold text-black transition-colors hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              title="لصق أعمدة وصفوف من ملف إكسل خارجي"
            >
              <Clipboard size={14} className="text-blue-600" />
              <span className="hidden sm:inline">لصق من إكسل</span>
            </button>

            <button
              type="button"
              onClick={onOpenHistory}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-extrabold text-black transition-colors hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              title="عرض وإدارة حالات الطلبات المحفوظة"
            >
              <History size={14} className="text-amber-600" />
              <span>السجل</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onSave}
              disabled={!canIssuePurchaseRequest || isSaving || isLockedStatus}
              className="flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white transition-colors hover:bg-blue-700 active:scale-95 disabled:opacity-50"
              title={
                !canIssuePurchaseRequest
                  ? 'تتطلب صلاحية purchases:create'
                  : isLockedStatus
                    ? 'الطلب مغلق أو ملغى'
                    : isSaving
                      ? 'جارٍ الحفظ على الخادم...'
                      : 'حفظ القائمة الحالية على الخادم'
              }
            >
              <Save size={14} />
              <span>{isSaving ? 'جارٍ الحفظ...' : serverNumber ? 'حفظ التعديلات' : 'حفظ'}</span>
            </button>

            <button
              type="button"
              onClick={onPrint}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-extrabold text-black transition-colors hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              title="طباعة قائمة المطلوبات مباشرة"
            >
              <Printer size={14} className="text-slate-700 dark:text-slate-300" />
              <span className="hidden md:inline">طباعة</span>
            </button>

            <button
              type="button"
              onClick={onExportExcel}
              disabled={isExportingExcel}
              className="shadow-2xs flex items-center gap-1.5 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white transition-all hover:bg-emerald-800 active:scale-95 disabled:opacity-50"
              title="تصدير جدول إكسل ملون احترافي"
            >
              <FileSpreadsheet size={14} />
              <span>{isExportingExcel ? 'جاري التصدير...' : 'Excel'}</span>
            </button>

            <button
              type="button"
              onClick={onExportPdf}
              disabled={isExportingPdf}
              className="shadow-2xs flex items-center gap-1.5 rounded-lg bg-rose-700 px-2.5 py-1.5 text-xs font-bold text-white transition-all hover:bg-rose-800 active:scale-95 disabled:opacity-50"
              title="تصدير ملف PDF بهيدر المنشأة الرسمي"
            >
              <FileText size={14} />
              <span>{isExportingPdf ? 'جاري التحويل...' : 'PDF'}</span>
            </button>

            <button
              type="button"
              onClick={onShareWhatsApp}
              disabled={!canIssuePurchaseRequest}
              className="shadow-2xs flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
              title={
                canIssuePurchaseRequest
                  ? 'إرسال قائمة المطلوب عبر واتساب للمورد'
                  : 'تتطلب صلاحية purchases:create'
              }
            >
              <Send size={13} />
              <span>واتساب</span>
            </button>

            <button
              type="button"
              onClick={onShareTelegram}
              disabled={!canIssuePurchaseRequest}
              className="shadow-2xs flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-bold text-white transition-all hover:bg-sky-700 active:scale-95 disabled:opacity-50"
              title={canIssuePurchaseRequest ? 'مشاركة عبر تليجرام' : 'تتطلب صلاحية purchases:create'}
            >
              <SendHorizontal size={13} />
              <span>تليجرام</span>
            </button>

            <button
              type="button"
              onClick={onClear}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-slate-800"
              title="مسح الجدول بالكامل"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Badges & Quick Search */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="shadow-2xs flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-bold text-black dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
            <Package size={13} className="text-blue-600" />
            <span>الأصناف المسجلة:</span>
            <span className="font-mono font-extrabold text-blue-700 dark:text-blue-400">
              {totalItemsCount}
            </span>
          </div>

          <div className="shadow-2xs flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-bold text-black dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
            <Layers size={13} className="text-emerald-600" />
            <span>إجمالي الكمية:</span>
            <span className="font-mono font-extrabold text-emerald-700 dark:text-emerald-400">
              {totalQuantity}
            </span>
          </div>

          {duplicateRowsCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 font-extrabold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle size={13} />
              <span>{duplicateRowsCount} سطر مكرر</span>
            </div>
          )}

          {supplier?.name && (
            <div className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-1 font-bold text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
              <User size={13} />
              <span>المورد:</span>
              <span className="font-extrabold">{supplier.name}</span>
            </div>
          )}
        </div>

        <div className="relative w-64 max-w-full">
          <Search
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
            }}
            placeholder="بحث سريع في عناصر الجدول..."
            className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-3 pr-8 text-xs font-bold text-black outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>
    </>
  );
};
