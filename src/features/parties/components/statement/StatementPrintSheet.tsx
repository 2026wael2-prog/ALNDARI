/* eslint-disable max-lines-per-function, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
import React from 'react';
import type { PartyType } from '../../types';
import { useDocumentHeaderSettings } from '@/features/settings/settingsStore';
import { UniversalDocumentHeader } from '@/ui/common/UniversalDocumentHeader';
import { formatLocalDate } from '@/core/utils/dateUtils';

interface CompanyInfo {
  nameAr: string;
  nameEn: string;
  address: string;
  phone: string;
  taxNumber: string;
  specialization: string;
  headerText: string;
}

interface StatementPrintSheetProps {
  company: CompanyInfo;
  partyType: PartyType;
  partyName?: string | undefined;
  printSubtitle?: string | undefined;
}

export const StatementPrintSheet: React.FC<StatementPrintSheetProps> = ({
  company,
  partyType,
  partyName,
  printSubtitle,
}) => {
  const headerConfig = useDocumentHeaderSettings();
  const currentDate = formatLocalDate();

  return (
    <>
      <style>{`
        @media print {
            body { background-color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
            .print-only { display: block !important; }
            @page { margin: 8mm 10mm; size: A4 portrait; }
            .print-area {
                font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
                color: #000 !important;
                font-variant-numeric: tabular-nums;
            }
            /* Make ExcelTable look like a real printed Excel grid */
            table {
                border-collapse: collapse !important;
                width: 100% !important;
            }
            th, td {
                border: 1px solid #cbd5e1 !important;
                padding: 6px 8px !important;
                color: #000 !important;
            }
            th {
                background-color: #1F4E78 !important;
                color: #fff !important;
                font-weight: 800 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            /* Colored rows preserved during print */
            tr.row-colored-emerald td { background-color: #d1fae5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            tr.row-colored-rose td { background-color: #ffe4e6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            tr.row-colored-amber td { background-color: #fef3c7 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            tr.row-colored-blue td { background-color: #e0f2fe !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            /* Hide the toolbar of ExcelTable in print */
            .table-toolbar { display: none !important; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Professional Commercial Header */}
      <div className="screen:max-md:mb-3 screen:max-md:pb-2 screen:max-md:p-3 mb-5 rounded-xl border-b-2 border-[#1F4E78] bg-[var(--app-surface)] p-5 pb-4 shadow-sm dark:border-blue-700 print:mb-4 print:border-none print:bg-white print:p-0 print:shadow-none">
        <div className="mb-4">
          <UniversalDocumentHeader
            config={headerConfig}
            company={{
              name: company.nameAr,
              name_en: company.nameEn,
              phone: company.phone || undefined,
              address: company.address || undefined,
              tax_number: company.taxNumber || undefined,
              slogan: company.specialization || undefined,
            }}
            documentTitle={printSubtitle || 'كشف حساب رسمي معتمد'}
            documentDate={currentDate}
          />
        </div>
        <div className="flex justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/80 print:border-slate-400 print:bg-slate-50 print:text-black">
          <div className="text-sm text-slate-800 dark:text-slate-200 print:text-black">
            <strong>اسم {partyType === 'customer' ? 'العميل' : 'المورد'}:</strong>{' '}
            <span className="font-bold">{partyName || '—'}</span>
          </div>
          <div className="text-sm text-slate-800 dark:text-slate-200 print:text-black">
            <strong>تاريخ الاستخراج:</strong> <span dir="ltr" className="font-mono font-bold">{currentDate}</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default StatementPrintSheet;
