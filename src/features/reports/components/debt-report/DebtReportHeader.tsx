import React from 'react';
import { Building2, Download, FileSpreadsheet, MessageCircle, Printer } from 'lucide-react';
import { formatLocalDate } from '../../../../core/utils';

interface DebtReportHeaderProps {
  companyName: string;
  activeCurrencies: string[];
  hasRows: boolean;
  isExportingExcel: boolean;
  isExportingPdf: boolean;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onOpenWhatsApp: () => void;
  onPrint: () => void;
}

export const DebtReportHeader: React.FC<DebtReportHeaderProps> = ({
  companyName,
  activeCurrencies,
  hasRows,
  isExportingExcel,
  isExportingPdf,
  onExportExcel,
  onExportPdf,
  onOpenWhatsApp,
  onPrint,
}) => (
  <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-l from-slate-900 via-slate-900 to-blue-950 p-5 text-white shadow-md dark:border-slate-800">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div className="flex items-start gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-blue-300 shadow-inner">
          <Building2 size={24} />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-blue-400/30 bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-black text-blue-200">
              {companyName}
            </span>
            <span className="font-mono text-[11px] font-bold text-slate-300">
              {formatLocalDate(new Date())}
            </span>
          </div>
          <h2 className="mt-1.5 text-lg font-black tracking-tight text-white sm:text-xl">
            تقرير الديون والمركز المالي
          </h2>
          <p className="mt-0.5 text-xs font-medium text-slate-300">
            كشف شامل لمستحقات العملاء والتزامات الموردين بأعمدة منفصلة لكل عملة (
            {activeCurrencies.join(' • ')})
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onExportExcel}
          disabled={isExportingExcel || !hasRows}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-black text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileSpreadsheet size={15} />
          <span>{isExportingExcel ? 'جاري التصدير...' : 'تصدير Excel'}</span>
        </button>

        <button
          type="button"
          onClick={onExportPdf}
          disabled={isExportingPdf || !hasRows}
          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2.5 text-xs font-black text-white shadow-sm transition-all hover:bg-rose-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={15} />
          <span>{isExportingPdf ? 'جاري إنشاء PDF...' : 'تصدير PDF'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenWhatsApp}
          disabled={!hasRows}
          className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3.5 py-2.5 text-xs font-black text-white shadow-sm transition-all hover:bg-green-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MessageCircle size={15} />
          <span>إرسال (واتساب / PDF)</span>
        </button>

        <button
          type="button"
          onClick={onPrint}
          disabled={!hasRows}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs font-black text-white transition-all hover:bg-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Printer size={15} />
          <span>طباعة</span>
        </button>
      </div>
    </div>
  </div>
);
