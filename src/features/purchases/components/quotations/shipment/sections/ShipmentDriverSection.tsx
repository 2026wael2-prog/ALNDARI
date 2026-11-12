import React from 'react';
import { User } from 'lucide-react';
import type { DriverOption } from '@/features/purchases/types/shipment';

interface ShipmentDriverSectionProps {
  drivers: DriverOption[];
  selectedDriverId: string;
  onDriverChange: (id: string) => void;
  driverName: string;
  onDriverNameChange: (name: string) => void;
  driverPhone: string;
  onDriverPhoneChange: (phone: string) => void;
  vehiclePlateNumber: string;
  onVehiclePlateNumberChange: (plate: string) => void;
  vehicleType: string;
  onVehicleTypeChange: (type: string) => void;
}

export const ShipmentDriverSection: React.FC<ShipmentDriverSectionProps> = ({
  drivers,
  selectedDriverId,
  onDriverChange,
  driverName,
  onDriverNameChange,
  driverPhone,
  onDriverPhoneChange,
  vehiclePlateNumber,
  onVehiclePlateNumberChange,
  vehicleType,
  onVehicleTypeChange,
}) => {
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-800 dark:text-slate-200">
          <User size={16} className="text-indigo-600 dark:text-indigo-400" />
          <span>بيانات السائق والشاحنة الناقلة (قاعدة البيانات)</span>
        </div>
        {drivers.length > 0 && (
          <span className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">
            متوفر {drivers.length} سائق معتمد
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
            اختيار سائق مسجل
          </label>
          <select
            value={selectedDriverId}
            onChange={e => onDriverChange(e.target.value)}
            className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-medium"
          >
            <option value="other">-- سائق آخر (إدخال يدوي) --</option>
            {drivers.map(d => (
              <option key={d.id} value={d.id}>
                {d.name} {d.phone ? `(${d.phone})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
            اسم السائق *
          </label>
          <input
            type="text"
            value={driverName}
            onChange={e => onDriverNameChange(e.target.value)}
            placeholder="اسم سائق الرحلة"
            className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
            رقم هاتف السائق
          </label>
          <input
            type="text"
            value={driverPhone}
            onChange={e => onDriverPhoneChange(e.target.value)}
            placeholder="770000000"
            className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-right"
            dir="ltr"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
            رقم اللوحة
          </label>
          <input
            type="text"
            value={vehiclePlateNumber}
            onChange={e => onVehiclePlateNumberChange(e.target.value)}
            placeholder="مثال: 12450 / نقل"
            className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
            نوع المركبة
          </label>
          <select
            value={vehicleType}
            onChange={e => onVehicleTypeChange(e.target.value)}
            className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="شاحنة نقل (دينا)">شاحنة نقل (دينا)</option>
            <option value="هيلكس نقل">هيلكس نقل</option>
            <option value="قاطرة / تريلا">قاطرة / تريلا</option>
            <option value="شاحنة متوسطة">شاحنة متوسطة</option>
            <option value="ونيت / شاص">ونيت / شاص</option>
            <option value="باص نقل بضائع">باص نقل بضائع</option>
          </select>
        </div>
      </div>
    </div>
  );
};

