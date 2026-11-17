import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { PurchaseRecommendation } from '../../types';
import { formatCurrency, formatNumberDisplay } from '../../../../core/utils';
import {
  GRID_TABLE_CLASS,
  ProductIdentityCell,
  TablePaginationBar,
} from '../shared/IntelligenceBadges';

interface Props {
  recommendations: PurchaseRecommendation[];
}

export const SuppliersTab: React.FC<Props> = ({ recommendations }) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const allRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recommendations
      .filter(r => Boolean(r.recommendedSupplier))
      .filter(r => {
        if (!q) return true;
        return `${r.productName} ${r.partNumber} ${r.sku} ${r.brand} ${r.recommendedSupplier?.supplierName ?? ''}`
          .toLowerCase()
          .includes(q);
      });
  }, [recommendations, search]);

  const rows = useMemo(
    () => allRows.slice((page - 1) * pageSize, page * pageSize),
    [allRows, page]
  );

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)]" />
        <input
          type="text"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
          }}
          placeholder="بحث باسم المورد أو الصنف أو رقم القطعة..."
          className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] py-2 pl-3 pr-9 text-xs text-[var(--app-text)] outline-none focus:border-blue-500"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
        <table className={GRID_TABLE_CLASS}>
          <thead className="bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
            <tr>
              <th className="p-2.5">القطعة / الرقم / الشركة الصانعة</th>
              <th className="p-2.5">المورد المرشح</th>
              <th className="p-2.5 text-center">عدد التوريدات</th>
              <th className="p-2.5 text-center">إجمالي الكميات</th>
              <th className="p-2.5 text-end">آخر سعر / المتوسط</th>
              <th className="p-2.5 text-center">آخر شراء</th>
              <th className="p-2.5 text-center">التقييم</th>
              <th className="p-2.5">سبب الترتيب والبدائل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-[var(--app-text-secondary)]">
                  لا توجد بيانات مطابقة لمطابقة الموردين
                </td>
              </tr>
            ) : (
              rows.map(rec => {
                const sup = rec.recommendedSupplier;
                if (!sup) return null;
                return (
                  <tr key={rec.id} className="hover:bg-[var(--app-surface-hover)]">
                    <td className="p-2.5">
                      <ProductIdentityCell
                        name={rec.productName}
                        partNumber={rec.partNumber}
                        sku={rec.sku}
                        brand={rec.brand}
                        qualityGrade={rec.qualityGrade}
                      />
                    </td>
                    <td className="p-2.5 font-bold text-blue-600 dark:text-blue-400">
                      {sup.supplierName}
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono">
                      {formatNumberDisplay(sup.purchaseTxCount)}
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono">
                      {formatNumberDisplay(sup.totalQtySupplied)}
                    </td>
                    <td dir="ltr" className="p-2.5 text-end font-mono">
                      <div>{formatCurrency(sup.lastUnitPrice)}</div>
                      <div className="text-[10px] text-[var(--app-text-secondary)]">
                        متوسط: {formatCurrency(sup.avgUnitPrice)}
                      </div>
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono text-[11px]">
                      {sup.lastPurchaseDate || '—'}
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono font-bold text-emerald-600">
                      <div>{sup.compositeScore}/100</div>
                      <div className="text-[10px] font-normal text-[var(--app-text-secondary)]">
                        {sup.isLeadTimeEstimated ? `توريد تقديري: ${sup.estimatedLeadTimeDays}ي` : `توريد مقاس: ${sup.estimatedLeadTimeDays}ي`}
                      </div>
                      {sup.fulfillmentRatePct !== null && (
                        <div className="text-[10px] font-normal text-blue-600">
                          توريد فعلي: {sup.fulfillmentRatePct}%
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 text-[11px] text-[var(--app-text-secondary)]">
                      <div>{sup.rankingReasons.join(' • ')}</div>
                      {rec.alternativeSuppliers.length > 0 && (
                        <div className="mt-0.5 text-[10px]">
                          بدائل: {rec.alternativeSuppliers.map(a => a.supplierName).join('، ')}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <TablePaginationBar
        page={page}
        pageSize={pageSize}
        total={allRows.length}
        onPageChange={setPage}
      />
    </div>
  );
};
