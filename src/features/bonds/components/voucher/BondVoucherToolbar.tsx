import React from 'react';
import {
  FileText,
  Printer,
  MessageCircle,
  Download,
  X,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { cn } from '../../../../core/utils';
import type { BondVoucherDerived } from './bondVoucherHelpers';

interface BondVoucherToolbarProps {
  paymentNumber: string;
  meta: BondVoucherDerived;
  isExportingPdf: boolean;
  isFullscreen: boolean;
  onPrint: () => void;
  onExportPdf: () => void;
  onWhatsApp: () => void;
  onExportExcel: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

export const BondVoucherToolbar: React.FC<BondVoucherToolbarProps> = ({
  paymentNumber,
  meta,
  isExportingPdf,
  isFullscreen,
  onPrint,
  onExportPdf,
  onWhatsApp,
  onExportExcel,
  onToggleFullscreen,
  onClose,
}) => (
  <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/60 sm:px-5 sm:py-3.5">
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-black shadow-sm sm:h-10 sm:w-10',
          meta.isReceipt
            ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
            : meta.isPayment
              ? 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'
              : 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
        )}
      >
        <FileText size={16} className="sm:hidden" />
        <FileText size={20} className="hidden sm:block" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <h3 className="truncate text-xs font-black text-slate-900 dark:text-white sm:text-sm">
            معاينة السند الرسمي ({paymentNumber})
          </h3>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black',
              meta.isReceipt
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : meta.isPayment
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            )}
          >
            {meta.voucherTitle}
          </span>
        </div>
        <p className="hidden text-[11px] text-slate-400 sm:block">
          شاشة معاينة وطباعة السندات الرسمية المعتمدة
        </p>
      </div>
    </div>

    <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
      <button
        type="button"
        onClick={onPrint}
        className="flex items-center gap-1 rounded-xl bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition-all hover:bg-indigo-700 sm:px-3.5 sm:text-xs"
        title="طباعة السند"
      >
        <Printer size={14} />
        <span className="hidden sm:inline">طباعة</span>
      </button>
      <button
        type="button"
        onClick={onExportPdf}
        disabled={isExportingPdf}
        className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 shadow-sm transition-all hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400 sm:px-3 sm:text-xs"
        title="تصدير السند بصيغة PDF"
      >
        <FileText size={14} />
        <span className="hidden sm:inline">
          {isExportingPdf ? 'جارٍ التصدير...' : 'تصدير PDF'}
        </span>
      </button>
      <button
        type="button"
        onClick={onWhatsApp}
        className="flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 shadow-sm transition-all hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400 sm:px-3 sm:text-xs"
        title="مشاركة عبر واتساب"
      >
        <MessageCircle size={14} />
        <span className="hidden sm:inline">واتساب</span>
      </button>
      <button
        type="button"
        onClick={onExportExcel}
        className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:px-3 sm:text-xs"
        title="تصدير إكسل"
      >
        <Download size={14} />
        <span className="hidden sm:inline">إكسل</span>
      </button>
      <button
        type="button"
        onClick={onToggleFullscreen}
        className="hidden rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 md:inline-flex"
        title={isFullscreen ? 'تصغير النافذة' : 'ملء الشاشة'}
        aria-label={isFullscreen ? 'تصغير النافذة' : 'ملء الشاشة'}
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:p-2"
        title="إغلاق"
        aria-label="إغلاق"
      >
        <X size={18} />
      </button>
    </div>
  </div>
);
