/* eslint-disable max-lines-per-function */
import React from 'react';
import { Truck, MapPin, CheckCircle2, DollarSign } from 'lucide-react';
import type { PurchaseQuotationShipment } from '../../../types/shipment';
import { formatCurrency } from '../../../../../core/utils';

interface ShipmentsKpiWidgetProps {
  shipments: PurchaseQuotationShipment[];
  onFilterStage?: ((stage: string) => void) | undefined;
  selectedStage?: string | undefined;
}

export const ShipmentsKpiWidget: React.FC<ShipmentsKpiWidgetProps> = ({
  shipments,
  onFilterStage,
  selectedStage,
}) => {
  const inTransitCount = shipments.filter(
    s => s.tracking_status === 'in_transit' || s.tracking_status === 'handed_to_office'
  ).length;

  const arrivedOfficeCount = shipments.filter(
    s => s.tracking_status === 'arrived_at_office'
  ).length;

  const receivedCount = shipments.filter(
    s => s.tracking_status === 'received_at_warehouse'
  ).length;

  const totalShippingCostYer = shipments.reduce((sum, s) => {
    if (s.shipping_currency === 'SAR') {
      return sum + s.shipping_cost * 410; // تقريبي تحويلي أو إحصائي
    }
    return sum + (s.shipping_cost || 0);
  }, 0);

  return (
    <div className="grid grid-cols-4 gap-1 sm:gap-3">
      {/* 1. قيد النقل البري */}
      <button
        type="button"
        onClick={() => onFilterStage?.(selectedStage === 'in_transit' ? 'all' : 'in_transit')}
        className={`flex min-w-0 items-center justify-between rounded-lg border p-1.5 text-right transition-all sm:rounded-xl sm:p-3 ${
          selectedStage === 'in_transit'
            ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/20 dark:bg-blue-900/30'
            : 'border-gray-200/80 bg-[var(--app-surface)] hover:border-blue-300 dark:border-slate-800'
        }`}
      >
        <div className="min-w-0">
          <span className="block truncate text-[10px] font-bold text-gray-500 dark:text-gray-400 sm:text-[11px] sm:font-medium">
            على الطريق
          </span>
          <span className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400 sm:text-xl">
            {inTransitCount}
          </span>
          <span className="mt-0.5 hidden text-[10px] text-gray-400 sm:block">خط صنعاء ➔ المهرة</span>
        </div>
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 sm:flex">
          <Truck size={18} />
        </div>
      </button>

      {/* 2. وصلت مكاتب المهرة */}
      <button
        type="button"
        onClick={() => onFilterStage?.(selectedStage === 'arrived_at_office' ? 'all' : 'arrived_at_office')}
        className={`flex min-w-0 items-center justify-between rounded-lg border p-1.5 text-right transition-all sm:rounded-xl sm:p-3 ${
          selectedStage === 'arrived_at_office'
            ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-500/20 dark:bg-amber-900/30'
            : 'border-gray-200/80 bg-[var(--app-surface)] hover:border-amber-300 dark:border-slate-800'
        }`}
      >
        <div className="min-w-0">
          <span className="block truncate text-[10px] font-bold text-gray-500 dark:text-gray-400 sm:text-[11px] sm:font-medium">
            بالمكاتب
          </span>
          <span className="font-mono text-sm font-bold text-amber-600 dark:text-amber-400 sm:text-xl">
            {arrivedOfficeCount}
          </span>
          <span className="mt-0.5 hidden text-[10px] text-gray-400 sm:block">الغيضة / شحن بانتظار الاستلام</span>
        </div>
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 sm:flex">
          <MapPin size={18} />
        </div>
      </button>

      {/* 3. استلمت في المستودع */}
      <button
        type="button"
        onClick={() => onFilterStage?.(selectedStage === 'received_at_warehouse' ? 'all' : 'received_at_warehouse')}
        className={`flex min-w-0 items-center justify-between rounded-lg border p-1.5 text-right transition-all sm:rounded-xl sm:p-3 ${
          selectedStage === 'received_at_warehouse'
            ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20 dark:bg-emerald-900/30'
            : 'border-gray-200/80 bg-[var(--app-surface)] hover:border-emerald-300 dark:border-slate-800'
        }`}
      >
        <div className="min-w-0">
          <span className="block truncate text-[10px] font-bold text-gray-500 dark:text-gray-400 sm:text-[11px] sm:font-medium">
            بالمستودع
          </span>
          <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 sm:text-xl">
            {receivedCount}
          </span>
          <span className="mt-0.5 hidden text-[10px] text-gray-400 sm:block">جاهزة أو حُوّلت لمشتريات</span>
        </div>
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 sm:flex">
          <CheckCircle2 size={18} />
        </div>
      </button>

      {/* 4. إجمالي أجور الشحن المقدرة */}
      <div className="flex min-w-0 items-center justify-between rounded-lg border border-gray-200/80 bg-[var(--app-surface)] p-1.5 text-right dark:border-slate-800 sm:rounded-xl sm:p-3">
        <div className="min-w-0">
          <span className="block truncate text-[10px] font-bold text-gray-500 dark:text-gray-400 sm:text-[11px] sm:font-medium">
            أجور النقل
          </span>
          <span className="block truncate font-mono text-[10.5px] font-bold text-purple-600 dark:text-purple-400 sm:text-base" dir="ltr">
            {formatCurrency(totalShippingCostYer, 'YER')}
          </span>
          <span className="mt-0.5 hidden text-[10px] text-gray-400 sm:block">لكل الشحنات المسجلة</span>
        </div>
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 sm:flex">
          <DollarSign size={18} />
        </div>
      </div>
    </div>
  );
};

