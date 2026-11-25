import React from 'react';
import type { TableDensity, TableSettings } from '../tableSettingsStore';

interface TableLayoutTabProps {
  settings: TableSettings;
  onZoomChange: (nextZoom: number) => void;
  onUpdate: (patch: Partial<TableSettings>) => void;
}

const DENSITY_OPTIONS: Array<{ id: TableDensity; label: string }> = [
  { id: 'compact', label: 'مضغوط (محاسبي)' },
  { id: 'normal', label: 'متوازن' },
  { id: 'comfortable', label: 'واسع ومريح' },
];

export const TableLayoutTab: React.FC<TableLayoutTabProps> = ({
  settings,
  onZoomChange,
  onUpdate,
}) => (
  <div className="space-y-4">
    <div>
      <div className="mb-1 flex items-center justify-between font-bold">
        <span>نسبة التكبير والتصغير (Zoom)</span>
        <span className="font-mono text-slate-700">{Math.round(settings.zoom * 100)}%</span>
      </div>
      <input
        type="range"
        min={0.75}
        max={1.5}
        step={0.05}
        value={settings.zoom}
        onChange={e => {
          onZoomChange(parseFloat(e.target.value));
        }}
        className="w-full"
      />
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>75%</span>
        <span>100%</span>
        <span>125%</span>
        <span>150%</span>
      </div>
    </div>

    <div>
      <div className="mb-1 flex items-center justify-between font-bold">
        <span>حجم الخط داخل الجدول</span>
        <span className="font-mono text-slate-700">{settings.fontSize}px</span>
      </div>
      <input
        type="range"
        min={10}
        max={18}
        step={1}
        value={settings.fontSize}
        onChange={e => {
          onUpdate({ fontSize: Number(e.target.value) });
        }}
        className="w-full"
      />
    </div>

    <div>
      <div className="mb-1.5 font-bold">كثافة وارتفاع الصفوف</div>
      <div className="grid grid-cols-3 gap-2">
        {DENSITY_OPTIONS.map(d => (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              onUpdate({ density: d.id });
            }}
            className={`rounded-xl border py-2 font-bold transition-all ${
              settings.density === d.id
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>

    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-bold">
      <span>التفاف النصوص الطويلة تلقائياً داخل الخلايا</span>
      <input
        type="checkbox"
        checked={settings.wrapText}
        onChange={e => {
          onUpdate({ wrapText: e.target.checked });
        }}
      />
    </label>
  </div>
);
