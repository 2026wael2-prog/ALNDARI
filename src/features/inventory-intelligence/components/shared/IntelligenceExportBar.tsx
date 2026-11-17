import React, { useRef, useState } from 'react';
import { FileSpreadsheet, FileText, Printer, Send } from 'lucide-react';
import { logger } from '../../../../core/utils/logger';
import Button from '../../../../ui/base/Button';
import { useFeedbackStore } from '../../../feedback/store';
import type { IntelligenceEngineOutput } from '../../types';
import { exportExecutiveStudyExcel } from '../../utils/intelligenceExcelExporter';
import { exportStudyElementToPdf, printStudyElement } from '../../utils/intelligencePdfAndPrint';
import { IntelligenceStudyPrintTemplate } from '../reports/IntelligenceStudyPrintTemplate';
import { IntelligenceShareModal } from '../modals/IntelligenceShareModal';

interface IntelligenceExportBarProps {
  output: IntelligenceEngineOutput;
}

export const IntelligenceExportBar: React.FC<IntelligenceExportBarProps> = ({ output }) => {
  const { showToast } = useFeedbackStore();
  const printRef = useRef<HTMLDivElement>(null);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const handleExcel = async () => {
    try {
      setIsExportingExcel(true);
      await exportExecutiveStudyExcel(output);
      showToast('تم تحميل الدراسة التنفيذية كملف Excel بنجاح', 'success');
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : JSON.stringify(err);
      logger.error('IntelligenceExportBar', `Excel export failed: ${msg}`);
      showToast('تعذر تصدير ملف Excel', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handlePdf = async () => {
    if (!printRef.current) return;
    try {
      setIsExportingPdf(true);
      await exportStudyElementToPdf(printRef.current);
      showToast('تم تحميل الدراسة كملف PDF بنجاح', 'success');
    } catch {
      showToast('تعذر تصدير ملف PDF', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    printStudyElement(printRef.current);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void handleExcel();
          }}
          isLoading={isExportingExcel}
          leftIcon={<FileSpreadsheet size={13} />}
        >
          دراسة Excel
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void handlePdf();
          }}
          isLoading={isExportingPdf}
          leftIcon={<FileText size={13} />}
        >
          دراسة PDF
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handlePrint}
          leftIcon={<Printer size={13} />}
        >
          طباعة
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            setShareOpen(true);
          }}
          leftIcon={<Send size={13} />}
        >
          تليجرام / واتساب
        </Button>
      </div>

      {/* Off-screen print/PDF template */}
      <div className="pointer-events-none fixed -left-[9999px] top-0 opacity-0" aria-hidden="true">
        <IntelligenceStudyPrintTemplate ref={printRef} output={output} />
      </div>

      <IntelligenceShareModal
        isOpen={shareOpen}
        onClose={() => {
          setShareOpen(false);
        }}
        output={output}
        studyElementRef={printRef}
      />
    </>
  );
};
