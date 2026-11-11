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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* 1. قيد النقل البري */}
      <button
        type="button"
        onClick={() => onFilterStage?.(selectedStage === 'in_transit' ? 'all' : 'in_transit')}
        className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
          selectedStage === 'in_transit'
            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-900/30 ring-2 ring-blue-500/20'
            : 'border-gray-200/80 bg-[var(--app-surface)] hover:border-blue-300 dark:border-slate-800'
        }`}
      >
        <div>
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">
            شحنات على الطريق البري
          </span>
          <span className="font-mono text-xl font-bold text-blue-600 dark:text-blue-400">
            {inTransitCount}
          </span>
          <span className="text-[10px] text-gray-400 block mt-0.5">خط صنعاء ➔ المهرة</span>
        </div>
        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
          <Truck size={20} />
        </div>
      </button>

      {/* 2. وصلت مكاتب المهرة */}
      <button
        type="button"
        onClick={() => onFilterStage?.(selectedStage === 'arrived_at_office' ? 'all' : 'arrived_at_office')}
        className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
          selectedStage === 'arrived_at_office'
            ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-900/30 ring-2 ring-amber-500/20'
            : 'border-gray-200/80 bg-[var(--app-surface)] hover:border-amber-300 dark:border-slate-800'
        }`}
      >
        <div>
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">
            وصلت مكاتب الشحن بالمهرة
          </span>
          <span className="font-mono text-xl font-bold text-amber-600 dark:text-amber-400">
            {arrivedOfficeCount}
          </span>
          <span className="text-[10px] text-gray-400 block mt-0.5">الغيضة / شحن بانتظار الاستلام</span>
        </div>
        <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <MapPin size={20} />
        </div>
      </button>

      {/* 3. استلمت في المستودع */}
      <button
        type="button"
        onClick={() => onFilterStage?.(selectedStage === 'received_at_warehouse' ? 'all' : 'received_at_warehouse')}
        className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
          selectedStage === 'received_at_warehouse'
            ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-900/30 ring-2 ring-emerald-500/20'
            : 'border-gray-200/80 bg-[var(--app-surface)] hover:border-emerald-300 dark:border-slate-800'
        }`}
      >
        <div>
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">
            تم الاستلام والفحص بالمستودع
          </span>
          <span className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {receivedCount}
          </span>
          <span className="text-[10px] text-gray-400 block mt-0.5">جاهزة أو حُوّلت لمشتريات</span>
        </div>
        <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={20} />
        </div>
      </button>

      {/* 4. إجمالي أجور الشحن المقدرة */}
      <div className="p-3 rounded-xl border border-gray-200/80 bg-[var(--app-surface)] text-right flex items-center justify-between dark:border-slate-800">
        <div>
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">
            إجمالي أجور النقل التقديرية
          </span>
          <span className="font-mono text-base font-bold text-purple-600 dark:text-purple-400" dir="ltr">
            {formatCurrency(totalShippingCostYer, 'YER')}
          </span>
          <span className="text-[10px] text-gray-400 block mt-0.5">لكل الشحنات المسجلة</span>
        </div>
        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 dark:text-purple-400">
          <DollarSign size={20} />
        </div>
      </div>
    </div>
  );
};

