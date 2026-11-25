import { CheckCircle2, Copy } from 'lucide-react';
import type { Column } from '../../../../ui/common/ExcelTable';
import type { ReorderProductItem } from './ReorderCatalogTab';

export function buildPublicPortalProductColumns(params: {
  copiedOem: string | null;
  onCopyOem: (oem: string) => void;
  onAddProductToDraft: (product: ReorderProductItem) => void;
}): Array<Column<ReorderProductItem>> {
  const { copiedOem, onCopyOem, onAddProductToDraft } = params;

  return [
    {
      header: 'الصنف / الوصف',
      accessorKey: 'name_ar',
      sortKey: 'name_ar',
      width: '260px',
      accessor: row => (
        <div className="flex items-center gap-2 text-right">
          {row.needs_reorder && (
            <span
              className="flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-500"
              title="مطلوب إعادة طلب عاجل"
            />
          )}
          <div>
            <p className="text-xs font-bold text-white">{row.name_ar}</p>
            <span className="font-mono text-[10px] text-slate-400">SKU: {row.sku}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'رقم القطعة (OEM)',
      accessorKey: 'part_number',
      sortKey: 'part_number',
      width: '160px',
      align: 'center',
      accessor: row =>
        row.part_number ? (
          <button
            type="button"
            onClick={() => {
              onCopyOem(row.part_number!);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-200 transition-all hover:border-emerald-500 hover:text-emerald-400"
            title="انقر لنسخ رقم القطعة"
          >
            <span>{row.part_number}</span>
            {copiedOem === row.part_number ? (
              <CheckCircle2 size={11} className="text-emerald-400" />
            ) : (
              <Copy size={11} className="opacity-60" />
            )}
          </button>
        ) : (
          <span className="font-mono text-slate-600">---</span>
        ),
    },
    {
      header: 'الماركة',
      accessorKey: 'brand',
      sortKey: 'brand',
      width: '110px',
      align: 'center',
      accessor: row => (
        <span className="text-xs font-semibold text-slate-300">{row.brand || '---'}</span>
      ),
    },
    {
      header: 'المقاس / الحجم',
      accessorKey: 'size',
      width: '100px',
      align: 'center',
      accessor: row => (
        <span className="text-xs font-medium text-slate-400">{row.size || '---'}</span>
      ),
    },
    {
      header: 'الوحدة',
      accessorKey: 'unit',
      width: '80px',
      align: 'center',
      accessor: row => (
        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
          {row.unit || 'حبة'}
        </span>
      ),
    },
    {
      header: 'الرصيد المتاح',
      accessorKey: 'current_stock',
      sortKey: 'current_stock',
      width: '100px',
      align: 'center',
      accessor: row => (
        <span
          className={`font-mono text-xs font-bold ${
            row.needs_reorder ? 'text-rose-400' : 'text-slate-300'
          }`}
        >
          {row.current_stock}
        </span>
      ),
    },
    {
      header: 'الحد الأدنى',
      accessorKey: 'min_stock_level',
      width: '90px',
      align: 'center',
      accessor: row => (
        <span className="font-mono text-xs text-slate-400">{row.min_stock_level || 0}</span>
      ),
    },
    {
      header: 'الإجراء',
      width: '110px',
      align: 'center',
      accessor: row => (
        <button
          type="button"
          onClick={() => {
            onAddProductToDraft(row);
          }}
          className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-xs font-black text-emerald-400 transition-all hover:bg-emerald-600 hover:text-white"
        >
          + تسعير
        </button>
      ),
    },
  ];
}
