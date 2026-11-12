import React from 'react';
import { MapPin } from 'lucide-react';
import type { ShipmentTimelineEvent, TransitStation } from '@/features/purchases/types/shipment';

interface ShipmentTimelineTabProps {
  originCity: string;
  transitStations: TransitStation[];
  selectedStation: string;
  onSelectedStationChange: (station: string) => void;
  stationNote: string;
  onStationNoteChange: (note: string) => void;
  onAddCheckpoint: () => void;
  timeline: ShipmentTimelineEvent[];
}

export const ShipmentTimelineTab: React.FC<ShipmentTimelineTabProps> = ({
  originCity,
  transitStations,
  selectedStation,
  onSelectedStationChange,
  stationNote,
  onStationNoteChange,
  onAddCheckpoint,
  timeline,
}) => {
  return (
    <div className="space-y-6">
      {/* نموذج إضافة محطة جديدة */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-300">
          <MapPin size={16} />
          <span>تسجيل مرور بمحطة أو نقطة على طريق {originCity} ⟵ المهرة</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
              المحطة أو المدينة
            </label>
            <select
              value={selectedStation}
              onChange={e => onSelectedStationChange(e.target.value)}
              className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-medium"
            >
              {transitStations.map(st => (
                <option key={st.id} value={st.name}>
                  {st.name} ({st.province})
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
              ملاحظة المحطة (اختياري)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={stationNote}
                onChange={e => onStationNoteChange(e.target.value)}
                placeholder="مثال: عبرت نقطة التفتيش بسلام بدون توقف"
                className="flex-1 text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <button
                type="button"
                onClick={onAddCheckpoint}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <MapPin size={14} />
                تسجيل النقطة
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* السجل الزمني */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-gray-800 dark:text-slate-200">
          السجل التتبعي الكامل للإرسالية:
        </h4>
        {timeline.length === 0 ? (
          <div className="p-8 text-center border rounded-xl border-dashed border-gray-300 dark:border-slate-700 text-gray-400 text-xs">
            لم يتم تسجيل أي محطات حتى الآن. احفظ الشحنة ثم أضف المحطات أثناء انتقالها.
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:right-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-blue-200 dark:before:bg-blue-900/60">
            {timeline.map((event, idx) => (
              <div key={event.id || idx} className="relative pr-6 group">
                <div className="absolute right-1 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-blue-600 dark:border-slate-900 shadow-sm" />
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-800/80 border border-gray-100 dark:border-slate-700 text-xs">
                  <div className="flex items-center justify-between font-bold text-gray-900 dark:text-white">
                    <span>{event.location}</span>
                    <span className="font-mono text-[10px] text-gray-400" dir="ltr">
                      {event.timestamp ? new Date(event.timestamp).toLocaleString('ar-YE') : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-gray-600 dark:text-slate-300 text-xs">{event.note}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

