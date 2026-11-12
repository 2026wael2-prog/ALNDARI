import React from 'react';
import { Package, DollarSign } from 'lucide-react';
import type { ShippingPaymentMethod } from '@/features/purchases/types/shipment';

interface ShipmentPackageSectionProps {
  parcelCount: number;
  onParcelCountChange: (count: number) => void;
  weightKg: number;
  onWeightKgChange: (weight: number) => void;
  destinationWarehouseId: string;
  onDestinationWarehouseIdChange: (id: string) => void;
  destinationBranchId: string;
  warehouses: Array<{
    id: string;
    name?: string;
    name_ar?: string;
    is_primary?: boolean | null;
    branch_id?: string | null;
  }>;
  branches: Array<{ id: string; name: string }>;
  cargoDescription: string;
  onCargoDescriptionChange: (desc: string) => void;
  shippingCost: number;
  onShippingCostChange: (cost: number) => void;
  shippingCurrency: string;
  onShippingCurrencyChange: (curr: string) => void;
  paymentMethod: ShippingPaymentMethod;
  onPaymentMethodChange: (pm: ShippingPaymentMethod) => void;
  shippingDate: string;
  onShippingDateChange: (date: string) => void;
  expectedArrivalDate: string;
  onExpectedArrivalDateChange: (date: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
}

export const ShipmentPackageSection: React.FC<ShipmentPackageSectionProps> = ({
  parcelCount,
  onParcelCountChange,
  weightKg,
  onWeightKgChange,
  destinationWarehouseId,
  onDestinationWarehouseIdChange,
  destinationBranchId,
  warehouses,
  branches,
  cargoDescription,
  onCargoDescriptionChange,
  shippingCost,
  onShippingCostChange,
  shippingCurrency,
  onShippingCurrencyChange,
  paymentMethod,
  onPaymentMethodChange,
  shippingDate,
  onShippingDateChange,
  expectedArrivalDate,
  onExpectedArrivalDateChange,
  notes,
  onNotesChange,
}) => {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* تفاصيل الطرود */}
        <div className="rounded-xl border border-gray-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-800 dark:text-slate-200">
            <Package size={16} className="text-emerald-600 dark:text-emerald-400" />
            <span>الطرود ومستودع الاستلام</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                عدد الطرود (كرتون / طرد)
              </label>
              <input
                type="number"
                min="1"
                value={parcelCount}
                onChange={e => onParcelCountChange(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                الوزن التقريبي (كجم)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={weightKg}
                onChange={e => onWeightKgChange(parseFloat(e.target.value) || 0)}
                className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
              مستودع المهرة الوجهة *
            </label>
            <select
              value={destinationWarehouseId}
              onChange={e => onDestinationWarehouseIdChange(e.target.value)}
              className="w-full text-xs rounded-lg border border-emerald-300 bg-white p-2 text-emerald-800 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-300 font-semibold"
            >
              <option value="">-- اختر مستودع الاستلام بالمهرة --</option>
              {(destinationBranchId
                ? warehouses.filter(w => !w.branch_id || w.branch_id === destinationBranchId)
                : warehouses
              ).map(wh => {
                const whBranch = branches.find(b => b.id === wh.branch_id);
                const branchLabel = whBranch?.name ? ` — ${whBranch.name}` : '';
                return (
                  <option key={wh.id} value={wh.id}>
                    {wh.name_ar || wh.name || ''} {wh.is_primary ? '(الرئيسي)' : ''}
                    {branchLabel}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
              وصف المحتويات والقطع
            </label>
            <input
              type="text"
              value={cargoDescription}
              onChange={e => onCargoDescriptionChange(e.target.value)}
              placeholder="مثال: فلاتر زيت وهواء، مساعدات، أقمشة فرامل"
              className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>

        {/* أجور الشحن وطريقة الدفع والتواريخ */}
        <div className="rounded-xl border border-gray-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-800 dark:text-slate-200">
            <DollarSign size={16} className="text-amber-600 dark:text-amber-400" />
            <span>أجور الشحن وتواريخ الرحلة</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                أجور الشحن
              </label>
              <input
                type="number"
                min="0"
                value={shippingCost}
                onChange={e => onShippingCostChange(parseFloat(e.target.value) || 0)}
                className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                العملة
              </label>
              <select
                value={shippingCurrency}
                onChange={e => onShippingCurrencyChange(e.target.value)}
                className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-semibold"
              >
                <option value="YER">ريال يمني (YER)</option>
                <option value="SAR">ريال سعودي (SAR)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
              طريقة سداد أجور النقل
            </label>
            <select
              value={paymentMethod}
              onChange={e => onPaymentMethodChange(e.target.value as ShippingPaymentMethod)}
              className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="collect_on_delivery">دفع عند الاستلام في المهرة (COD)</option>
              <option value="prepaid_by_supplier">مدفوع مقدماً من المورد في صنعاء</option>
              <option value="on_company_account">مسجل على حساب المنشأة لدى مكتب الشحن</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                تاريخ تسليم المكتب
              </label>
              <input
                type="date"
                value={shippingDate}
                onChange={e => onShippingDateChange(e.target.value)}
                className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                تاريخ الوصول المتوقع
              </label>
              <input
                type="date"
                value={expectedArrivalDate}
                onChange={e => onExpectedArrivalDateChange(e.target.value)}
                className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ملاحظات إضافية */}
      <div>
        <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
          ملاحظات وتوجيهات خاصة بالشحنة
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="أي تعليمات خاصة بالاستلام أو فحص البضاعة أو متطلبات الفاتورة..."
          className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>
    </>
  );
};

