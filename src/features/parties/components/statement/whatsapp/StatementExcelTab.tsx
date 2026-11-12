import React from 'react';
import { Download, Share2, FileSpreadsheet } from 'lucide-react';

interface StatementExcelTabProps {
  isExportingExcel: boolean;
  onShareExcel: () => void;
  onDownloadExcel: () => void;
}

export const StatementExcelTab: React.FC<StatementExcelTabProps> = ({
  isExportingExcel,
  onShareExcel,
  onDownloadExcel,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-6 text-center dark:border-emerald-800/50 dark:bg-emerald-950/20">
        <div className="rounded-2xl bg-emerald-600 p-4 text-white shadow-lg shadow-emerald-600/20">
          <FileSpreadsheet size={36} />
        </div>
        <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">
          ملف إكسل تفصيلي عصري متعدد العملات (.xlsx)
        </h3>
        <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
          ملف إكسل مهيأ بحدود شبكية بارزة بين الخلايا والأعمدة، وتنسيق ألوان رسمي، مع
          أوراق عمل مستقلة لكل من <strong>الريال السعودي (SAR)</strong> و{' '}
          <strong>الريال اليمني (YER)</strong> لمنع أي تضارب محاسبي.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onShareExcel}
            disabled={isExportingExcel}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-emerald-700 disabled:opacity-50"
          >
            <Share2 size={16} />
            {isExportingExcel ? 'جاري تجهيز الملف...' : 'مشاركة ملف Excel عبر واتساب'}
          </button>

          <button
            type="button"
            onClick={onDownloadExcel}
            disabled={isExportingExcel}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download size={15} />
            تنزيل ملف Excel فقط
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-slate-50 p-4 text-xs text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
        <span className="font-bold text-emerald-600 dark:text-emerald-400">
          💡 للمستخدمين على الكمبيوتر (WhatsApp Web):
        </span>
        <p className="mt-1 leading-relaxed text-[11px] text-slate-500 dark:text-slate-400">
          عند النقر على زر المشاركة، سيتم تنزيل ملف الإكسل الملون فوراً ونسخ نص الرسالة وفتح محادثة واتساب الخاصة بالعميل. يكفيك سحب الملف المُنزل وإفلاته في نافذة المحادثة لإرساله مباشرة!
        </p>
      </div>
    </div>
  );
};

