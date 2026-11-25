import React from 'react';
import { RotateCcw, Save, X } from 'lucide-react';
import {
  hasNonEmptyText,
  usePrintTemplateDraftController,
} from './editor/usePrintTemplateDraftController';
import {
  PrintFooterFieldsSection,
  PrintIdentityFieldsSection,
  PrintTemplateScopeBar,
} from './editor/PrintTemplateEditorSections';

interface PrintTemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * نافذة تعديل وتخصيص القالب الرسمي الموحد للطباعة (عام أو خاص بالفرع النشط).
 */
export const PrintTemplateEditorModal: React.FC<PrintTemplateEditorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const ctrl = usePrintTemplateDraftController(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-xs sm:items-center sm:p-3"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-slate-300 bg-white p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] text-right text-slate-900 shadow-2xl sm:rounded-2xl sm:p-5"
        onClick={e => {
          e.stopPropagation();
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-200 pb-2.5 sm:mb-4 sm:pb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-900 sm:text-base">
              تعديل وتخصيص قالب الطباعة الموحد
            </h3>
            <p className="text-[11px] text-slate-500 sm:text-xs">
              يُطبّق التعديل فوراً على جميع الفواتير وكشوف الحساب والسندات ورسائل الواتساب والإكسل
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={18} />
          </button>
        </div>

        {hasNonEmptyText(ctrl.branchId) && (
          <PrintTemplateScopeBar
            branchName={ctrl.branchName}
            scope={ctrl.scope}
            onChangeScope={ctrl.setScope}
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PrintIdentityFieldsSection
            draft={ctrl.draft}
            showBranchLabel={hasNonEmptyText(ctrl.branchId) && ctrl.scope === 'branch'}
            onFieldChange={ctrl.setField}
            onLogoFile={ctrl.handleLogoFile}
          />
          <PrintFooterFieldsSection draft={ctrl.draft} onFieldChange={ctrl.setField} />
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={ctrl.handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw size={13} />
            <span>استعادة الافتراضي</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={ctrl.handleSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
            >
              <Save size={13} />
              <span>حفظ وتطبيق</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintTemplateEditorModal;
