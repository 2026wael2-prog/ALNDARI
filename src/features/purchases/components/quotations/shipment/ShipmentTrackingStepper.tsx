/* eslint-disable @typescript-eslint/no-unnecessary-condition, @typescript-eslint/restrict-template-expressions, max-lines-per-function, security/detect-object-injection */
import React from 'react';
import {
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  Truck,
  Warehouse,
} from 'lucide-react';
import type { ShipmentTrackingStage, ShipmentTimelineEvent } from '../../../types/shipment';

interface StepDefinition {
  stage: ShipmentTrackingStage;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}

const STAGE_ORDER: Record<ShipmentTrackingStage, number> = {
  pending_dispatch: 0,
  handed_to_office: 1,
  in_transit: 2,
  arrived_at_office: 3,
  received_at_warehouse: 4,
  cancelled: -1,
};

interface ShipmentTrackingStepperProps {
  currentStage: ShipmentTrackingStage;
  timeline?: ShipmentTimelineEvent[] | undefined;
  onSelectStage?: ((stage: ShipmentTrackingStage) => void) | undefined;
  interactive?: boolean | undefined;
  originCity?: string | undefined;
}

export const ShipmentTrackingStepper: React.FC<ShipmentTrackingStepperProps> = ({
  currentStage,
  timeline = [],
  onSelectStage,
  interactive = false,
  originCity = 'صنعاء',
}) => {
  const currentIndex = STAGE_ORDER[currentStage] ?? 0;

  const dynamicSteps: StepDefinition[] = [
    {
      stage: 'pending_dispatch',
      label: 'تجهيز المورد',
      description: `${originCity} — فرز وتعبئة الطرود`,
      icon: Package,
    },
    {
      stage: 'handed_to_office',
      label: `مكتب ${originCity}`,
      description: 'إصدار البوليصة وسند التسليم',
      icon: Clock,
    },
    {
      stage: 'in_transit',
      label: 'النقل البري',
      description: `خط ${originCity} ⟵ المهرة`,
      icon: Truck,
    },
    {
      stage: 'arrived_at_office',
      label: 'وصول مكتب المهرة',
      description: 'الغيضة / شحن (جاهزة للاستلام)',
      icon: MapPin,
    },
    {
      stage: 'received_at_warehouse',
      label: 'مستودع المنشأة',
      description: 'استلام وفحص وتوريد المخزن',
      icon: Warehouse,
    },
  ];

  return (
    <div className="w-full">
      {/* Visual Step Bar */}
      <div className="relative flex items-center justify-between">
        {/* Connecting Progress Line */}
        <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-gray-200 dark:bg-slate-700 -z-0" />
        <div
          className="absolute left-6 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 -z-0 transition-all duration-500"
          style={{
            width: `${Math.max(0, Math.min(100, (currentIndex / (dynamicSteps.length - 1)) * 100))}%`,
          }}
        />

        {dynamicSteps.map((step, idx) => {
          const isDone = currentIndex > idx;
          const isCurrent = currentIndex === idx;
          const IconComponent = step.icon;

          return (
            <button
              key={step.stage}
              type="button"
              disabled={!interactive}
              onClick={() => interactive && onSelectStage?.(step.stage)}
              className={`relative z-10 flex flex-col items-center group transition-transform ${
                interactive ? 'cursor-pointer hover:scale-105' : 'cursor-default'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs transition-colors shadow-md ${
                  isDone
                    ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 dark:ring-emerald-950/60'
                    : isCurrent
                      ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-950/60 animate-pulse'
                      : 'bg-white dark:bg-slate-800 text-gray-400 border-2 border-gray-300 dark:border-slate-600'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 size={20} className="stroke-[2.5]" />
                ) : (
                  <IconComponent size={18} />
                )}
              </div>
              <span
                className={`mt-2 text-xs font-bold text-center whitespace-nowrap ${
                  isCurrent
                    ? 'text-blue-600 dark:text-blue-400'
                    : isDone
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-gray-400 dark:text-slate-500'
                }`}
              >
                {step.label}
              </span>
              <span className="hidden sm:block text-[10px] text-gray-400 dark:text-slate-500 max-w-[90px] text-center truncate">
                {step.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Timeline Events Log if present */}
      {timeline.length > 0 && (
        <div className="mt-6 border-t border-gray-100 dark:border-slate-800 pt-4">
          <div className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
            <Clock size={14} className="text-blue-500" />
            سجل محطات خط السير البري
          </div>
          <div className="space-y-2 max-h-36 overflow-y-auto custom-scrollbar pr-1">
            {timeline
              .slice()
              .reverse()
              .map(event => (
                <div
                  key={event.id}
                  className="flex items-start justify-between gap-3 p-2 rounded-lg bg-gray-50 dark:bg-slate-800/60 text-xs border border-gray-100 dark:border-slate-700"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    <div>
                      <span className="font-bold text-gray-800 dark:text-slate-200">
                        {event.location}:
                      </span>{' '}
                      <span className="text-gray-600 dark:text-slate-400">{event.note}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-gray-400 flex-shrink-0" dir="ltr">
                    {event.timestamp ? new Date(event.timestamp).toLocaleDateString('ar-YE', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

