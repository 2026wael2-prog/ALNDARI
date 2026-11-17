import React from 'react';
import {
  Clipboard,
  FileSpreadsheet,
  FileText,
  Hash,
  History,
  Layers,
  Package,
  Phone,
  RotateCcw,
  Save,
  Search,
  Send,
  SendHorizontal,
  User,
} from 'lucide-react';
import type { Party } from '@/features/parties/types';
import type { RequisitionSupplier } from '../../types/requisitions';

interface RequisitionsToolbarProps {
  title: string;
  setTitle: (title: string) => void;
  serverNumber: string | null;
  supplier: RequisitionSupplier | null;
  setSupplier: (supplier: RequisitionSupplier | null) => void;
  suppliers: Party[];
  canIssuePurchaseRequest: boolean;
  isSaving: boolean;
  isExportingExcel: boolean;
  isExportingPdf: boolean;
  totalItemsCount: number;
  totalQuantity: number;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onOpenPaste: () => void;
  onOpenHistory: () => void;
  onSave: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onShareWhatsApp: () => void;
  onShareTelegram: () => void;
  onClear: () => void;
}

/**
 * Header control strip and KPI summary bar for SalesRequisitionsView.
 */
export const RequisitionsToolbar: React.FC<RequisitionsToolbarProps> = ({
  title,
  setTitle,
  serverNumber,
  supplier,
  setSupplier,
  suppliers,
  canIssuePurchaseRequest,
  isSaving,
  isExportingExcel,
  isExportingPdf,
  totalItemsCount,
  totalQuantity,
  searchTerm,
  setSearchTerm,
  onOpenPaste,
  onOpenHistory,
  onSave,
  onExportExcel,
  onExportPdf,
  onShareWhatsApp,
  onShareTelegram,
  onClear,
}) => (
  <>
    {/* Control & Header Toolbar */}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-500">عنوان الطلب:</span>
          <input
            type="text"
            value={title}
            onChange={e => {
              setTitle(e.target.value);
            }}
            placeholder="مثال: طلبية قطع أسبوعية..."
            className="h-8 rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
          title="رقم الطلب الرسمي يُصدره الخادم تسلسلياً"
        >
          <Hash size={13} className="text-blue-600" />
          <span className="font-mono">{serverNumber || 'بدون رقم — مسودة محلية'}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <User size={14} className="text-blue-600" />
          <span className="text-xs font-bold text-slate-500">المورد:</span>
          <select
            value={supplier?.id || ''}
            onChange={e => {
              const sId = e.target.value;
              if (!sId) {
                setSupplier(null);
              } else {
                const found = suppliers.find(s => s.id === sId);
                if (found) {
                  setSupplier({
                    id: found.id,
                    name: found.name,
                    phone: found.phone || '',
                  });
                }
              }
            }}
            className="h-8 max-w-[180px] rounded-lg border border-slate-300 bg-slate-50 px-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">-- اختر مورد (اختياري) --</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} {s.phone ? `(${s.phone})` : ''}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <Phone size={13} className="text-slate-400" />
            <input
              type="text"
              dir="ltr"
              value={supplier?.phone || ''}
              onChange={e => {
                setSupplier({
                  id: supplier?.id ?? undefined,
                  name: supplier?.name || 'مورد عام',
                  phone: e.target.value || undefined,
                });
              }}
              placeholder="رقم الهاتف للواتساب"
              className="h-8 w-32 rounded-lg border border-slate-300 bg-slate-50 px-2 text-left font-mono text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenPaste}
          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          title="لصق أعمدة وصفوف من ملف إكسل خارجي"
        >
          <Clipboard size={14} className="text-blue-600" />
          <span className="hidden sm:inline">لصق من إكسل</span>
        </button>

        <button
          type="button"
          onClick={onOpenHistory}
          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          title="عرض الطلبات والمسودات المحفوظة"
        >
          <History size={14} className="text-amber-600" />
          <span className="hidden sm:inline">السجل</span>
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={!canIssuePurchaseRequest || isSaving}
          className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-800 transition-colors hover:bg-blue-100 active:scale-95 disabled:opacity-50 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
          title={
            !canIssuePurchaseRequest
              ? 'تتطلب صلاحية purchases:create'
              : isSaving
                ? 'جارٍ الحفظ على الخادم...'
                : 'حفظ القائمة الحالية كطلب مطلوبات'
          }
        >
          <Save size={14} />
          <span>حفظ</span>
        </button>

        <button
          type="button"
          onClick={onExportExcel}
          disabled={isExportingExcel}
          className="shadow-2xs flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-emerald-800 active:scale-95 disabled:opacity-50"
          title="تصدير جدول إكسل ملون احترافي"
        >
          <FileSpreadsheet size={14} />
          <span>{isExportingExcel ? 'جاري التصدير...' : 'تصدير Excel'}</span>
        </button>

        <button
          type="button"
          onClick={onExportPdf}
          disabled={isExportingPdf}
          className="shadow-2xs flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-rose-800 active:scale-95 disabled:opacity-50"
          title="تصدير ملف PDF بهيدر المنشأة الرسمي"
        >
          <FileText size={14} />
          <span>{isExportingPdf ? 'جاري التحويل...' : 'تصدير PDF'}</span>
        </button>

        <button
          type="button"
          onClick={onShareWhatsApp}
          disabled={!canIssuePurchaseRequest}
          className="shadow-2xs flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
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
          className="shadow-2xs flex items-center gap-1.5 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-bold text-white transition-all hover:bg-sky-700 active:scale-95 disabled:opacity-50"
          title={canIssuePurchaseRequest ? 'مشاركة عبر تليجرام' : 'تتطلب صلاحية purchases:create'}
        >
          <SendHorizontal size={13} />
          <span>تليجرام</span>
        </button>

        <button
          type="button"
          onClick={onClear}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
          title="مسح الجدول"
        >
          <RotateCcw size={15} />
        </button>
      </div>
    </div>

    {/* Summary KPI Badges & Quick Search */}
    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="shadow-2xs flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <Package size={13} className="text-blue-500" />
          <span>عدد الأصناف المسجلة:</span>
          <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
            {totalItemsCount}
          </span>
        </div>

        <div className="shadow-2xs flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <Layers size={13} className="text-emerald-500" />
          <span>إجمالي الكمية المطلوبة:</span>
          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
            {totalQuantity}
          </span>
        </div>

        {supplier?.name && (
          <div className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-1 font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            <User size={13} />
            <span>المورد:</span>
            <span className="font-bold">{supplier.name}</span>
          </div>
        )}
      </div>

      <div className="relative w-64 max-w-full">
        <Search
          size={13}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
          }}
          placeholder="بحث سريع في عناصر الجدول..."
          className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        />
      </div>
    </div>
  </>
);
