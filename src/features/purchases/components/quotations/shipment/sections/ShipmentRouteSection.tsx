import React from 'react';
import { Compass, GitBranch, Building2, Navigation } from 'lucide-react';
import { SHIPPING_CORRIDORS, type ShippingCorridorCode } from '@/features/purchases/types/shipment';

interface ShipmentRouteSectionProps {
  routeCode: ShippingCorridorCode;
  onCorridorChange: (code: ShippingCorridorCode) => void;
  requestingBranchId: string;
  onRequestingBranchIdChange: (id: string) => void;
  destinationBranchId: string;
  onDestinationBranchIdChange: (id: string) => void;
  branches: Array<{ id: string; name: string; is_main?: boolean | null }>;
  onSelectBranchWarehouse: (branchId: string) => void;
}

export const ShipmentRouteSection: React.FC<ShipmentRouteSectionProps> = ({
  routeCode,
  onCorridorChange,
  requestingBranchId,
  onRequestingBranchIdChange,
  destinationBranchId,
  onDestinationBranchIdChange,
  branches,
  onSelectBranchWarehouse,
}) => {
  return (
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-l from-indigo-50/40 via-white to-purple-50/30 p-4 dark:border-indigo-950/40 dark:bg-slate-900/50 space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 dark:text-indigo-300">
          <Compass size={16} className="text-indigo-600 dark:text-indigo-400" />
          <span>مسار الشحن البري وتحديد الفروع</span>
        </div>
        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold">
          المقصد النهائي: المهرة (الغيضة / شحن)
        </span>
      </div>

      {/* اختيار ممر ومسار الشحن */}
      <div>
        <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1.5">
          اختر خط السير والممر البري *
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {(Object.keys(SHIPPING_CORRIDORS) as ShippingCorridorCode[]).map(code => {
            const c = SHIPPING_CORRIDORS[code];
            const isSelected = routeCode === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => onCorridorChange(code)}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-600 text-white font-bold shadow-sm shadow-indigo-600/30'
                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <Navigation
                  size={13}
                  className={isSelected ? 'text-white mb-0.5' : 'text-indigo-500 mb-0.5'}
                />
                <span className="text-[10.5px] leading-tight font-bold">
                  {c.originCity || 'مخصص'}
                </span>
                <span className="text-[10px] opacity-80 mt-0.5">⟵ المهرة</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* تحديد الفروع: الفرع صاحب الطلب وفرع الوصول بالمهرة */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
            الفرع صاحب الطلب / المستفيد *
          </label>
          <div className="relative">
            <GitBranch
              size={15}
              className="absolute right-3 top-2.5 text-gray-400 pointer-events-none"
            />
            <select
              value={requestingBranchId}
              onChange={e => onRequestingBranchIdChange(e.target.value)}
              className="w-full text-xs rounded-lg border border-indigo-200 bg-white pr-9 pl-3 py-2 text-indigo-950 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-bold"
            >
              <option value="">-- اختر الفرع صاحب الطلب --</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.is_main ? '(الفرع الرئيسي)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
            فرع الاستلام والتوريد بالمهرة
          </label>
          <div className="relative">
            <Building2
              size={15}
              className="absolute right-3 top-2.5 text-gray-400 pointer-events-none"
            />
            <select
              value={destinationBranchId}
              onChange={e => {
                onDestinationBranchIdChange(e.target.value);
                onSelectBranchWarehouse(e.target.value);
              }}
              className="w-full text-xs rounded-lg border border-gray-200 bg-white pr-9 pl-3 py-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-medium"
            >
              <option value="">-- جميع فروع المهرة --</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.is_main ? '(الرئيسي)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

