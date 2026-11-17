import React from 'react';
import { Award } from 'lucide-react';
import type { ForecastModelName, IntelligenceRunSummary, ModelEvaluationAggregate } from '../../types';
import { formatNumberDisplay } from '../../../../core/utils';
import { GRID_TABLE_CLASS } from '../shared/IntelligenceBadges';

interface Props {
  evaluations: ModelEvaluationAggregate[];
  championModel: ForecastModelName;
  runs: IntelligenceRunSummary[];
}

export const ModelPerformanceTab: React.FC<Props> = ({
  evaluations,
  championModel,
  runs,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-600">
            <Award size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--app-text)]">
              النموذج البطل الحالي (Champion Model):{' '}
              <span className="font-mono text-blue-600 dark:text-blue-400">{championModel}</span>
            </h3>
            <p className="text-xs text-[var(--app-text-secondary)]">
              تم اختيار النموذج بناءً على الاختبار التاريخي المتدحرج (Walk-Forward Backtesting) باستخدام MAE وWAPE وForecast Bias
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
        <table className={GRID_TABLE_CLASS}>
          <thead className="bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
            <tr>
              <th className="p-2.5">النموذج</th>
              <th className="p-2.5 text-center">الإصدار</th>
              <th className="p-2.5 text-center">متوسط الخطأ المطلق (MAE)</th>
              <th className="p-2.5 text-center">نسبة الخطأ المرجحة (WAPE)</th>
              <th className="p-2.5 text-center">انحياز التوقع (Bias)</th>
              <th className="p-2.5 text-center">عينات الاختبار</th>
              <th className="p-2.5 text-center">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {evaluations.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--app-text-secondary)]">
                  لا تتوفر عينات تاريخية كافية للاختبار المتدحرج بعد.
                </td>
              </tr>
            ) : (
              evaluations.map(ev => (
                <tr key={ev.modelName} className="hover:bg-[var(--app-surface-hover)]">
                  <td dir="ltr" className="p-2.5 text-right font-mono font-bold text-[var(--app-text)]">
                    {ev.modelName}
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono text-[11px]">
                    {ev.modelVersion}
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono">
                    {ev.mae}
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono font-bold">
                    {ev.wape}%
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono">
                    <span className={Math.abs(ev.forecastBias) <= 15 ? 'text-emerald-600' : 'text-amber-600'}>
                      {ev.forecastBias > 0 ? '+' : ''}
                      {ev.forecastBias}%
                    </span>
                  </td>
                  <td dir="ltr" className="p-2.5 text-center font-mono">
                    {formatNumberDisplay(ev.sampleCount)}
                  </td>
                  <td className="p-2.5 text-center">
                    {ev.isChampion ? (
                      <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                        نموذج بطل
                      </span>
                    ) : (
                      <span className="rounded-md bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        منافس
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {runs.length > 0 && (
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
          <h4 className="mb-2 text-xs font-bold text-[var(--app-text)]">سجل دورات التدريب والتحليل</h4>
          <div className="space-y-1.5 text-xs">
            {runs.slice(0, 5).map(r => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded border border-[var(--app-border)] px-3 py-2"
              >
                <span className="font-mono">{new Date(r.started_at).toLocaleString('ar-SA')}</span>
                <span>أصناف: {r.products_analyzed} • بطل: {r.champion_model || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
