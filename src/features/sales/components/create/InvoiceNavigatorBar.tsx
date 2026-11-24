/* eslint-disable max-lines-per-function, complexity */
import React, { useState, useEffect } from 'react';
import {
  ChevronsRight,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  FilePlus2,
  Eye,
  FileSpreadsheet,
  Loader2,
  Save,
  Printer,
  FileDown,
  FileText,
  CornerDownLeft,
  Hash,
} from 'lucide-react';
import type { UseInvoiceNavigationResult } from '../../hooks/useInvoiceNavigation';
import type { InvoiceStatus } from '../../types';
import { formatCurrency } from '@/core/utils';

interface InvoiceNavigatorBarProps {
  navigation: UseInvoiceNavigationResult;
  defaultNextNumber?: string | undefined;
  onNewInvoiceClick?: () => void;
  onSave?: ((status: InvoiceStatus) => void) | undefined;
  onSaveAsQuotation?: (() => void) | undefined;
  isSavingQuotation?: boolean | undefined;
  onPrint?: (() => void) | undefined;
  isSaving?: boolean | undefined;
  totalAmount?: number | undefined;
  currencyCode?: string | undefined;
}

export const InvoiceNavigatorBar: React.FC<InvoiceNavigatorBarProps> = ({
  navigation,
  defaultNextNumber,
  onNewInvoiceClick,
  onSave,
  onSaveAsQuotation,
  isSavingQuotation = false,
  onPrint,
  isSaving = false,
  totalAmount = 0,
  currencyCode = 'SAR',
}) => {
  const {
    currentViewingInvoice,
    canGoFirst,
    canGoPrev,
    canGoNext,
    canGoLast,
    goToFirst,
    goToPrev,
    goToNext,
    goToLast,
    jumpToInvoiceNumber,
    exitViewingMode,
    isNavigating,
  } = navigation;

  const [inputVal, setInputVal] = useState<string>('');

  // مزامنة مربع الإدخال مع رقم الفاتورة الحالية أو التالية
  useEffect(() => {
    if (currentViewingInvoice) {
      setInputVal(currentViewingInvoice.invoice_number);
    } else if (defaultNextNumber !== undefined && defaultNextNumber.length > 0) {
      setInputVal(defaultNextNumber);
    } else {
      setInputVal('');
    }
  }, [currentViewingInvoice, defaultNextNumber]);

  const handleSearchSubmit = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    void jumpToInvoiceNumber(inputVal.trim());
  };

  const handleNewInvoice = (): void => {
    exitViewingMode();
    if (onNewInvoiceClick) {
      onNewInvoiceClick();
    }
  };

  const isViewingPrevious = Boolean(currentViewingInvoice);

  return (
    <footer className="fixed inset-x-0 bottom-[calc(3.6rem_+_env(safe-area-inset-bottom))] z-40 border-t border-slate-200/90 bg-white/95 px-2 py-1.5 shadow-[0_-6px_20px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-all dark:border-slate-800/90 dark:bg-slate-900/95 sm:px-4 sm:py-2 md:bottom-0 md:px-6 md:py-2.5">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-1.5 sm:gap-2.5">

        {/* الجانب الأيمن: أزرار التنقل VCR على طريقة برنامج الميزان مع الأيقونات المطورة */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* الفاتورة الأولى (|◀) */}
          <button
            type="button"
            onClick={goToFirst}
            disabled={!canGoFirst || isNavigating}
            title="الفاتورة الأولى (|◀)"
            className="group hidden h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-slate-700 dark:hover:text-blue-400 sm:flex md:h-9 md:w-9"
          >
            <ChevronsRight size={17} className="transition-transform group-hover:-translate-x-0.5" />
          </button>

          {/* الفاتورة السابقة (◀) */}
          <button
            type="button"
            onClick={goToPrev}
            disabled={!canGoPrev || isNavigating}
            title="الفاتورة السابقة (◀)"
            className="group flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-slate-700 dark:hover:text-blue-400 md:h-9 md:w-9"
          >
            <ChevronRight size={17} className="transition-transform group-hover:-translate-x-0.5" />
          </button>

          {/* مربع إدخال رقم الفاتورة والقفز السريع */}
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <div className="pointer-events-none absolute right-2 flex items-center text-slate-400 sm:right-2.5">
              <Hash size={12} />
            </div>
            <input
              type="text"
              value={inputVal}
              onChange={e => {
                setInputVal(e.target.value);
              }}
              placeholder="رقم..."
              className="h-8 w-24 rounded-xl border border-slate-300 bg-slate-50/80 pl-7 pr-6 text-center font-mono text-xs font-bold text-slate-900 shadow-inner transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-900 sm:w-40 md:h-9 md:w-44 md:pl-8 md:pr-7"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={isNavigating || !inputVal.trim()}
              title="انتقال فوري لرقم الفاتورة (Enter)"
              className="absolute left-1 flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition-all hover:bg-blue-700 active:scale-90 disabled:opacity-25 md:h-7 md:w-7"
            >
              {isNavigating ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <CornerDownLeft size={12} />
              )}
            </button>
          </form>

          {/* الفاتورة التالية (▶) */}
          <button
            type="button"
            onClick={goToNext}
            disabled={!canGoNext || isNavigating}
            title="الفاتورة التالية (▶)"
            className="group flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-slate-700 dark:hover:text-blue-400 md:h-9 md:w-9"
          >
            <ChevronLeft size={17} className="transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* الفاتورة الأخيرة (▶|) */}
          <button
            type="button"
            onClick={goToLast}
            disabled={!canGoLast || isNavigating}
            title="الفاتورة الأخيرة (▶|)"
            className="group hidden h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-slate-700 dark:hover:text-blue-400 sm:flex md:h-9 md:w-9"
          >
            <ChevronsLeft size={17} className="transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* زر فتح فاتورة جديدة بيضاء */}
          <button
            type="button"
            onClick={handleNewInvoice}
            title="فتح فاتورة مبيعات جديدة بيضاء"
            className="flex h-8 items-center gap-1 rounded-xl border border-emerald-600/30 bg-emerald-50 px-2 font-medium text-emerald-800 shadow-sm transition-all hover:bg-emerald-100 hover:text-emerald-900 active:scale-95 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 sm:gap-1.5 sm:px-3 md:h-9"
          >
            <FilePlus2 size={15} className="text-emerald-600 dark:text-emerald-400" />
            <span className="hidden text-xs font-bold sm:inline">فاتورة جديدة</span>
          </button>
        </div>

        {/* الوسط: شارة الحالة ومؤشر الإجمالي السريع */}
        <div className="hidden items-center gap-2 lg:flex">
          {isViewingPrevious ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-300/80 bg-amber-50/90 px-3 py-1.5 text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200">
              <Eye size={15} className="text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-bold">
                وضع معاينة: #{currentViewingInvoice?.invoice_number}
              </span>
              <span className="rounded bg-amber-200/60 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-900 dark:bg-amber-900/60 dark:text-amber-300">
                {currentViewingInvoice?.party_name ?? 'عميل نقدي'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-1.5 text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200">
              <FileSpreadsheet size={15} className="text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-bold">صافي الفاتورة:</span>
              <span className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totalAmount, currencyCode)}
              </span>
            </div>
          )}
        </div>

        {/* الجانب الأيسر: أزرار العمليات المباشرة للحفظ والطباعة */}
        {!isViewingPrevious && onSave && (
          <div className="flex items-center gap-1 sm:gap-2">
            {/* حفظ كمسودة */}
            <button
              type="button"
              onClick={() => {
                onSave('draft');
              }}
              disabled={isSaving || isSavingQuotation}
              title="حفظ محلي كمسودة دون ترحيل"
              className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:px-3 md:h-9"
            >
              <FileDown size={14} className="text-slate-500 dark:text-slate-400" />
              <span className="hidden sm:inline">مسودة</span>
            </button>

            {/* حفظ كعرض سعر */}
            {onSaveAsQuotation && (
              <button
                type="button"
                onClick={onSaveAsQuotation}
                disabled={isSaving || isSavingQuotation}
                title="حفظ الفاتورة الحالية كعرض سعر رسمي للعميل دون خصم المخزون"
                className="flex h-8 items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2 text-xs font-bold text-amber-800 shadow-sm transition-all hover:border-amber-400 hover:bg-amber-100 hover:text-amber-900 active:scale-95 disabled:opacity-40 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/50 sm:gap-1.5 sm:px-3 md:h-9"
              >
                {isSavingQuotation ? (
                  <Loader2 size={14} className="animate-spin text-amber-600 dark:text-amber-400" />
                ) : (
                  <FileText size={14} className="text-amber-600 dark:text-amber-400" />
                )}
                <span className="hidden xs:inline">عرض سعر</span>
              </button>
            )}

            {/* طباعة الفاتورة */}
            {onPrint && (
              <button
                type="button"
                onClick={onPrint}
                disabled={isSaving || isSavingQuotation}
                title="طباعة ومعاينة الفاتورة"
                className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700 shadow-sm transition-all hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:px-3 md:h-9"
              >
                <Printer size={14} className="text-indigo-600 dark:text-indigo-400" />
                <span className="hidden sm:inline">طباعة</span>
              </button>
            )}

            {/* حفظ وترحيل الفاتورة البارز */}
            <button
              type="button"
              onClick={() => {
                onSave('posted');
              }}
              disabled={isSaving || isSavingQuotation}
              title="اعتماد وترحيل الفاتورة رسمياً"
              className="flex h-8 items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3 text-xs font-black text-white shadow-md transition-all hover:from-emerald-700 hover:to-teal-700 hover:shadow-lg active:scale-95 disabled:opacity-50 sm:gap-2 sm:px-4 md:h-9"
            >
              {isSaving ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} className="text-white" />
              )}
              <span>حفظ وترحيل</span>
            </button>
          </div>
        )}

      </div>
    </footer>
  );
};

export default InvoiceNavigatorBar;
