import React from 'react';
import { CustomizableTableWrapper } from '@/ui/table-settings/TableSettingsButton';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Eye,
  MessageCircle,
  Printer,
  Trash2,
} from 'lucide-react';
import type { Bond } from '../../types';
import type { BondsPageTotals } from '../../hooks/useBondActions';
import { cn, formatCurrency } from '../../../../core/utils';
import { EntityInfoDot } from '../../../entity-inspector';

interface BondsTableViewProps {
  bonds: Bond[];
  pageTotals: BondsPageTotals;
  onPreviewBond?: ((bond: Bond) => void) | undefined;
  onWhatsAppShare: (bond: Bond) => void;
  onExport: (bond: Bond) => void;
  onDelete: (id: string, number: string) => void;
}

const getPaymentMethodLabel = (method?: string | null) =>
  method === 'cash' ? 'نقداً' : method === 'bank' ? 'بنك' : method || 'نقداً';

export const BondsTableView: React.FC<BondsTableViewProps> = ({
  bonds,
  pageTotals,
  onPreviewBond,
  onWhatsAppShare,
  onExport,
  onDelete,
}) => (
  <CustomizableTableWrapper tableId="bonds.list" tableTitle="جدول السندات">
  <div data-clear-black-text="true" className="w-full space-y-3">
    <div className="table-scroll-viewport custom-scrollbar overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--app-surface)] shadow-sm dark:border-slate-800">
      <table className="w-full min-w-[760px] border-collapse border border-slate-200 text-right dark:border-slate-800">
        <thead>
          <tr className="sticky top-0 z-10 border-b border-slate-200 bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <th className="w-12 border border-slate-200 px-3 py-3 text-center dark:border-slate-800">
              #
            </th>
            <th className="border border-slate-200 px-4 py-3 font-bold dark:border-slate-800">
              التاريخ
            </th>
            <th className="border border-slate-200 px-4 py-3 font-bold dark:border-slate-800">
              رقم السند والنوع
            </th>
            <th className="border border-slate-200 px-4 py-3 font-bold dark:border-slate-800">
              الجهة / الحساب المقابل
            </th>
            <th className="border border-slate-200 px-4 py-3 font-bold dark:border-slate-800">
              حساب الصندوق / البنك
            </th>
            <th className="border border-slate-200 px-4 py-3 font-bold dark:border-slate-800">
              البيان
            </th>
            <th className="border border-slate-200 px-3 py-3 text-center font-bold dark:border-slate-800">
              طريقة الدفع
            </th>
            <th className="border border-slate-200 px-4 py-3 text-left font-bold dark:border-slate-800">
              المبلغ
            </th>
            <th className="border border-slate-200 px-4 py-3 text-center font-bold dark:border-slate-800">
              الإجراءات
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {bonds.map((bond, idx) => (
            <tr
              key={bond.id}
              className="group cursor-pointer transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/10"
              onClick={() => onPreviewBond?.(bond)}
            >
              <td className="border border-slate-200/80 px-3 py-3 text-center font-mono text-[11px] text-gray-400 dark:border-slate-800/80">
                {idx + 1}
              </td>
              <td className="border border-slate-200/80 px-4 py-3 font-mono text-[11px] font-medium text-gray-500 dark:border-slate-800/80 dark:text-slate-400">
                {bond.date}
              </td>
              <td className="border border-slate-200/80 px-4 py-3 dark:border-slate-800/80">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'rounded-md p-1',
                      bond.type === 'receipt'
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20'
                        : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20'
                    )}
                  >
                    {bond.type === 'receipt' ? (
                      <ArrowDownCircle size={14} />
                    ) : (
                      <ArrowUpCircle size={14} />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-gray-900 dark:text-slate-100">
                        {bond.payment_number}
                      </span>
                      <EntityInfoDot
                        type="bond"
                        id={bond.id}
                        label={bond.payment_number}
                        size="xs"
                      />
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {bond.type === 'receipt'
                        ? 'قبض'
                        : bond.type === 'payment'
                          ? 'صرف'
                          : 'تحويل'}
                    </span>
                  </div>
                </div>
              </td>
              <td className="border border-slate-200/80 px-4 py-3 dark:border-slate-800/80">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-800 dark:text-slate-200">
                    {bond.party_name || bond.account_name}
                  </span>
                  {bond.party_name && bond.account_name !== bond.party_name && (
                    <span className="text-[10px] text-gray-400">{bond.account_name}</span>
                  )}
                </div>
              </td>
              <td className="border border-slate-200/80 px-4 py-3 dark:border-slate-800/80">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {bond.account_name}
                </span>
              </td>
              <td
                className="max-w-[220px] truncate border border-slate-200/80 px-4 py-3 text-xs text-gray-600 dark:border-slate-800/80 dark:text-slate-400"
                title={bond.description}
              >
                {bond.description || '---'}
              </td>
              <td className="border border-slate-200/80 px-3 py-3 text-center dark:border-slate-800/80">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {getPaymentMethodLabel(bond.payment_method)}
                </span>
              </td>
              <td className="border border-slate-200/80 px-4 py-3 font-mono dark:border-slate-800/80">
                <div className="flex flex-col items-start sm:items-end">
                  <span
                    className={cn(
                      'text-xs font-black',
                      bond.type === 'receipt' ? 'text-emerald-600' : 'text-rose-600'
                    )}
                  >
                    {bond.type === 'receipt' ? '+' : '-'}
                    {formatCurrency(bond.amount, bond.currency_code)}
                  </span>
                  {bond.currency_code !== 'SAR' && bond.base_amount !== undefined && (
                    <span className="text-[10px] font-bold text-blue-500">
                      {formatCurrency(bond.base_amount, 'SAR')}
                    </span>
                  )}
                </div>
              </td>
              <td
                className="border border-slate-200/80 px-4 py-3 text-center dark:border-slate-800/80"
                onClick={e => {
                  e.stopPropagation();
                }}
              >
                <div className="flex items-center justify-center gap-1 opacity-80 transition-all group-hover:opacity-100">
                  {onPreviewBond && (
                    <button
                      onClick={() => {
                        onPreviewBond(bond);
                      }}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30"
                      title="معاينة السند الرسمي"
                    >
                      <Eye size={15} />
                    </button>
                  )}
                  <button
                    onClick={() => onWhatsAppShare(bond)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/30"
                    title="إرسال عبر واتساب"
                  >
                    <MessageCircle size={15} />
                  </button>
                  <button
                    onClick={() => onExport(bond)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/30"
                    title="تصدير إكسل / طباعة"
                  >
                    <Printer size={15} />
                  </button>
                  <button
                    onClick={() => {
                      onDelete(bond.id, bond.payment_number);
                    }}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30"
                    title="حذف السند"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50/80 text-xs font-bold dark:border-slate-800 dark:bg-slate-900/80">
            <td
              colSpan={3}
              className="border border-slate-200 px-4 py-3 font-mono text-slate-500 dark:border-slate-800"
            >
              إجمالي الصفحة ({pageTotals.count} سند)
            </td>
            <td
              colSpan={4}
              className="border border-slate-200 px-4 py-3 text-slate-600 dark:border-slate-800 dark:text-slate-300"
            >
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="text-emerald-600">
                  قبض: {formatCurrency(pageTotals.receipts, 'SAR')}
                </span>
                <span className="text-rose-600">
                  صرف: {formatCurrency(pageTotals.payments, 'SAR')}
                </span>
                {pageTotals.transfers > 0 && (
                  <span className="text-blue-600">
                    تحويلات: {formatCurrency(pageTotals.transfers, 'SAR')}
                  </span>
                )}
              </div>
            </td>
            <td className="border border-slate-200 px-4 py-3 text-left font-mono dark:border-slate-800">
              <span
                className={cn(
                  'text-xs font-black',
                  pageTotals.net >= 0 ? 'text-emerald-600' : 'text-rose-600'
                )}
              >
                الصافي: {formatCurrency(pageTotals.net, 'SAR')}
              </span>
            </td>
            <td className="border border-slate-200 dark:border-slate-800"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
  </CustomizableTableWrapper>
);
