import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Calendar, Clock, Edit, FileText, User } from 'lucide-react';
import { cn, formatNumberDisplay } from '../../../../core/utils';
import Avatar from '../../../../ui/base/Avatar';
import { resolveMovementDocumentAction } from './movements/movementDocumentUtils';
import type { ActiveMovementDocument } from './movements/MovementDocumentModals';
import type { ItemMovementRow } from '../../types';

interface AuditLogTableProps {
  log: ItemMovementRow[];
  onOpenDocument?: (doc: ActiveMovementDocument) => void;
  onEditInvoice?: (invoiceId: string) => void;
}

const AuditLogTable: React.FC<AuditLogTableProps> = ({ log, onOpenDocument, onEditInvoice }) => {
  return (
    <table className="w-full border-collapse select-all border border-slate-200 text-right dark:border-slate-800">
      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-gray-50 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <tr>
          <th className="w-14 border border-slate-200 p-3 text-center text-[10px] font-black uppercase tracking-tighter text-gray-500 dark:border-slate-800">
            #
          </th>
          <th className="border border-slate-200 p-3 text-[11px] font-bold text-gray-600 dark:border-slate-800 dark:text-gray-300">
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-blue-500" />
              التاريخ والوقت
            </div>
          </th>
          <th className="border border-slate-200 p-3 text-[11px] font-bold text-gray-600 dark:border-slate-800 dark:text-gray-300">
            <div className="flex items-center gap-2">
              <Clock size={12} className="text-blue-500" />
              نوع العملية / المرجع
            </div>
          </th>
          <th className="border border-slate-200 p-3 text-[11px] font-bold text-gray-600 dark:border-slate-800 dark:text-gray-300">
            الجهة / المورد / العميل
          </th>
          <th className="w-24 border border-slate-200 p-3 text-center text-[11px] font-bold text-gray-600 dark:border-slate-800 dark:text-gray-300">
            الحالة
          </th>
          <th className="w-28 border border-slate-200 p-3 text-left text-[11px] font-bold text-gray-600 dark:border-slate-800 dark:text-gray-300">
            الكمية
          </th>
          <th className="w-28 border border-slate-200 p-3 text-left text-[11px] font-bold text-gray-600 dark:border-slate-800 dark:text-gray-300">
            السعر / التكلفة
          </th>
          <th className="w-28 border border-slate-200 p-3 text-left text-[11px] font-bold text-gray-600 dark:border-slate-800 dark:text-gray-300">
            الرصيد بعدها
          </th>
          <th className="w-36 border border-slate-200 p-3 text-[11px] font-bold text-gray-600 dark:border-slate-800 dark:text-gray-300">
            <div className="flex items-center gap-2">
              <User size={12} className="text-blue-500" />
              المستخدم
            </div>
          </th>
          <th className="w-24 border border-slate-200 p-3 text-center text-[11px] font-bold text-gray-600 dark:border-slate-800 dark:text-gray-300">
            إجراءات
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
        {log.map((entry, i) => {
          const isIncoming = entry.transaction_type === 'in';
          const docAction = resolveMovementDocumentAction({
            reference_id: entry.reference_id,
            doc_type: entry.doc_type,
            reference_type: entry.reference_type,
            original_type: entry.original_type,
            document_number: entry.document_number,
          });
          const unitPrice = Number(entry.unit_price || 0);
          const unitCost = Number(entry.unit_cost || 0);

          return (
            <tr
              key={entry.id || i}
              className="group transition-colors odd:bg-white even:bg-gray-50/30 hover:bg-blue-500/5 dark:odd:bg-slate-900 dark:even:bg-slate-800/20 dark:hover:bg-blue-500/10"
            >
              <td className="border border-slate-200/80 p-3 text-center font-mono text-xs font-bold text-gray-400 group-hover:text-blue-500 dark:border-slate-800/80">
                {log.length - i}
              </td>
              <td className="whitespace-nowrap border border-slate-200/80 p-3 text-[11px] text-gray-600 dark:border-slate-800/80 dark:text-gray-400">
                {new Date(entry.date).toLocaleString('en-GB', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })}
              </td>
              <td className="border border-slate-200/80 p-3 dark:border-slate-800/80">
                <div className="flex flex-col gap-1">
                  <span
                    className={cn(
                      'inline-block w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-black',
                      docAction.badgeClass
                    )}
                  >
                    {docAction.badgeLabel}
                  </span>
                  {docAction.canOpenDocument && onOpenDocument ? (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenDocument({
                          kind: docAction.kind,
                          referenceId: docAction.referenceId!,
                        })
                      }
                      className="w-fit text-right font-black text-blue-700 hover:underline dark:text-blue-400"
                      title="فتح أصل المستند"
                    >
                      {entry.document_number || 'عرض المستند'}
                    </button>
                  ) : (
                    <div className="font-black text-slate-800 dark:text-slate-100">
                      {entry.document_number || '—'}
                    </div>
                  )}
                </div>
              </td>
              <td className="border border-slate-200/80 p-3 text-[11px] font-black text-gray-700 dark:border-slate-800/80 dark:text-slate-200">
                {entry.source_name || '--'}
              </td>
              <td className="border border-slate-200/80 p-3 text-center dark:border-slate-800/80">
                <div
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-[10px] font-black uppercase tracking-tighter',
                    isIncoming
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
                      : 'border-rose-500/20 bg-rose-500/10 text-rose-600'
                  )}
                >
                  {isIncoming ? (
                    <ArrowDownLeft size={10} strokeWidth={3} />
                  ) : (
                    <ArrowUpRight size={10} strokeWidth={3} />
                  )}
                  {isIncoming ? 'وارد' : 'صادر'}
                </div>
              </td>
              <td
                dir="ltr"
                className={cn(
                  'border border-slate-200/80 p-3 text-left font-mono text-sm font-black dark:border-slate-800/80',
                  isIncoming ? 'text-emerald-600' : 'text-rose-600'
                )}
              >
                {isIncoming ? '+' : '-'}
                {formatNumberDisplay(Math.abs(entry.quantity))}
              </td>
              <td
                dir="ltr"
                className="border border-slate-200/80 p-3 text-left font-mono text-xs font-bold text-slate-600 dark:border-slate-800/80 dark:text-slate-300"
              >
                {unitPrice > 0
                  ? formatNumberDisplay(unitPrice)
                  : unitCost > 0
                    ? formatNumberDisplay(unitCost)
                    : '—'}
              </td>
              <td
                dir="ltr"
                className="border border-slate-200/80 bg-blue-500/5 p-3 text-left font-mono text-sm font-black text-gray-900 dark:border-slate-800/80 dark:bg-blue-500/10 dark:text-white"
              >
                {formatNumberDisplay(entry.balance_after ?? 0)}
              </td>
              <td className="border border-slate-200/80 p-3 dark:border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <Avatar name={entry.source_user || 'System'} size="xs" />
                  <div className="flex flex-col">
                    <span className="max-w-[100px] truncate text-[10px] font-black text-gray-700 dark:text-slate-200">
                      {entry.source_user?.split('@')[0] || 'النظام'}
                    </span>
                    <span className="text-[10px] font-bold uppercase text-gray-400">المسؤول</span>
                  </div>
                </div>
              </td>
              <td className="border border-slate-200/80 p-2 text-center dark:border-slate-800/80">
                <div className="flex items-center justify-center gap-1">
                  {docAction.canOpenDocument && onOpenDocument && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenDocument({
                          kind: docAction.kind,
                          referenceId: docAction.referenceId!,
                        })
                      }
                      className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50/70 p-1.5 text-blue-600 transition-colors hover:bg-blue-600 hover:text-white dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300"
                      title="الوصول لأصل الحركة (عرض المستند)"
                    >
                      <FileText size={13} />
                    </button>
                  )}
                  {docAction.canEditInvoice && onEditInvoice && (
                    <button
                      type="button"
                      onClick={() => onEditInvoice(docAction.referenceId!)}
                      className="inline-flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50/80 p-1.5 text-amber-700 transition-colors hover:bg-amber-600 hover:text-white dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
                      title="تعديل الفاتورة"
                    >
                      <Edit size={13} />
                    </button>
                  )}
                  {!docAction.canOpenDocument && !docAction.canEditInvoice && (
                    <span className="text-[10px] text-slate-400">—</span>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default AuditLogTable;
