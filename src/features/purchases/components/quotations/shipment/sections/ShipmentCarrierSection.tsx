import React from 'react';
import { Building2, Plus } from 'lucide-react';
import type { CarrierOption } from '@/features/purchases/types/shipment';

interface ShipmentCarrierSectionProps {
  carriers: CarrierOption[];
  selectedCarrierId: string;
  onCarrierChange: (id: string) => void;
  shippingCompany: string;
  onShippingCompanyChange: (name: string) => void;
  originCity: string;
  originHub: string;
  onOriginHubChange: (hub: string) => void;
  waybillNumber: string;
  onWaybillNumberChange: (num: string) => void;
  officePhone: string;
  onOfficePhoneChange: (phone: string) => void;
  destinationHub: string;
  onDestinationHubChange: (hub: string) => void;
  onOpenAddCarrierModal: () => void;
}

export const ShipmentCarrierSection: React.FC<ShipmentCarrierSectionProps> = ({
  carriers,
  selectedCarrierId,
  onCarrierChange,
  shippingCompany,
  onShippingCompanyChange,
  originCity,
  originHub,
  onOriginHubChange,
  waybillNumber,
  onWaybillNumberChange,
  officePhone,
  onOfficePhoneChange,
  destinationHub,
  onDestinationHubChange,
  onOpenAddCarrierModal,
}) => {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-4 dark:border-blue-900/30 dark:bg-blue-950/10 space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300">
        <Building2 size={16} />
        <span>شركة الشحن ومكتب الإرسالية</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300">
              مكتب / شركة الشحن (من قاعدة البيانات) *
            </label>
            <button
              type="button"
              onClick={onOpenAddCarrierModal}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors cursor-pointer"
              title="إضافة مكتب شحن جديد وحفظه في سوبابيز"
            >
              <Plus size={12} className="stroke-[2.5]" />
              <span>مكتب جديد</span>
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={selectedCarrierId}
              onChange={e => onCarrierChange(e.target.value)}
              className="flex-1 min-w-0 text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-medium"
            >
              <option value="other">-- كتابة اسم مكتب / شركة شحن أخرى --</option>
              {carriers.map(carrier => (
                <option key={carrier.id} value={carrier.id}>
                  {carrier.name} {carrier.phone ? `(${carrier.phone})` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onOpenAddCarrierModal}
              title="إضافة مكتب أو شركة شحن جديدة وحفظها في قاعدة البيانات"
              className="shrink-0 p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center transition-colors shadow-sm cursor-pointer"
            >
              <Plus size={14} className="stroke-[2.5]" />
            </button>
          </div>
        </div>

        {selectedCarrierId === 'other' ? (
          <div>
            <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
              اسم مكتب النقل *
            </label>
            <input
              type="text"
              value={shippingCompany}
              onChange={e => onShippingCompanyChange(e.target.value)}
              placeholder="اكتب اسم المكتب / السائق..."
              className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        ) : (
          <div>
            <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
              فرع {originCity || 'الانطلاق'} / نقطة الإرسال
            </label>
            <input
              type="text"
              value={originHub}
              onChange={e => onOriginHubChange(e.target.value)}
              placeholder={`مثال: فرع ${originCity} / المركز الرئيسي`}
              className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        )}

        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
            رقم البوليصة / سند الإرسالية *
          </label>
          <input
            type="text"
            value={waybillNumber}
            onChange={e => onWaybillNumberChange(e.target.value)}
            placeholder="مثال: BL-98402"
            required
            className="w-full text-xs font-mono font-bold rounded-lg border border-blue-300 bg-white p-2 text-blue-700 dark:border-blue-700 dark:bg-slate-800 dark:text-blue-300"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
            هاتف مكتب الشحن
          </label>
          <input
            type="text"
            value={officePhone}
            onChange={e => onOfficePhoneChange(e.target.value)}
            placeholder="هاتف الاستفسار والمتابعة..."
            className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
            مكتب الوصول بالمهرة
          </label>
          <input
            type="text"
            value={destinationHub}
            onChange={e => onDestinationHubChange(e.target.value)}
            placeholder="مثال: الغيضة - شارع المطار"
            className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
      </div>
    </div>
  );
};

