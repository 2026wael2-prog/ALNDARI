import React, { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import type {
  PersistedRecommendationRecord,
  ProductIntelligenceSummary,
  RawCrossRefRow,
} from '../../types';
import { formatNumberDisplay } from '../../../../core/utils';
import Button from '../../../../ui/base/Button';
import { GRID_TABLE_CLASS } from '../shared/IntelligenceBadges';

interface Props {
  history: PersistedRecommendationRecord[];
  isLoading: boolean;
  products?: ProductIntelligenceSummary[];
  crossReferences?: RawCrossRefRow[];
  onReviewAlternative?: (params: { id: string; status: 'approved' | 'rejected' }) => Promise<void>;
  isReviewingAlternative?: boolean;
}

const STATUS_AR: Record<string, { label: string; cls: string }> = {
  approved: { label: 'معتمد', cls: 'bg-emerald-500/10 text-emerald-600' },
  modified: { label: 'معتمد بتعديل', cls: 'bg-blue-500/10 text-blue-600' },
  rejected: { label: 'مرفوض', cls: 'bg-rose-500/10 text-rose-600' },
  postponed: { label: 'مؤجل', cls: 'bg-amber-500/10 text-amber-600' },
  executed: { label: 'منفذ', cls: 'bg-indigo-500/10 text-indigo-600' },
  pending: { label: 'قيد المراجعة', cls: 'bg-slate-500/10 text-slate-600' },
};

export const DecisionHistoryTab: React.FC<Props> = React.memo(({
  history,
  isLoading,
  products = [],
  crossReferences = [],
  onReviewAlternative,
  isReviewingAlternative = false,
}) => {
  const crossRefRows = useMemo(() => {
    const productMap = new Map(products.map(p => [p.identity.productId, p.identity]));
    return crossReferences
      .map(rel => {
        const base = productMap.get(rel.base_product_id);
        const alt = productMap.get(rel.alternative_product_id);
        return {
          id: rel.id,
          baseName: base?.name ?? rel.base_product_id,
          baseBrand: base?.brand ?? '—',
          altName: alt?.name ?? rel.alternative_product_id,
          altBrand: alt?.brand ?? '—',
          relationshipType: rel.relationship_type ?? rel.match_quality ?? 'aftermarket_alternative',
          status: rel.status ?? 'approved',
          confidence: Number(rel.confidence ?? 100),
        };
      })
      .sort((a, b) => (a.status === 'pending_review' ? -1 : 1) - (b.status === 'pending_review' ? -1 : 1))
      .slice(0, 60);
  }, [products, crossReferences]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-8 text-center text-xs text-[var(--app-text-secondary)]">
        جاري تحميل سجل التوصيات والقرارات...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
        <div className="border-b border-[var(--app-border)] px-4 py-3 text-xs font-bold text-[var(--app-text)]">
          سجل قرارات التوصيات (التحويلات والشراء والمراجعة)
        </div>
        {history.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--app-text-secondary)]">
            لم تُسجل قرارات اعتماد أو رفض بعد. عند اعتماد أو رفض أي توصية شراء أو تحويل ستُوثق هنا تلقائياً.
          </div>
        ) : (
          <table className="w-full text-right text-xs">
        <thead className="border-b border-[var(--app-border)] bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
          <tr>
            <th className="p-2.5">النوع</th>
            <th className="p-2.5">السبب / التوصية</th>
            <th className="p-2.5 text-center">الكمية المقترحة</th>
            <th className="p-2.5 text-center">الكمية المعتمدة</th>
            <th className="p-2.5 text-center">الحالة</th>
            <th className="p-2.5">ملاحظة القرار</th>
            <th className="p-2.5 text-center">التاريخ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--app-border)]">
          {history.map(item => {
            const st = STATUS_AR[item.status] ?? STATUS_AR.pending;
            return (
              <tr key={item.id} className="hover:bg-[var(--app-surface-hover)]">
                <td className="p-2.5 font-bold">
                  {item.rec_type === 'transfer'
                    ? 'تحويل مخزون'
                    : item.rec_type === 'purchase'
                      ? 'طلب شراء'
                      : 'مراجعة راكد'}
                </td>
                <td className="max-w-[260px] p-2.5 text-[11px] text-[var(--app-text-secondary)]">
                  {item.reason}
                </td>
                <td dir="ltr" className="p-2.5 text-center font-mono">
                  {formatNumberDisplay(item.recommended_qty)}
                </td>
                <td dir="ltr" className="p-2.5 text-center font-mono font-bold">
                  {item.approved_qty !== null ? formatNumberDisplay(item.approved_qty) : '—'}
                </td>
                <td className="p-2.5 text-center">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>
                    {st.label}
                  </span>
                </td>
                <td className="p-2.5 text-[11px] text-[var(--app-text-secondary)]">
                  <div>{item.decision_reason || '—'}</div>
                  {item.linked_transfer_id && (
                    <div dir="ltr" className="mt-0.5 font-mono text-[10px] text-indigo-600">
                      Transfer: {item.linked_transfer_id.slice(0, 8)}
                    </div>
                  )}
                  {item.linked_po_id && (
                    <div dir="ltr" className="mt-0.5 font-mono text-[10px] text-emerald-600">
                      PO: {item.linked_po_id.slice(0, 8)}
                    </div>
                  )}
                </td>
                <td dir="ltr" className="p-2.5 text-center font-mono text-[10px]">
                  {new Date(item.decided_at || item.created_at).toLocaleDateString('ar-SA')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
        <div className="border-b border-[var(--app-border)] px-4 py-3 text-xs font-bold text-[var(--app-text)]">
          حوكمة ومراجعة البدائل المتوافقة (Cross-References)
        </div>
        {crossRefRows.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--app-text-secondary)]">
            لا توجد علاقات بدائل مسجلة للمراجعة حالياً.
          </div>
        ) : (
          <table className={GRID_TABLE_CLASS}>
            <thead className="bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
              <tr>
                <th className="p-2.5">القطعة الأساسية</th>
                <th className="p-2.5">البديل</th>
                <th className="p-2.5 text-center">نوع العلاقة</th>
                <th className="p-2.5 text-center">الثقة</th>
                <th className="p-2.5 text-center">الحالة</th>
                <th className="p-2.5 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--app-border)]">
              {crossRefRows.map(rel => (
                <tr key={rel.id} className="hover:bg-[var(--app-surface-hover)]">
                  <td className="p-2.5">
                    <div className="font-bold text-[var(--app-text)]">{rel.baseName}</div>
                    <div className="text-[10px] text-[var(--app-text-secondary)]">{rel.baseBrand}</div>
                  </td>
                  <td className="p-2.5">
                    <div className="font-bold text-[var(--app-text)]">{rel.altName}</div>
                    <div className="text-[10px] text-[var(--app-text-secondary)]">{rel.altBrand}</div>
                  </td>
                  <td className="p-2.5 text-center font-mono text-[11px]">{rel.relationshipType}</td>
                  <td dir="ltr" className="p-2.5 text-center font-mono">{rel.confidence}%</td>
                  <td className="p-2.5 text-center">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        rel.status === 'approved'
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : rel.status === 'rejected'
                            ? 'bg-rose-500/10 text-rose-600'
                            : 'bg-amber-500/10 text-amber-600'
                      }`}
                    >
                      {rel.status === 'approved'
                        ? 'معتمد'
                        : rel.status === 'rejected'
                          ? 'مرفوض'
                          : 'بانتظار المراجعة'}
                    </span>
                  </td>
                  <td className="p-2.5 text-center">
                    {onReviewAlternative && (
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant="success"
                          disabled={isReviewingAlternative || rel.status === 'approved'}
                          onClick={() => {
                            void onReviewAlternative({ id: rel.id, status: 'approved' });
                          }}
                          leftIcon={<Check size={12} />}
                        >
                          اعتماد
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={isReviewingAlternative || rel.status === 'rejected'}
                          onClick={() => {
                            void onReviewAlternative({ id: rel.id, status: 'rejected' });
                          }}
                          leftIcon={<X size={12} />}
                        >
                          رفض
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
});
