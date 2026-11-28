import React, { useMemo, useState } from 'react';
import { useItemMovement } from '../hooks/index';
import { Info, RefreshCw, Search } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn, formatNumberDisplay } from '../../../core/utils';
import AuditLogHeader from './audit/AuditLogHeader';
import AuditLogTable from './audit/AuditLogTable';
import GeneralMovementsFeed from './audit/GeneralMovementsFeed';
import { resolveMovementDocumentAction } from './audit/movements/movementDocumentUtils';
import {
  MovementDocumentModals,
  type ActiveMovementDocument,
} from './audit/movements/MovementDocumentModals';

const AuditLogView: React.FC = () => {
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'in' | 'out'>('all');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [activeDocument, setActiveDocument] = useState<ActiveMovementDocument | null>(null);
  const [editingSalesInvoiceId, setEditingSalesInvoiceId] = useState<string | null>(null);

  const {
    data: log,
    isLoading: isLogLoading,
    isRefetching,
    refetch,
  } = useItemMovement(selectedProduct?.id || null);

  const filteredLog = useMemo(() => {
    const rows = log || [];
    const q = search.trim().toLowerCase();
    return rows.filter(entry => {
      if (directionFilter !== 'all' && entry.transaction_type !== directionFilter) return false;
      if (docTypeFilter !== 'all') {
        const action = resolveMovementDocumentAction({
          reference_id: entry.reference_id,
          doc_type: entry.doc_type,
          reference_type: entry.reference_type,
          original_type: entry.original_type,
          document_number: entry.document_number,
        });
        if (docTypeFilter === 'sale' && action.kind !== 'sales_invoice') return false;
        if (docTypeFilter === 'purchase' && action.kind !== 'purchase_invoice') return false;
        if (docTypeFilter === 'sale_return' && action.kind !== 'sale_return') return false;
        if (docTypeFilter === 'purchase_return' && action.kind !== 'purchase_return') return false;
        if (docTypeFilter === 'transfer' && action.kind !== 'transfer') return false;
        if (docTypeFilter === 'stock_audit' && action.kind !== 'audit') return false;
      }
      const dateStr = entry.date ? String(entry.date).slice(0, 10) : '';
      if (fromDate && dateStr && dateStr < fromDate) return false;
      if (toDate && dateStr && dateStr > toDate) return false;
      if (q) {
        const match =
          (entry.document_number || '').toLowerCase().includes(q) ||
          (entry.source_name || '').toLowerCase().includes(q) ||
          (entry.source_user || '').toLowerCase().includes(q) ||
          (entry.notes || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [log, search, directionFilter, docTypeFilter, fromDate, toDate]);

  const logStats = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const row of filteredLog) {
      if (row.transaction_type === 'in') totalIn += Math.abs(Number(row.quantity || 0));
      else totalOut += Math.abs(Number(row.quantity || 0));
    }
    return {
      totalIn,
      totalOut,
      net: totalIn - totalOut,
    };
  }, [filteredLog]);

  const handleBack = () => {
    setSelectedProduct(null);
    setSearch('');
    setDirectionFilter('all');
    setDocTypeFilter('all');
    setFromDate('');
    setToDate('');
  };

  const content = (
    <div
      className={cn(
        'animate-in fade-in mx-auto flex h-full max-w-none flex-col transition-all duration-500',
        isMaximized
          ? 'fixed inset-0 z-[999] overflow-hidden bg-[var(--app-surface)] p-4 sm:p-6'
          : 'gap-4'
      )}
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col bg-[var(--app-surface)] transition-all',
          isMaximized
            ? 'h-full'
            : 'overflow-hidden rounded-3xl border border-slate-200 shadow-sm dark:border-slate-800'
        )}
      >
        {selectedProduct ? (
          <>
            <AuditLogHeader
              selectedProduct={selectedProduct}
              log={filteredLog}
              isMaximized={isMaximized}
              setIsMaximized={setIsMaximized}
              onBack={handleBack}
            />

            {/* Filter & Summary Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-52 sm:w-64">
                  <Search
                    size={13}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="بحث برقم المستند أو العميل..."
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
                  {(
                    [
                      { value: 'all', label: 'الكل' },
                      { value: 'in', label: '+ وارد' },
                      { value: 'out', label: '- صادر' },
                    ] as const
                  ).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDirectionFilter(opt.value)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors',
                        directionFilter === opt.value
                          ? opt.value === 'in'
                            ? 'bg-emerald-600 text-white'
                            : opt.value === 'out'
                              ? 'bg-rose-600 text-white'
                              : 'bg-blue-600 text-white'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <select
                  value={docTypeFilter}
                  onChange={e => setDocTypeFilter(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="all">كل المستندات</option>
                  <option value="sale">فواتير البيع</option>
                  <option value="purchase">فواتير الشراء</option>
                  <option value="sale_return">مردود مبيعات</option>
                  <option value="purchase_return">مردود مشتريات</option>
                  <option value="transfer">مناقلات</option>
                  <option value="stock_audit">جرد</option>
                </select>

                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  title="من تاريخ"
                />
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  title="إلى تاريخ"
                />

                <button
                  type="button"
                  onClick={() => void refetch()}
                  disabled={isLogLoading || isRefetching}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  title="تحديث السجل"
                >
                  <RefreshCw
                    size={12}
                    className={cn((isLogLoading || isRefetching) && 'animate-spin text-blue-600')}
                  />
                  <span>تحديث</span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs font-black">
                <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                  وارد: +{formatNumberDisplay(logStats.totalIn)}
                </span>
                <span className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-mono text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                  صادر: -{formatNumberDisplay(logStats.totalOut)}
                </span>
              </div>
            </div>

            <div className="custom-scrollbar relative flex-1 overflow-auto p-4">
              {isLogLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/10 border-t-blue-500" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    جاري تجهيز البيانات التدقيقية...
                  </p>
                </div>
              ) : filteredLog.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <Info size={40} className="mb-3 opacity-10" />
                  <p className="text-xs font-bold">لا توجد حركات مطابقة لهذا الصنف</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm dark:border-slate-800">
                  <AuditLogTable
                    log={filteredLog}
                    onOpenDocument={setActiveDocument}
                    onEditInvoice={setEditingSalesInvoiceId}
                  />
                </div>
              )}
            </div>

            <div
              className={cn(
                'flex items-center justify-between border-t bg-gray-50 p-3 px-8 text-[10px] font-black text-gray-400 transition-all dark:border-slate-700 dark:bg-slate-800',
                isMaximized && 'py-4'
              )}
            >
              <div className="flex gap-6">
                <span className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />{' '}
                  واردات (مشتريات/مردود)
                </span>
                <span className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />{' '}
                  صادرات (مبيعات/هالك)
                </span>
              </div>
              <span className="italic opacity-60">
                * انقر على رقم المستند أو أيقونة المستند للوصول لأصل الحركة أو تعديل الفاتورة
              </span>
            </div>
          </>
        ) : (
          <GeneralMovementsFeed onSelectProduct={p => setSelectedProduct(p)} />
        )}
      </div>

      <MovementDocumentModals
        activeDocument={activeDocument}
        editingSalesInvoiceId={editingSalesInvoiceId}
        onCloseDocument={() => setActiveDocument(null)}
        onCloseEditInvoice={() => setEditingSalesInvoiceId(null)}
      />
    </div>
  );

  if (isMaximized) {
    return createPortal(content, document.body);
  }

  return content;
};

export default AuditLogView;
