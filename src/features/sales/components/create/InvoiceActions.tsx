import React from 'react';
import Button from '../../../../ui/base/Button';
import { Save, Printer, FileDown, FileText } from 'lucide-react';
import type { InvoiceStatus } from '../../types';

interface Props {
  onSave: (status: InvoiceStatus) => void;
  onSaveAsQuotation?: (() => void) | undefined;
  isSavingQuotation?: boolean | undefined;
  onPrint: () => void;
  isSaving: boolean;
}

const InvoiceActions: React.FC<Props> = ({
  onSave,
  onSaveAsQuotation,
  isSavingQuotation = false,
  onPrint,
  isSaving,
}) => {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-1.5 p-1.5 sm:w-auto sm:gap-2 sm:p-2">
      <Button
        onClick={() => {
          onSave('draft');
        }}
        isLoading={isSaving}
        disabled={isSavingQuotation}
        variant="secondary"
        className="flex-1 rounded-xl text-xs sm:flex-none sm:text-sm"
        leftIcon={<FileDown size={14} />}
      >
        حفظ كمسودة
      </Button>

      {onSaveAsQuotation && (
        <Button
          onClick={onSaveAsQuotation}
          isLoading={isSavingQuotation}
          disabled={isSaving}
          variant="outline"
          className="flex-1 rounded-xl border-amber-300 bg-amber-50/70 text-xs font-bold text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50 sm:flex-none sm:text-sm"
          leftIcon={<FileText size={14} />}
        >
          عرض سعر
        </Button>
      )}

      <Button
        onClick={onPrint}
        disabled={isSaving || isSavingQuotation}
        variant="outline"
        className="flex-1 rounded-xl border-gray-200 text-xs text-gray-500 hover:text-indigo-600 sm:flex-none sm:text-sm"
        leftIcon={<Printer size={14} />}
      >
        طباعة
      </Button>

      <Button
        onClick={() => {
          onSave('posted');
        }}
        isLoading={isSaving}
        disabled={isSavingQuotation}
        variant="primary"
        className="w-full rounded-xl text-xs sm:w-auto sm:min-w-[160px] sm:text-sm"
        leftIcon={<Save size={14} />}
      >
        حفظ وترحيل
      </Button>
    </div>
  );
};

export default InvoiceActions;
