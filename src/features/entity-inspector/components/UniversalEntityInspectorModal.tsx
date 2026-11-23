import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  Package,
  Receipt,
  RefreshCw,
  Search,
  Table2,
  Users,
  AlertCircle,
} from 'lucide-react';
import Modal from '../../../ui/base/Modal';
import PageLoader from '../../../ui/base/PageLoader';
import { cn } from '../../../core/utils';
import { useAuthStore } from '../../auth/store';
import { useBranchFilterStore } from '../../branches/store';
import { useEntityInspectorStore } from '../store';
import { fetchInspectedEntity } from '../service';
import type { InspectableEntityType, InspectorFieldRow, InspectorTone } from '../types';
import { EntityInfoDot } from './EntityInfoDot';

const ENTITY_ICON_MAP: Record<InspectableEntityType, typeof Package> = {
  product: Package,
  party: Users,
  invoice: FileText,
  bond: Receipt,
  account: Landmark,
};

const ENTITY_TYPE_LABEL: Record<InspectableEntityType, string> = {
  product: 'منتج / صنف',
  party: 'عميل / مورد',
  invoice: 'فاتورة',
  bond: 'سند مالي',
  account: 'حساب محاسبي',
};

const TONE_TEXT: Record<InspectorTone, string> = {
  default: 'text-[var(--app-text)]',
  emerald: 'text-emerald-700 dark:text-emerald-400',
  rose: 'text-rose-700 dark:text-rose-400',
  amber: 'text-amber-700 dark:text-amber-400',
  blue: 'text-blue-700 dark:text-blue-400',
  indigo: 'text-indigo-700 dark:text-indigo-400',
};

const TONE_BADGE: Record<InspectorTone, string> = {
  default: 'border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text)]',
  emerald: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  rose: 'border-rose-500/35 bg-rose-500/15 text-rose-800 dark:text-rose-300',
  amber: 'border-amber-500/35 bg-amber-500/15 text-amber-800 dark:text-amber-300',
  blue: 'border-blue-500/35 bg-blue-500/15 text-blue-800 dark:text-blue-300',
  indigo: 'border-indigo-500/35 bg-indigo-500/15 text-indigo-800 dark:text-indigo-300',
};

const escapeCsvCell = (val: string): string => {
  const s = String(val ?? '').replace(/\r?\n/g, ' ');
  return `"${s.replace(/"/g, '""')}"`;
};

export const UniversalEntityInspectorModal: React.FC = () => {
  const stack = useEntityInspectorStore(s => s.stack);
  const back = useEntityInspectorStore(s => s.back);
  const goToIndex = useEntityInspectorStore(s => s.goToIndex);
  const close = useEntityInspectorStore(s => s.close);

  const user = useAuthStore(s => s.user);
  const activeBranchId = useBranchFilterStore(s => s.activeBranchId);
  const companyId = user?.company_id || '';
  const canViewCost = user?.role !== 'cashier' && user?.role !== 'sales_rep';

  const currentTarget = stack[stack.length - 1] ?? null;

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [sheetSearch, setSheetSearch] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab('overview');
    setSheetSearch('');
  }, [currentTarget?.type, currentTarget?.id]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [
      'entity-inspector',
      currentTarget?.type,
      currentTarget?.id,
      currentTarget?.subType,
      companyId,
      activeBranchId,
      canViewCost,
    ],
    queryFn: () =>
      fetchInspectedEntity(currentTarget!, {
        companyId,
        branchId: activeBranchId,
        canViewCost,
      }),
    enabled: Boolean(currentTarget?.id),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const groupedFields = useMemo(() => {
    if (!data?.fields) return [];
    const map = new Map<string, InspectorFieldRow[]>();
    for (const f of data.fields) {
      const list = map.get(f.section) ?? [];
      list.push(f);
      map.set(f.section, list);
    }
    return Array.from(map.entries());
  }, [data?.fields]);

  const activeSheet = useMemo(
    () => data?.sheets.find(s => s.id === activeTab) ?? null,
    [data?.sheets, activeTab]
  );

  const filteredSheetRows = useMemo(() => {
    if (!activeSheet) return [];
    const q = sheetSearch.trim().toLowerCase();
    if (!q) return activeSheet.rows;
    return activeSheet.rows.filter(row =>
      Object.values(row.cells).some(v => String(v).toLowerCase().includes(q))
    );
  }, [activeSheet, sheetSearch]);

  if (!currentTarget) return null;

  const Icon = ENTITY_ICON_MAP[currentTarget.type] || FileSpreadsheet;

  const handleCopy = (key: string, value: string) => {
    if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1500);
    });
  };

  const handleExportCsv = () => {
    if (!data) return;
    const lines: string[] = [];
    if (activeSheet) {
      lines.push(
        ['#', ...activeSheet.columns.map(c => c.label)].map(escapeCsvCell).join(',')
      );
      filteredSheetRows.forEach((row, idx) => {
        lines.push(
          [
            String(idx + 1),
            ...activeSheet.columns.map(c => row.cells[c.key] ?? ''),
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      });
    } else {
      lines.push(['القسم', 'البيان', 'القيمة'].map(escapeCsvCell).join(','));
      data.fields.forEach(f => {
        lines.push([f.section, f.label, f.value].map(escapeCsvCell).join(','));
      });
    }

    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = (data.title || currentTarget.type).replace(/[\\/:*?"<>|]+/g, '_');
    link.download = `${safeName}_${activeSheet ? activeSheet.label : 'البطاقة'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const modalTitle = data?.title || currentTarget.label || ENTITY_TYPE_LABEL[currentTarget.type];
  const modalDescription =
    data?.subtitle || `استعلام شامل بنمط جدول إكسل — ${ENTITY_TYPE_LABEL[currentTarget.type]}`;

  return (
    <Modal
      isOpen={Boolean(currentTarget)}
      onClose={close}
      icon={Icon}
      title={modalTitle}
      description={modalDescription}
      size="5xl"
      zIndex="z-[10050]"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--app-text-secondary)]">
            <Table2 size={14} className="text-blue-600 dark:text-blue-400" />
            <span>
              {activeSheet
                ? `ورقة: ${activeSheet.label} (${filteredSheetRows.length} سجل)`
                : `ورقة البيانات الشاملة (${data?.fields.length ?? 0} حقل)`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-bold text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-hover)] disabled:opacity-50"
            >
              <RefreshCw size={13} className={cn(isFetching && 'animate-spin')} />
              <span>تحديث</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!data}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/35 bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download size={13} />
              <span>تصدير Excel</span>
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-1.5 text-xs font-bold text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-hover)]"
            >
              إغلاق
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Drill-Down Breadcrumb Bar */}
        {stack.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-xs">
            <button
              type="button"
              onClick={back}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 font-bold text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-hover)]"
            >
              <ArrowRight size={13} />
              <span>رجوع</span>
            </button>
            <span className="text-[var(--app-text-secondary)]">|</span>
            {stack.map((item, idx) => {
              const isLast = idx === stack.length - 1;
              return (
                <React.Fragment key={`${item.type}-${item.id}-${idx}`}>
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() => goToIndex(idx)}
                    className={cn(
                      'rounded px-2 py-0.5 font-bold transition-colors',
                      isLast
                        ? 'bg-blue-600/15 text-blue-700 dark:text-blue-300'
                        : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]'
                    )}
                  >
                    {item.label || ENTITY_TYPE_LABEL[item.type]}
                  </button>
                  {!isLast && <span className="text-[var(--app-text-secondary)]">/</span>}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {isLoading ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2">
            <PageLoader />
            <span className="text-xs font-bold text-[var(--app-text-secondary)]">
              جاري تحميل كامل البيانات والسجل...
            </span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
            <AlertCircle size={28} className="text-rose-600 dark:text-rose-400" />
            <div className="text-sm font-bold text-rose-700 dark:text-rose-300">
              {error instanceof Error ? error.message : 'تعذر تحميل بيانات العنصر'}
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : data ? (
          <>
            {/* Top Status & KPI Excel Grid */}
            <div className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
              <div
                data-inspector-subheader="true"
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] bg-[var(--app-bg)] px-3.5 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-0.5 text-[11px] font-black text-[var(--app-text)]">
                    {ENTITY_TYPE_LABEL[data.type]}
                  </span>
                  {data.code && (
                    <button
                      type="button"
                      onClick={() => handleCopy('header-code', data.code!)}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-700 hover:border-indigo-500 dark:text-indigo-300"
                      title="نسخ الرمز"
                    >
                      <span>{data.code}</span>
                      {copiedKey === 'header-code' ? (
                        <Check size={11} className="text-emerald-600" />
                      ) : (
                        <Copy size={11} className="opacity-70" />
                      )}
                    </button>
                  )}
                </div>
                {data.badge && (
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-[11px] font-black',
                      TONE_BADGE[data.badge.tone]
                    )}
                  >
                    {data.badge.label}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 divide-x divide-x-reverse divide-[var(--app-border)] sm:grid-cols-4">
                {data.kpis.map((kpi, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col justify-between border-b border-[var(--app-border)] p-3 sm:border-b-0"
                  >
                    <span className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                      {kpi.label}
                    </span>
                    <span
                      className={cn(
                        'mt-1 font-mono text-sm font-black tabular-nums md:text-base',
                        TONE_TEXT[kpi.tone ?? 'default']
                      )}
                      dir="ltr"
                    >
                      {kpi.value}
                    </span>
                    {kpi.subValue && (
                      <span className="mt-0.5 truncate text-[10px] font-semibold text-[var(--app-text-secondary)]">
                        {kpi.subValue}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Excel Worksheet Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] pb-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('overview');
                    setSheetSearch('');
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-extrabold transition-all',
                    activeTab === 'overview'
                      ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                      : 'border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
                  )}
                >
                  <FileSpreadsheet size={13} />
                  <span>البطاقة الكاملة</span>
                </button>

                {data.sheets.map(sheet => {
                  const isSelected = activeTab === sheet.id;
                  return (
                    <button
                      key={sheet.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(sheet.id);
                        setSheetSearch('');
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-extrabold transition-all',
                        isSelected
                          ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                          : 'border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
                      )}
                    >
                      <span>{sheet.label}</span>
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.2 font-mono text-[10px] font-black',
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-[var(--app-surface)] text-[var(--app-text-secondary)] border border-[var(--app-border)]'
                        )}
                      >
                        {sheet.rows.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeSheet && activeSheet.rows.length > 0 && (
                <div className="relative w-full sm:w-56">
                  <Search
                    size={13}
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)]"
                  />
                  <input
                    type="text"
                    value={sheetSearch}
                    onChange={e => setSheetSearch(e.target.value)}
                    placeholder="تصفية سريعة في الجدول..."
                    className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] py-1.5 pl-2.5 pr-8 text-xs font-semibold text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Active Worksheet Body — Professional Excel Grid */}
            {activeTab === 'overview' ? (
              <div className="space-y-3">
                {groupedFields.map(([sectionName, sectionFields]) => (
                  <div
                    key={sectionName}
                    className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]"
                  >
                    <div
                      data-inspector-subheader="true"
                      className="border-b border-[var(--app-border)] bg-[var(--app-bg)] px-3.5 py-2 text-xs font-black text-[var(--app-text)]"
                    >
                      {sectionName}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-right text-xs">
                        <tbody>
                          {Array.from({ length: Math.ceil(sectionFields.length / 2) }).map(
                            (_, rowIdx) => {
                              const leftField = sectionFields[rowIdx * 2];
                              const rightField = sectionFields[rowIdx * 2 + 1];
                              return (
                                <tr
                                  key={rowIdx}
                                  className="border-b border-[var(--app-border)] last:border-b-0 odd:bg-[var(--app-surface)] even:bg-[var(--app-bg)]/45"
                                >
                                  {leftField && (
                                    <>
                                      <th className="w-36 border-l border-[var(--app-border)] bg-[var(--app-bg)]/75 px-3 py-2 font-extrabold text-[var(--app-text-secondary)]">
                                        {leftField.label}
                                      </th>
                                      <td
                                        colSpan={rightField ? 1 : 3}
                                        className="border-l border-[var(--app-border)] px-3 py-2 font-bold last:border-l-0"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span
                                            className={cn(
                                              TONE_TEXT[leftField.tone ?? 'default'],
                                              leftField.mono && 'font-mono tabular-nums'
                                            )}
                                          >
                                            {leftField.value}
                                          </span>
                                          <div className="flex items-center gap-1">
                                            {leftField.target && (
                                              <EntityInfoDot
                                                type={leftField.target.type}
                                                id={leftField.target.id}
                                                label={leftField.target.label}
                                                subType={leftField.target.subType}
                                                inInspector
                                                size="xs"
                                              />
                                            )}
                                            {leftField.copyValue && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleCopy(
                                                    `${sectionName}-${leftField.label}`,
                                                    leftField.copyValue!
                                                  )
                                                }
                                                className="rounded p-1 text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-blue-600"
                                                title="نسخ القيمة"
                                              >
                                                {copiedKey === `${sectionName}-${leftField.label}` ? (
                                                  <Check size={12} className="text-emerald-600" />
                                                ) : (
                                                  <Copy size={12} />
                                                )}
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                    </>
                                  )}

                                  {rightField && (
                                    <>
                                      <th className="w-36 border-l border-[var(--app-border)] bg-[var(--app-bg)]/75 px-3 py-2 font-extrabold text-[var(--app-text-secondary)]">
                                        {rightField.label}
                                      </th>
                                      <td className="px-3 py-2 font-bold">
                                        <div className="flex items-center justify-between gap-2">
                                          <span
                                            className={cn(
                                              TONE_TEXT[rightField.tone ?? 'default'],
                                              rightField.mono && 'font-mono tabular-nums'
                                            )}
                                          >
                                            {rightField.value}
                                          </span>
                                          <div className="flex items-center gap-1">
                                            {rightField.target && (
                                              <EntityInfoDot
                                                type={rightField.target.type}
                                                id={rightField.target.id}
                                                label={rightField.target.label}
                                                subType={rightField.target.subType}
                                                inInspector
                                                size="xs"
                                              />
                                            )}
                                            {rightField.copyValue && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleCopy(
                                                    `${sectionName}-${rightField.label}`,
                                                    rightField.copyValue!
                                                  )
                                                }
                                                className="rounded p-1 text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-blue-600"
                                                title="نسخ القيمة"
                                              >
                                                {copiedKey ===
                                                `${sectionName}-${rightField.label}` ? (
                                                  <Check size={12} className="text-emerald-600" />
                                                ) : (
                                                  <Copy size={12} />
                                                )}
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                    </>
                                  )}
                                </tr>
                              );
                            }
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : activeSheet ? (
              <div className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
                {filteredSheetRows.length === 0 ? (
                  <div className="p-10 text-center text-xs font-bold text-[var(--app-text-secondary)]">
                    {sheetSearch
                      ? 'لا توجد نتائج مطابقة للبحث في هذا الجدول.'
                      : activeSheet.emptyMessage || 'لا توجد بيانات مسجلة.'}
                  </div>
                ) : (
                  <div className="custom-scrollbar max-h-[420px] overflow-auto">
                    <table className="w-full border-collapse text-right text-xs">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b-2 border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text)]">
                          <th className="w-10 border border-[var(--app-border)] px-2 py-2 text-center font-mono text-[11px] font-black">
                            #
                          </th>
                          {activeSheet.columns.map(col => (
                            <th
                              key={col.key}
                              className={cn(
                                'whitespace-nowrap border border-[var(--app-border)] px-3 py-2 text-[11px] font-black',
                                col.align === 'center' && 'text-center',
                                col.align === 'left' && 'text-left'
                              )}
                            >
                              {col.label}
                            </th>
                          ))}
                          <th className="w-12 border border-[var(--app-border)] px-2 py-2 text-center text-[11px] font-black">
                            تفاصيل
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSheetRows.map((row, idx) => (
                          <tr
                            key={`${row.id}-${idx}`}
                            className="transition-colors odd:bg-[var(--app-surface)] even:bg-[var(--app-bg)]/50 hover:bg-blue-500/10"
                          >
                            <td className="border border-[var(--app-border)] px-2 py-2 text-center font-mono text-[11px] font-bold text-[var(--app-text-secondary)]">
                              {idx + 1}
                            </td>
                            {activeSheet.columns.map(col => {
                              const cellVal = row.cells[col.key] ?? '—';
                              return (
                                <td
                                  key={col.key}
                                  dir={col.mono ? 'ltr' : undefined}
                                  className={cn(
                                    'border border-[var(--app-border)] px-3 py-2 font-semibold text-[var(--app-text)]',
                                    col.align === 'center' && 'text-center',
                                    col.align === 'left' && 'text-left',
                                    col.mono && 'font-mono tabular-nums',
                                    (col.key === 'total' ||
                                      col.key === 'amount' ||
                                      col.key === 'qty' ||
                                      col.key === 'balance') &&
                                      row.tone &&
                                      TONE_TEXT[row.tone]
                                  )}
                                >
                                  {cellVal}
                                </td>
                              );
                            })}
                            <td className="border border-[var(--app-border)] px-2 py-2 text-center">
                              {row.target ? (
                                <EntityInfoDot
                                  type={row.target.type}
                                  id={row.target.id}
                                  label={row.target.label}
                                  subType={row.target.subType}
                                  inInspector
                                  size="xs"
                                />
                              ) : (
                                <span className="text-[var(--app-text-secondary)]">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
};
