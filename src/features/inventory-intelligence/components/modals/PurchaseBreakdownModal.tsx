import React, { useEffect } from 'react';
import type { PurchaseRecommendation } from '../../types';
import Modal from '../../../../ui/base/Modal';

interface Props {
  recommendation: PurchaseRecommendation | null;
  onClose: () => void;
}

export const PurchaseBreakdownModal: React.FC<Props> = ({ recommendation, onClose }) => {
  useEffect(() => {
    if (!recommendation) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [recommendation, onClose]);

  if (!recommendation) return null;
  const b = recommendation.calculationBreakdown;

  return (
    <Modal
      isOpen={Boolean(recommendation)}
      onClose={onClose}
      title={`تفاصيل احتساب الشراء: ${recommendation.productName}`}
      size="md"
    >
      <div className="space-y-3 text-xs">
        <p className="rounded-lg bg-blue-500/10 p-2.5 font-bold text-blue-700 dark:text-blue-300">
          {recommendation.reason}
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--app-border)] p-3 font-mono">
          <div>الطلب المتوقع (التوريد + المراجعة):</div>
          <div dir="ltr" className="text-end font-bold">{b.forecastDemandLeadAndReview}</div>
          <div>مخزون الأمان (Safety Stock):</div>
          <div dir="ltr" className="text-end font-bold">{b.safetyStock}</div>
          <div>نقطة إعادة الطلب (ROP):</div>
          <div dir="ltr" className="text-end font-bold">{b.reorderPoint}</div>
          <div>المخزون المتاح الحالي:</div>
          <div dir="ltr" className="text-end font-bold">{b.availableStock}</div>
          <div>الكمية الواردة (أوامر مفتوحة):</div>
          <div dir="ltr" className="text-end font-bold">{b.incomingStock}</div>
          <div>إمكانية التغطية بالتحويل الداخلي:</div>
          <div dir="ltr" className="text-end font-bold">{b.netPendingTransfers}</div>
          <div>مضاعف العبوة / MOQ:</div>
          <div dir="ltr" className="text-end font-bold">
            x{b.packageMultipleApplied} / MOQ {b.moqApplied}
          </div>
          <div className="border-t pt-2 font-bold">الكمية النهائية الموصى بشرائها:</div>
          <div dir="ltr" className="border-t pt-2 text-end text-sm font-bold text-emerald-600">
            {b.finalRecommendedQty}
          </div>
        </div>
      </div>
    </Modal>
  );
};
