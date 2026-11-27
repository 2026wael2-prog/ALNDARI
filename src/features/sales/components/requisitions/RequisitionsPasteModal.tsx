/* eslint-disable max-lines-per-function */
import React, { useEffect, useRef, useState } from 'react';
import { Clipboard, Check, X, AlertTriangle, CopyCheck } from 'lucide-react';
import { useRequisitionsStore } from '../../store/requisitionsStore';
import type { RequisitionImportResult } from '../../types/requisitions';

interface RequisitionsPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RequisitionsPasteModal: React.FC<RequisitionsPasteModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [pasteContent, setPasteContent] = useState('');
  const [result, setResult] = useState<RequisitionImportResult | null>(null);
  const importFromText = useRequisitionsStore(state => state.importFromText);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleClose = () => {
    clearTimer();
    setResult(null);
    setPasteContent('');
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleImport = (): void => {
    clearTimer();
    const importResult = importFromText(pasteContent);
    setResult(importResult);
    // Only auto-close when the import was 100% clean so warnings stay readable!
    if (importResult.imported > 0 && importResult.duplicates === 0 && importResult.invalid === 0) {
      closeTimerRef.current = setTimeout(() => {
        handleClose();
      }, 900);
    }
  };

  return (
    <div
      className="backdrop-blur-xs fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4"
      onMouseDown={e => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-xl sm:p-5"
        dir="rtl"
      >
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
          <div className="flex items-center gap-2 text-black dark:text-slate-100">
            <Clipboard size={18} className="text-blue-600" />
            <h3 className="text-sm font-extrabold">لصق سريع من ملف إكسل</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mb-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
          انسخ الخلايا من جدول إكسل (اسم القطعة، رقم القطعة، الشركة، الكمية، ملاحظات) والصقها هنا
          مباشرة:
        </p>

        <textarea
          rows={6}
          value={pasteContent}
          onChange={e => {
            setPasteContent(e.target.value);
          }}
          placeholder={`مثال:\nفحمات سيراميك\t04465-33470\tتويوتا\t4\tأصلية ياباني\nشمعات إشعال\tSK20HR11\tدنسو\t8\tمطلوب كرتون`}
          className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-xs font-bold text-black outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          dir="ltr"
        />

        {result !== null && (
          <div className="mt-2.5 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <Check size={14} />
              <span>تم استيراد {result.imported} صنف بنجاح.</span>
            </div>
            {result.duplicates > 0 && (
              <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <CopyCheck size={14} />
                <span>تم تجاهل {result.duplicates} سطر مكرر موجود مسبقاً في الجدول.</span>
              </div>
            )}
            {result.invalid > 0 && (
              <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle size={14} />
                <span>
                  {result.invalid} سطر بكمية غير صحيحة — استُورد بكمية 0 وبانتظار تصحيحك (لن
                  يُحفظ الطلب قبل التصحيح).
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-extrabold text-black hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {result !== null ? 'إغلاق ومتابعة' : 'إلغاء'}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!pasteContent.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
          >
            <Clipboard size={14} />
            <span>استيراد إلى الجدول</span>
          </button>
        </div>
      </div>
    </div>
  );
};
