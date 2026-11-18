import React, { useMemo, useState } from 'react';
import { Check, X, ArrowLeftRight } from 'lucide-react';
import type {
  PersistedRecommendationRecord,
  RecommendationStatus,
  TransferRecommendation,
} from '../../types';
import { formatCurrency, formatNumberDisplay } from '../../../../core/utils';
import {
  ConfidenceMeter,
  GRID_TABLE_CLASS,
  ProductIdentityCell,
  TablePaginationBar,
  UrgencyBadge,
} from '../shared/IntelligenceBadges';
import Button from '../../../../ui/base/Button';

interface Props {
  recommendations: TransferRecommendation[];
  history?: PersistedRecommendationRecord[];
  onDecide: (params: {
    recType: 'transfer';
    productId: string;
    productName?: string;
    fromBranchId: string;
    toBranchId: string;
    recommendedQty: number;
    approvedQty?: number;
    urgency: string;
    confidenceScore: number;
    reason: string;
    status: RecommendationStatus;
    decisionReason?: string;
  }) => Promise<void>;
  isDeciding: boolean;
}

export const TransferRecommendationsTab: React.FC<Props> = React.memo(({
  recommendations,
  history = [],
  onDecide,
  isDeciding,
}) => {
  const [editedQty, setEditedQty] = useState<Record<string, number>>({});
  const [decidedIds, setDecidedIds] = useState<Record<string, RecommendationStatus>>({});
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const persistedMap = useMemo(() => {
    const map = new Map<string, RecommendationStatus>();
    const todayPrefix = new Date().toISOString().slice(0, 10);
    for (const h of history) {
      if (h.rec_type !== 'transfer') continue;
      if (!(h.created_at || '').startsWith(todayPrefix)) continue;
      const key = `${h.product_id}::${h.from_branch_id ?? ''}::${h.to_branch_id ?? ''}`;
      if (!map.has(key)) map.set(key, h.status);
    }
    return map;
  }, [history]);

  const pagedRows = useMemo(
    () => recommendations.slice((page - 1) * pageSize, page * pageSize),
    [recommendations, page]
  );

  const handleAction = async (rec: TransferRecommendation, status: RecommendationStatus) => {
    const qty = editedQty[rec.id] ?? rec.recommendedQty;
    const effectiveStatus =
      status === 'approved' && qty !== rec.recommendedQty ? 'modified' : status;

    await onDecide({
      recType: 'transfer',
      productId: rec.productId,
      productName: rec.productName,
      fromBranchId: rec.fromBranchId,
      toBranchId: rec.toBranchId,
      recommendedQty: rec.recommendedQty,
      approvedQty: effectiveStatus === 'rejected' ? 0 : qty,
      urgency: rec.urgency,
      confidenceScore: rec.confidenceScore,
      reason: rec.reason,
      status: effectiveStatus,
      ...(effectiveStatus === 'rejected' ? { decisionReason: 'رفض من المستخدم' } : {}),
    });
    setDecidedIds(prev => ({ ...prev, [rec.id]: effectiveStatus }));
  };

  if (recommendations.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-10 text-center text-sm text-[var(--app-text-secondary)]">
        لا توجد توصيات تحويل داخلي مطلوبة حالياً — توزيع المخزون متوازن مع الطلب.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
        <table className={GRID_TABLE_CLASS}>
          <thead className="bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
            <tr>
              <th className="p-2.5">القطعة / الرقم / الشركة الصانعة</th>
            <th className="p-2.5">المسار (من ← إلى)</th>
            <th className="p-2.5 text-center">الرصيد الحالي</th>
            <th className="p-2.5 text-center">الفائض المتاح</th>
            <th className="p-2.5 text-center">الكمية المقترحة</th>
            <th className="p-2.5 text-center">التغطية بعد التحويل</th>
            <th className="p-2.5 text-end">الوفر المالي</th>
            <th className="p-2.5 text-center">الأولوية / الثقة</th>
            <th className="p-2.5">السبب</th>
            <th className="p-2.5 text-center">قرار الإدارة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--app-border)]">
          {pagedRows.map(rec => {
            const localStatus =
              decidedIds[rec.id] ??
              persistedMap.get(`${rec.productId}::${rec.fromBranchId}::${rec.toBranchId}`);
            return (
              <tr key={rec.id} className="hover:bg-[var(--app-surface-hover)]">
                <td className="p-2.5">
                  <ProductIdentityCell
                    name={rec.productName}
                    partNumber={rec.partNumber}
                    sku={rec.sku}
                    brand={rec.brand}
                  />
                </td>
                <td className="p-2.5">
                  <div className="flex items-center gap-1 font-bold">
                    <span className="text-emerald-600">{rec.fromBranchName}</span>
                    <ArrowLeftRight size={12} className="text-[var(--app-text-secondary)]" />
                    <span className="text-rose-600">{rec.toBranchName}</span>
                  </div>
                </td>
                <td dir="ltr" className="p-2.5 text-center font-mono">
                  {formatNumberDisplay(rec.fromCurrentStock)} / {formatNumberDisplay(rec.toCurrentStock)}
                </td>
                <td dir="ltr" className="p-2.5 text-center font-mono text-emerald-600">
                  {formatNumberDisplay(rec.availableSurplus)}
                </td>
                <td className="p-2.5 text-center">
                  <input
                    type="number"
                    min={1}
                    max={rec.availableSurplus}
                    value={editedQty[rec.id] ?? rec.recommendedQty}
                    onChange={e => {
                      const v = Math.max(1, Number(e.target.value) || 1);
                      setEditedQty(prev => ({ ...prev, [rec.id]: v }));
                    }}
                    disabled={Boolean(localStatus)}
                    className="w-16 rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1 text-center font-mono text-xs font-bold"
                    dir="ltr"
                  />
                </td>
                <td dir="ltr" className="p-2.5 text-center font-mono">
                  {rec.estimatedCoverageDaysAfter >= 999 ? '∞' : `${rec.estimatedCoverageDaysAfter} ي`}
                </td>
                <td dir="ltr" className="p-2.5 text-end font-mono font-bold text-indigo-600">
                  {formatCurrency(rec.capitalSaved)}
                </td>
                <td className="p-2.5 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <UrgencyBadge level={rec.urgency} />
                    <ConfidenceMeter score={rec.confidenceScore} />
                  </div>
                </td>
                <td className="max-w-[220px] p-2.5 text-[11px] text-[var(--app-text-secondary)]">
                  {rec.reason}
                </td>
                <td className="p-2.5 text-center">
                  {localStatus ? (
                    <span className="rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-600">
                      {localStatus === 'rejected' ? 'مرفوض' : 'تم الاعتماد'}
                    </span>
                  ) : (
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        size="sm"
                        variant="success"
                        disabled={isDeciding}
                        onClick={() => {
                          void handleAction(rec, 'approved');
                        }}
                        leftIcon={<Check size={12} />}
                      >
                        اعتماد
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={isDeciding}
                        onClick={() => {
                          void handleAction(rec, 'rejected');
                        }}
                        leftIcon={<X size={12} />}
                      >
                        رفض
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <TablePaginationBar
        page={page}
        pageSize={pageSize}
        total={recommendations.length}
        onPageChange={setPage}
      />
    </div>
  );
});
