import React from 'react';
import {
  TABLE_COLOR_PRESETS,
  TABLE_FONT_OPTIONS,
  type TableFontWeight,
  type TableSettings,
} from '../tableSettingsStore';

interface TableColorsTabProps {
  settings: TableSettings;
  onUpdate: (patch: Partial<TableSettings>) => void;
}

const COLOR_FIELDS = [
  { key: 'headerBg', label: 'خلفية الترويسة', fallback: '#e5e7eb' },
  { key: 'headerText', label: 'نص الترويسة', fallback: '#0f172a' },
  { key: 'zebraBg', label: 'الصفوف المتناوبة', fallback: '#f8fafc' },
  { key: 'borderColor', label: 'حدود الشبكة', fallback: '#cbd5e1' },
  { key: 'hoverBg', label: 'لون التمرير', fallback: '#f0f9ff' },
] as const;

export const TableColorsTab: React.FC<TableColorsTabProps> = ({ settings, onUpdate }) => (
  <div className="space-y-4">
    <div>
      <div className="mb-2 font-bold">قوالب لونية جاهزة</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TABLE_COLOR_PRESETS.map(preset => {
          const isSelected =
            settings.headerBg === preset.headerBg && settings.borderColor === preset.borderColor;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onUpdate({
                  headerBg: preset.headerBg,
                  headerText: preset.headerText,
                  zebraBg: preset.zebraBg,
                  borderColor: preset.borderColor,
                  hoverBg: preset.hoverBg,
                });
              }}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-right font-bold transition-all ${
                isSelected
                  ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-slate-400"
                style={{ backgroundColor: preset.headerBg || '#f1f5f9' }}
              />
              <span className="truncate text-[11px]">{preset.name}</span>
            </button>
          );
        })}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {COLOR_FIELDS.map(item => (
        <label
          key={item.key}
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 font-bold"
        >
          <span className="text-[11px]">{item.label}</span>
          <input
            type="color"
            value={settings[item.key] || item.fallback}
            onChange={e => {
              onUpdate({ [item.key]: e.target.value });
            }}
            className="h-6 w-8 cursor-pointer rounded border border-slate-300 bg-transparent"
          />
        </label>
      ))}
    </div>
  </div>
);

interface TableFontsTabProps {
  settings: TableSettings;
  onUpdate: (patch: Partial<TableSettings>) => void;
}

const FONT_WEIGHT_OPTIONS: Array<{ value: TableFontWeight; label: string }> = [
  { value: '400', label: 'عادي' },
  { value: '600', label: 'متوسط' },
  { value: '700', label: 'عريض' },
  { value: '800', label: 'سميك' },
];

export const TableFontsTab: React.FC<TableFontsTabProps> = ({ settings, onUpdate }) => (
  <div className="space-y-4">
    <div>
      <div className="mb-1.5 font-bold">نوع الخط العربي للجدول</div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {TABLE_FONT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              onUpdate({ fontFamily: opt.value });
            }}
            style={{ fontFamily: opt.value }}
            className={`rounded-xl border px-3 py-2 text-right font-bold transition-all ${
              settings.fontFamily === opt.value
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>

    <div>
      <div className="mb-1.5 font-bold">سماكة الخط</div>
      <div className="grid grid-cols-4 gap-2">
        {FONT_WEIGHT_OPTIONS.map(w => (
          <button
            key={w.value}
            type="button"
            onClick={() => {
              onUpdate({ fontWeight: w.value });
            }}
            className={`rounded-xl border py-1.5 font-bold ${
              settings.fontWeight === w.value
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>

    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-bold">
      <span>محاذاة الأرقام المالية بدقة محاسبية (Tabular Nums)</span>
      <input
        type="checkbox"
        checked={settings.tabularNums}
        onChange={e => {
          onUpdate({ tabularNums: e.target.checked });
        }}
      />
    </label>
  </div>
);
