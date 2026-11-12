import React from 'react';
import { Check, Copy, Download, Send } from 'lucide-react';
import { formatLocalDate } from '../../../../../core/utils/dateUtils';
import type { CompanyInfo } from '../../../utils/statementExcelExporter';
import type { StatementMovement } from '../../../service';
import type { Party } from '../../../types';
import type { CurrencySummary } from './useStatementWhatsApp';

interface StatementImageTabProps {
  gridImageRef: React.RefObject<HTMLDivElement | null>;
  party: Party;
  company: CompanyInfo;
  companyNameAr: string;
  dateRangeText: string;
  bankInfoText: string | undefined;
  sarMovements: StatementMovement[];
  yerMovements: StatementMovement[];
  sarSummary: CurrencySummary | undefined;
  yerSummary: CurrencySummary | undefined;
  isCapturingImage: boolean;
  isSendingDirect: boolean;
  isValidPhone: boolean;
  copiedType: 'text' | 'image' | null;
  onSendGridImageDirect: () => void;
  onCopyGridImage: () => void;
  onDownloadGridImage: () => void;
}

export const StatementImageTab: React.FC<StatementImageTabProps> = ({
  gridImageRef,
  party,
  company,
  companyNameAr,
  dateRangeText,
  bankInfoText,
  sarMovements,
  yerMovements,
  sarSummary,
  yerSummary,
  isCapturingImage,
  isSendingDirect,
  isValidPhone,
  copiedType,
  onSendGridImageDirect,
  onCopyGridImage,
  onDownloadGridImage,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-blue-50 px-4 py-2.5 text-xs font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
        <span>
          📸 يمكنك نسخ صورة الجريد ولصقها مباشرة في واتساب ويب (Ctrl+V) كصورة ملونة عالية الجودة!
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSendGridImageDirect}
            disabled={isCapturingImage || isSendingDirect || !isValidPhone}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            title="إرسال صورة الجريد الملون مباشرة لواتساب العميل من رقم المنشأة"
          >
            <Send size={13} className={isSendingDirect ? 'animate-spin' : ''} />
            {isSendingDirect ? 'جاري الإرسال...' : 'إرسال الصورة للعميل'}
          </button>
          <button
            type="button"
            onClick={onCopyGridImage}
            disabled={isCapturingImage}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {copiedType === 'image' ? <Check size={14} /> : <Copy size={14} />}
            {copiedType === 'image' ? 'تم النسخ!' : 'نسخ الصورة للحافظة'}
          </button>
          <button
            type="button"
            onClick={onDownloadGridImage}
            disabled={isCapturingImage}
            className="flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-800 dark:text-blue-300"
          >
            <Download size={14} />
            تحميل PNG
          </button>
        </div>
      </div>

      {/* Rendered Visual Excel Grid Card */}
      <div className="overflow-x-auto rounded-xl border border-slate-300 bg-slate-100 p-3 shadow-inner dark:border-slate-700 dark:bg-slate-900">
        <div
          ref={gridImageRef}
          className="mx-auto min-w-[680px] max-w-[800px] rounded-lg border border-slate-300 bg-white p-6 shadow-sm text-slate-800 font-sans"
          dir="rtl"
        >
          {/* Brand Header */}
          <div className="border-b-2 border-[#1E3A8A] pb-3 text-center">
            <h1 className="text-lg font-bold text-[#1E3A8A]">{companyNameAr}</h1>
            <h2 className="text-xs font-bold text-blue-600">
              كشف حساب مالي تفصيلي متعدد العملات (Excel Grid)
            </h2>
            <p className="mt-1 text-[10px] text-slate-500">
              {company.address ? `العنوان: ${company.address} | ` : ''}
              {company.phone ? `هاتف: ${company.phone} | ` : ''}
              {company.tax_number ? `الرقم الضريبي: ${company.tax_number}` : ''}
            </p>
          </div>

          {/* Client Info Grid */}
          <div className="my-3 grid grid-cols-3 gap-2 rounded border border-slate-300 bg-slate-50 p-2 text-xs">
            <div>
              <span className="font-bold text-slate-500">الطرف:</span>{' '}
              <span className="font-bold text-slate-900">{party.name}</span>
            </div>
            <div>
              <span className="font-bold text-slate-500">الفترة:</span>{' '}
              <span className="font-medium text-slate-800">{dateRangeText}</span>
            </div>
            <div>
              <span className="font-bold text-slate-500">تاريخ التقرير:</span>{' '}
              <span className="font-mono text-slate-800">{formatLocalDate()}</span>
            </div>
          </div>

          {/* SAR Table Grid (if has SAR movements) */}
          {sarMovements.length > 0 && (
            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between rounded-t bg-[#1E3A8A] px-3 py-1.5 text-white">
                <span className="text-xs font-bold">🇸🇦 حركات الريال السعودي (SAR)</span>
                <span className="text-[10px] font-mono">
                  صافي الرصيد: {(sarSummary?.finalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR
                </span>
              </div>
              <table className="w-full border-collapse border border-slate-400 text-center text-[11px]">
                <thead>
                  <tr className="bg-slate-200 font-bold text-slate-900">
                    <th className="border border-slate-400 p-1 w-8">م</th>
                    <th className="border border-slate-400 p-1 w-20">التاريخ</th>
                    <th className="border border-slate-400 p-1 w-20">المرجع</th>
                    <th className="border border-slate-400 p-1">البيان</th>
                    <th className="border border-slate-400 p-1 w-20">مدين (+)</th>
                    <th className="border border-slate-400 p-1 w-20">دائن (-)</th>
                    <th className="border border-slate-400 p-1 w-24">الرصيد (SAR)</th>
                  </tr>
                </thead>
                <tbody>
                  {sarMovements.slice(-8).map((m, idx) => (
                    <tr key={m.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="border border-slate-300 p-1">{idx + 1}</td>
                      <td className="border border-slate-300 p-1 font-mono text-[10px]">{m.date}</td>
                      <td className="border border-slate-300 p-1 font-mono text-blue-700">{m.ref}</td>
                      <td className="border border-slate-300 p-1 text-right">{m.desc}</td>
                      <td className="border border-slate-300 p-1 font-mono text-emerald-700 font-bold">
                        {m.debit > 0 ? m.debit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                      </td>
                      <td className="border border-slate-300 p-1 font-mono text-rose-700 font-bold">
                        {m.credit > 0 ? m.credit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                      </td>
                      <td className="border border-slate-300 p-1 font-mono bg-blue-50 font-bold text-[#1E3A8A]">
                        {(m.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-200 font-bold text-slate-900 border-t-2 border-slate-600">
                    <td colSpan={4} className="border border-slate-400 p-1.5 text-right font-bold">
                      إجمالي الريال السعودي (SAR)
                    </td>
                    <td className="border border-slate-400 p-1.5 font-mono text-emerald-800">
                      {(sarSummary?.totalDebit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="border border-slate-400 p-1.5 font-mono text-rose-800">
                      {(sarSummary?.totalCredit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="border border-slate-400 p-1.5 font-mono bg-blue-100 text-blue-900 text-xs">
                      {(sarSummary?.finalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* YER Table Grid (if has YER movements) */}
          {yerMovements.length > 0 && (
            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between rounded-t bg-[#065F46] px-3 py-1.5 text-white">
                <span className="text-xs font-bold">🇾🇪 حركات الريال اليمني (YER)</span>
                <span className="text-[10px] font-mono">
                  صافي الرصيد: {(yerSummary?.finalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} YER
                </span>
              </div>
              <table className="w-full border-collapse border border-slate-400 text-center text-[11px]">
                <thead>
                  <tr className="bg-slate-200 font-bold text-slate-900">
                    <th className="border border-slate-400 p-1 w-8">م</th>
                    <th className="border border-slate-400 p-1 w-20">التاريخ</th>
                    <th className="border border-slate-400 p-1 w-20">المرجع</th>
                    <th className="border border-slate-400 p-1">البيان</th>
                    <th className="border border-slate-400 p-1 w-20">مدين (+)</th>
                    <th className="border border-slate-400 p-1 w-20">دائن (-)</th>
                    <th className="border border-slate-400 p-1 w-24">الرصيد (YER)</th>
                  </tr>
                </thead>
                <tbody>
                  {yerMovements.slice(-8).map((m, idx) => (
                    <tr key={m.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="border border-slate-300 p-1">{idx + 1}</td>
                      <td className="border border-slate-300 p-1 font-mono text-[10px]">{m.date}</td>
                      <td className="border border-slate-300 p-1 font-mono text-emerald-800">{m.ref}</td>
                      <td className="border border-slate-300 p-1 text-right">{m.desc}</td>
                      <td className="border border-slate-300 p-1 font-mono text-emerald-700 font-bold">
                        {m.debit > 0 ? m.debit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                      </td>
                      <td className="border border-slate-300 p-1 font-mono text-rose-700 font-bold">
                        {m.credit > 0 ? m.credit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                      </td>
                      <td className="border border-slate-300 p-1 font-mono bg-emerald-50 font-bold text-[#065F46]">
                        {(m.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-200 font-bold text-slate-900 border-t-2 border-slate-600">
                    <td colSpan={4} className="border border-slate-400 p-1.5 text-right font-bold">
                      إجمالي الريال اليمني (YER)
                    </td>
                    <td className="border border-slate-400 p-1.5 font-mono text-emerald-800">
                      {(yerSummary?.totalDebit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="border border-slate-400 p-1.5 font-mono text-rose-800">
                      {(yerSummary?.totalCredit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="border border-slate-400 p-1.5 font-mono bg-emerald-100 text-emerald-900 text-xs">
                      {(yerSummary?.finalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Bank info footer */}
          {bankInfoText && (
            <div className="mt-3 rounded border border-slate-300 bg-slate-50 p-2 text-center text-[10px] text-slate-600">
              💳 {bankInfoText}
            </div>
          )}
          <div className="mt-2 text-center text-[10px] text-slate-400">
            تم استخراج هذا الكشف آلياً من منظومة الجعفري لإدارة المبيعات والمحاسبة.
          </div>
        </div>
      </div>
    </div>
  );
};

