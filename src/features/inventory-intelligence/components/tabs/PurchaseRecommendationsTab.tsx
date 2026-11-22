import React, { useMemo, useState } from 'react';
import { Check, Clock, Download, Info, X } from 'lucide-react';
import type {
  BranchInfo,
  PersistedRecommendationRecord,
  ProductIntelligenceSummary,
  PurchaseRecommendation,
  RecommendationStatus,
} from '../../types';
import { formatCurrency, formatNumberDisplay } from '../../../../core/utils';
import { exportGenericTableToExcel } from '../../../../core/utils/genericExcelExporter';
import Button from '../../../../ui/base/Button';
import {
  DEFAULT_INTELLIGENCE_FILTERS,
  filterAndSortPurchaseRecommendations,
  getProductMap,
  type IntelligenceFilterState,
} from '../../domain/sorting/intelligenceSortAndFilter';
import { PurchaseBreakdownModal } from '../modals/PurchaseBreakdownModal';
import { IntelligenceFilterSortBar } from '../shared/IntelligenceFilterSortBar';
import {
  ConfidenceMeter,
  GRID_TABLE_CLASS,
  ProductIdentityCell,
  TablePaginationBar,
  UrgencyBadge,
} from '../shared/IntelligenceBadges';

interface Props {
  recommendations: PurchaseRecommendation[];
  products?: ProductIntelligenceSummary[];
  branches?: BranchInfo[];
  history?: PersistedRecommendationRecord[];
  onDecide: (params: {
    recType: 'purchase';
    productId: string;
    productName?: string;
    supplierId?: string | null;
    recommendedQty: number;
    approvedQty?: number;
    urgency: string;
    confidenceScore: number;
    reason: string;
    status: RecommendationStatus;
    decisionReason?: string;
    calculationBreakdown?: Record<string, unknown>;
  }) => Promise<void>;
  isDeciding: boolean;
}

export const PurchaseRecommendationsTab: React.FC<Props> = React.memo(({
  recommendations,
  products = [],
  branches = [],
  history = [],
  onDecide,
  isDeciding,
}) => {
  const [filters, setFilters] = useState<IntelligenceFilterState>(DEFAULT_INTELLIGENCE_FILTERS);
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [editedQty, setEditedQty] = useState<Record<string, number>>({});
  const [decidedIds, setDecidedIds] = useState<Record<string, RecommendationStatus>>({});
  const [detailRec, setDetailRec] = useState<PurchaseRecommendation | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const productMap = useMemo(() => getProductMap(products), [products]);

  const persistedMap = useMemo(() => {
    const map = new Map<string, RecommendationStatus>();
    const todayPrefix = new Date().toISOString().slice(0, 10);
    for (const h of history) {
      if (h.rec_type !== 'purchase') continue;
      if (!(h.created_at || '').startsWith(todayPrefix)) continue;
      if (!map.has(h.product_id)) map.set(h.product_id, h.status);
    }
    return map;
  }, [history]);

  const allFiltered = useMemo(() => {
    const byUrgency =
      urgencyFilter === 'all'
        ? recommendations
        : recommendations.filter(r => r.urgency === urgencyFilter);
    return filterAndSortPurchaseRecommendations(byUrgency, productMap, filters);
  }, [recommendations, productMap, filters, urgencyFilter]);

  const filtered = useMemo(
    () => allFiltered.slice((page - 1) * pageSize, page * pageSize),
    [allFiltered, page]
  );

  const handleAction = async (rec: PurchaseRecommendation, status: RecommendationStatus) => {
    const qty = editedQty[rec.id] ?? rec.recommendedQty;
    const effectiveStatus =
      status === 'approved' && qty !== rec.recommendedQty ? 'modified' : status;

    await onDecide({
      recType: 'purchase',
      productId: rec.productId,
      productName: rec.productName,
      supplierId: rec.recommendedSupplier?.supplierId ?? null,
      recommendedQty: rec.recommendedQty,
      approvedQty: effectiveStatus === 'rejected' ? 0 : qty,
      urgency: rec.urgency,
      confidenceScore: rec.confidenceScore,
      reason: rec.reason,
      status: effectiveStatus,
      calculationBreakdown: rec.calculationBreakdown as unknown as Record<string, unknown>,
      ...(effectiveStatus === 'rejected' ? { decisionReason: 'رفض من المستخدم' } : {}),
    });
    setDecidedIds(prev => ({ ...prev, [rec.id]: effectiveStatus }));
  };

  const handleExport = () => {
    void exportGenericTableToExcel({
      title: 'توصيات الشراء الذكية',
      subtitle: `إجمالي الأصناف الموصى بشرائها: ${filtered.length}`,
      headers: [
        'الصنف',
        'رقم القطعة',
        'الشركة',
        'المباع 365ي',
        'المتاح',
        'الوارد',
        'نقطة إعادة الطلب',
        'الكمية الموصى بها',
        'المورد المرشح',
        'التكلفة التقديرية',
      ],
      rows: filtered.map(r => [
        r.productName,
        r.partNumber,
        r.brand,
        r.historicalSold365d,
        r.availableStock,
        r.incomingStock,
        r.reorderPoint,
        editedQty[r.id] ?? r.recommendedQty,
        r.recommendedSupplier?.supplierName ?? 'غير محدد',
        r.estimatedCost,
      ]),
      colorTheme: 'green',
    });
  };

  return (
    <div className="space-y-3">
      <IntelligenceFilterSortBar
        products={products}
        branches={branches}
        filters={filters}
        onChange={next => {
          setFilters(next);
          setPage(1);
        }}
        extraControls={
          <>
            <select
              value={urgencyFilter}
              onChange={e => {
                setUrgencyFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1.5 text-xs font-bold text-[var(--app-text)]"
            >
              <option value="all">كل الأولويات</option>
              <option value="critical">حرج (نفاد)</option>
              <option value="high">عالي</option>
              <option value="medium">متوسط</option>
              <option value="low">منخفض</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              leftIcon={<Download size={14} />}
            >
              تصدير قائمة الشراء
            </Button>
          </>
        }
      />

      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
        <table className={GRID_TABLE_CLASS}>
          <thead className="bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
            <tr>
              <th className="p-2.5">القطعة / الرقم / الشركة الصانعة</th>
              <th className="p-2.5 text-center">مبيعات 365ي / يومي</th>
              <th className="p-2.5 text-center">المتاح / الوارد</th>
              <th className="p-2.5 text-center">الأمان / إعادة الطلب</th>
              <th className="p-2.5 text-center">الكمية المقترحة</th>
              <th className="p-2.5">المورد المرشح</th>
              <th className="p-2.5 text-end">التكلفة التقديرية</th>
              <th className="p-2.5 text-center">الأولوية / الثقة</th>
              <th className="p-2.5 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-[var(--app-text-secondary)]">
                  لا توجد توصيات شراء مطابقة للفلاتر المحددة
                </td>
              </tr>
            ) : (
              filtered.map(rec => {
                const localStatus = decidedIds[rec.id] ?? persistedMap.get(rec.productId);
                const prod = productMap.get(rec.productId);
                return (
                  <tr key={rec.id} className="hover:bg-[var(--app-surface-hover)]">
                    <td className="p-2.5">
                      <ProductIdentityCell
                        productId={rec.productId}
                        name={rec.productName}
                        partNumber={rec.partNumber}
                        sku={rec.sku}
                        brand={rec.brand}
                        partType={prod?.identity.partType}
                        size={prod?.identity.size}
                        qualityGrade={rec.qualityGrade}
                      />
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono">
                      <div>{formatNumberDisplay(rec.historicalSold365d)}</div>
                      <div className="text-[10px] text-[var(--app-text-secondary)]">
                        {rec.avgDailyDemand}/يوم
                      </div>
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono">
                      <span className={rec.availableStock <= 0 ? 'font-bold text-rose-600' : ''}>
                        {formatNumberDisplay(rec.availableStock)}
                      </span>
                      {rec.incomingStock > 0 && (
                        <span className="ms-1 text-[10px] text-emerald-600">
                          (+{formatNumberDisplay(rec.incomingStock)})
                        </span>
                      )}
                    </td>
                    <td dir="ltr" className="p-2.5 text-center font-mono">
                      {formatNumberDisplay(rec.safetyStock)} / {formatNumberDisplay(rec.reorderPoint)}
                    </td>
                    <td className="p-2.5 text-center">
                      <input
                        type="number"
                        min={1}
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
                    <td className="p-2.5">
                      {rec.recommendedSupplier ? (
                        <div>
                          <div className="font-bold text-[var(--app-text)]">
                            {rec.recommendedSupplier.supplierName}
                          </div>
                          <div className="font-mono text-[10px] text-[var(--app-text-secondary)]">
                            آخر سعر: {formatCurrency(rec.recommendedSupplier.lastUnitPrice)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[var(--app-text-secondary)]">
                          لا يوجد سجل مورد سابق
                        </span>
                      )}
                    </td>
                    <td dir="ltr" className="p-2.5 text-end font-mono font-bold">
                      {formatCurrency(rec.estimatedCost)}
                    </td>
                    <td className="p-2.5 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <UrgencyBadge level={rec.urgency} />
                        <ConfidenceMeter score={rec.confidenceScore} />
                      </div>
                    </td>
                    <td className="p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailRec(rec);
                          }}
                          title="تفاصيل المعادلة والحساب"
                          className="rounded p-1 text-blue-600 hover:bg-blue-500/10"
                        >
                          <Info size={14} />
                        </button>
                        {localStatus ? (
                          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                            {localStatus}
                          </span>
                        ) : (
                          <>
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
                              variant="outline"
                              disabled={isDeciding}
                              onClick={() => {
                                void handleAction(rec, 'postponed');
                              }}
                              leftIcon={<Clock size={12} />}
                            >
                              تأجيل
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
                          </>
                        )}
                      </div>
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
        total={allFiltered.length}
        onPageChange={setPage}
      />

      <PurchaseBreakdownModal
        recommendation={detailRec}
        onClose={() => {
          setDetailRec(null);
        }}
      />
    </div>
  );
});
