import React from 'react';
import { Target } from 'lucide-react';
import { useTranslation } from '../../../lib/hooks/useTranslation';

interface Targets {
  salesProgress?: number;
  collectionRate?: number;
}

interface Props {
  targets?: Targets | null;
}

const SmartTargets: React.FC<Props> = ({ targets }) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 text-[var(--app-text)] transition-colors">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg bg-[var(--app-surface-hover)] p-2 text-[var(--accent)]">
          <Target size={16} />
        </div>
        <h3 className="text-xs font-bold">{t('monthly_targets')}</h3>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium text-[var(--app-text-secondary)]">
              {t('sales_target')}
            </span>
            <span className="font-mono text-[10px] font-bold">{targets?.salesProgress || 0}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--app-surface-hover)]">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-300"
              style={{ width: `${Math.min(100, targets?.salesProgress || 0)}%` }}
            ></div>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium text-[var(--app-text-secondary)]">
              {t('collection_rate')}
            </span>
            <span className="font-mono text-[10px] font-bold">
              {targets?.collectionRate || 0}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--app-surface-hover)]">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.min(100, targets?.collectionRate || 0)}%` }}
            ></div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] p-2.5">
        <p className="mb-0.5 text-[10px] font-bold text-[var(--accent)]">
          {t('financial_intelligence_alert')}
        </p>
        <p className="text-[11px] text-[var(--app-text)] leading-relaxed">
          {(targets?.salesProgress || 0) > 80
            ? 'أداء ممتاز، اقتربت المنشأة من تحقيق مستهدف المبيعات الشهري.'
            : 'معدل المبيعات الحالي يتطلب متابعة إضافية للوصول للهدف المحدد.'}
        </p>
      </div>
    </div>
  );
};

export default SmartTargets;
