import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import type { BranchInfo, EngineConfig, ForecastModelName } from '../../types';
import Button from '../../../../ui/base/Button';
import { BranchStrategiesTable } from '../settings/BranchStrategiesTable';

interface Props {
  config: EngineConfig;
  branches?: BranchInfo[];
  onSave: (config: EngineConfig) => Promise<unknown>;
  isSaving: boolean;
}

export const EngineSettingsTab: React.FC<Props> = ({
  config,
  branches = [],
  onSave,
  isSaving,
}) => {
  const [form, setForm] = useState<EngineConfig>(config);

  useEffect(() => {
    setForm(config);
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(form);
  };

  return (
    <form
      onSubmit={e => {
        void handleSubmit(e);
      }}
      className="space-y-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--app-text)]">
            مدة التوريد الافتراضية (أيام)
          </label>
          <input
            type="number"
            min={1}
            max={180}
            value={form.default_lead_time_days}
            onChange={e => {
              setForm(p => ({ ...p, default_lead_time_days: Math.max(1, Number(e.target.value) || 14) }));
            }}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 font-mono text-xs"
            dir="ltr"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--app-text)]">
            دورة مراجعة الشراء (أيام)
          </label>
          <input
            type="number"
            min={1}
            max={90}
            value={form.review_period_days}
            onChange={e => {
              setForm(p => ({ ...p, review_period_days: Math.max(1, Number(e.target.value) || 14) }));
            }}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 font-mono text-xs"
            dir="ltr"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--app-text)]">
            مستوى خدمة مخزون الأمان
          </label>
          <select
            value={form.safety_stock_service_level}
            onChange={e => {
              setForm(p => ({ ...p, safety_stock_service_level: Number(e.target.value) }));
            }}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-xs font-bold"
          >
            <option value={0.9}>90% (عادي)</option>
            <option value={0.95}>95% (موصى به)</option>
            <option value={0.98}>98% (عالي)</option>
            <option value={0.99}>99% (حرج)</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--app-text)]">
            التغطية المستهدفة للفرع (أيام)
          </label>
          <input
            type="number"
            min={7}
            max={365}
            value={form.target_coverage_days}
            onChange={e => {
              setForm(p => ({ ...p, target_coverage_days: Math.max(7, Number(e.target.value) || 45) }));
            }}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 font-mono text-xs"
            dir="ltr"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--app-text)]">
            عتبة المخزون الراكد (أيام)
          </label>
          <input
            type="number"
            min={30}
            max={730}
            value={form.dead_stock_days_threshold}
            onChange={e => {
              setForm(p => ({ ...p, dead_stock_days_threshold: Math.max(30, Number(e.target.value) || 120) }));
            }}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 font-mono text-xs"
            dir="ltr"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--app-text)]">
            عتبة النمو المتسارع (%)
          </label>
          <input
            type="number"
            min={5}
            max={300}
            value={form.growth_rate_threshold}
            onChange={e => {
              setForm(p => ({ ...p, growth_rate_threshold: Math.max(5, Number(e.target.value) || 25) }));
            }}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 font-mono text-xs"
            dir="ltr"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--app-text)]">
            النموذج المفضل للتنبؤ
          </label>
          <select
            value={form.preferred_model}
            onChange={e => {
              setForm(p => ({ ...p, preferred_model: e.target.value as ForecastModelName | 'auto' }));
            }}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-xs font-bold"
          >
            <option value="auto">اختيار آلي حسب الاختبار التاريخي (موصى به)</option>
            <option value="WMA">Weighted Moving Average (WMA)</option>
            <option value="SES">Exponential Smoothing (SES)</option>
            <option value="SMA">Simple Moving Average (SMA)</option>
            <option value="Croston">Croston (طلب متقطع)</option>
            <option value="SBA">SBA (طلب متقطع مصحح)</option>
            <option value="TSB">TSB (طلب متقطع متناقص)</option>
            <option value="LinearTrendRidge">Linear Trend Ridge (اتجاهي)</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--app-text)]">
            جدولة التحليل التلقائي
          </label>
          <select
            value={form.analysis_schedule}
            onChange={e => {
              setForm(p => ({
                ...p,
                analysis_schedule: e.target.value as EngineConfig['analysis_schedule'],
              }));
            }}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-xs font-bold"
          >
            <option value="hourly">كل ساعة</option>
            <option value="daily">يومياً</option>
            <option value="weekly">أسبوعياً</option>
            <option value="manual">يدوياً فقط</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--app-text)]">
            عتبة بطء الحركة (أيام)
          </label>
          <input
            type="number"
            min={14}
            max={365}
            value={form.slow_moving_days_threshold}
            onChange={e => {
              setForm(p => ({ ...p, slow_moving_days_threshold: Math.max(14, Number(e.target.value) || 60) }));
            }}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 font-mono text-xs"
            dir="ltr"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--app-text)]">
            معيار طفرة الطلب (Z-Score)
          </label>
          <input
            type="number"
            step="0.1"
            min={1.2}
            max={5}
            value={form.spike_zscore_threshold}
            onChange={e => {
              setForm(p => ({ ...p, spike_zscore_threshold: Math.max(1.2, Number(e.target.value) || 2.5) }));
            }}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 font-mono text-xs"
            dir="ltr"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--app-text)]">
            الحد الأدنى للطلب الافتراضي (MOQ)
          </label>
          <input
            type="number"
            min={1}
            max={500}
            value={form.min_order_qty_default}
            onChange={e => {
              setForm(p => ({ ...p, min_order_qty_default: Math.max(1, Number(e.target.value) || 1) }));
            }}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 font-mono text-xs"
            dir="ltr"
          />
        </div>
      </div>

      <BranchStrategiesTable
        branches={branches}
        strategies={form.branch_strategies}
        onChangeStrategy={(branchId, next) => {
          setForm(p => ({
            ...p,
            branch_strategies: {
              ...(p.branch_strategies ?? {}),
              [branchId]: next,
            },
          }));
        }}
      />

      <div className="flex justify-end border-t border-[var(--app-border)] pt-3">
        <Button
          type="submit"
          variant="primary"
          isLoading={isSaving}
          leftIcon={<Save size={14} />}
        >
          حفظ السياسات وإعادة التحليل
        </Button>
      </div>
    </form>
  );
};
