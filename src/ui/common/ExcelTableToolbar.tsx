import React from 'react';
import { FileSpreadsheet, RotateCcw, Minimize2, Maximize2, Minus, Plus, Hand } from 'lucide-react';
import { cn } from '../../core/utils';
import SearchInput from '../../ui/components/SearchInput';

interface ExcelTableToolbarProps {
  title?: string | undefined;
  currentTheme: { accent: string };
  showSearch: boolean;
  internalSearch: string;
  setInternalSearch: (v: string) => void;
  isRTL: boolean;
  onExport?: (() => void) | undefined;
  enableResize: boolean;
  handleResetSize: () => void;
  isZoomed: boolean;
  setIsZoomed: (v: boolean) => void;
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  isPanMode?: boolean;
  onTogglePanMode?: () => void;
  /** أيقونة إعدادات الجدول الشاملة (الأعمدة، الحجم، الألوان، الخطوط) */
  settingsButton?: React.ReactNode;
}

const ExcelTableToolbar: React.FC<ExcelTableToolbarProps> = ({
  title,
  currentTheme,
  showSearch,
  internalSearch,
  setInternalSearch,
  isRTL,
  onExport,
  enableResize,
  handleResetSize,
  isZoomed,
  setIsZoomed,
  zoomLevel,
  setZoomLevel,
  isPanMode = false,
  onTogglePanMode,
  settingsButton,
}) => {
  return (
    <div className="flex flex-col items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-surface-hover)] px-1 py-0.5 sm:flex-row">
      <div className="flex w-full items-center gap-3 sm:w-auto">
        {title && (
          <div className="flex items-center gap-2">
            <span className={cn('h-3 w-1 rounded-full', currentTheme.accent)}></span>
            <h3 className="text-[10px] font-bold uppercase tracking-tight text-[var(--app-text-secondary)]">
              {title}
            </h3>
          </div>
        )}
        <div className="flex items-center gap-1 rounded-lg bg-[var(--app-bg)] p-1">
          {enableResize && (
            <>
              <button
                onClick={handleResetSize}
                className="rounded p-1.5 text-[var(--app-text-secondary)] shadow-sm transition-colors hover:bg-[var(--app-surface)] hover:text-blue-500"
                title="إعادة الحجم الأصلي"
              >
                <RotateCcw size={14} />
              </button>
              <div className="mx-0.5 h-4 w-px bg-[var(--app-border)]" />
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setIsZoomed(!isZoomed);
            }}
            className="rounded p-1.5 text-[var(--app-text-secondary)] shadow-sm transition-colors hover:bg-[var(--app-surface)] hover:text-blue-500"
            title={isZoomed ? 'تصغير من ملء الشاشة' : 'تكبير الجدول لملء الشاشة'}
          >
            {isZoomed ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          {onTogglePanMode && (
            <button
              type="button"
              onClick={onTogglePanMode}
              className={cn(
                'rounded p-1.5 shadow-sm transition-colors',
                isPanMode
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface)] hover:text-blue-500'
              )}
              title={isPanMode ? 'إيقاف وضع السحب والتحريك' : 'سحب وتحريك الجدول بالماوس'}
            >
              <Hand size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setZoomLevel(z => Math.max(0.6, Math.round((z - 0.1) * 10) / 10));
            }}
            className="rounded p-1 text-[var(--app-text-secondary)] shadow-sm hover:bg-[var(--app-surface)] hover:text-blue-500"
            title="تصغير العرض"
          >
            <Minus size={12} />
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel(1)}
            className="w-10 rounded px-1 py-0.5 text-center font-mono text-[10px] font-bold text-[var(--app-text-secondary)] hover:bg-[var(--app-surface)] hover:text-blue-600"
            title="إعادة التكبير إلى 100%"
          >
            {Math.round(zoomLevel * 100)}%
          </button>
          <button
            type="button"
            onClick={() => {
              setZoomLevel(z => Math.min(2.0, Math.round((z + 0.1) * 10) / 10));
            }}
            className="rounded p-1 text-[var(--app-text-secondary)] shadow-sm hover:bg-[var(--app-surface)] hover:text-blue-500"
            title="تكبير العرض"
          >
            <Plus size={12} />
          </button>
          {settingsButton && (
            <>
              <div className="mx-0.5 h-4 w-px bg-[var(--app-border)]" />
              {settingsButton}
            </>
          )}
        </div>
      </div>

      <div className="flex w-full flex-1 items-center justify-end gap-2 sm:w-auto">
        {showSearch && (
          <div className="relative flex-1 sm:max-w-xs">
            <SearchInput
              value={internalSearch}
              onChange={setInternalSearch}
              placeholder="بحث سريع في النتائج..."
              variant="primary"
              size="sm"
              dir={isRTL ? 'rtl' : 'ltr'}
              clearable
            />
          </div>
        )}
        {onExport && (
          <button
            onClick={onExport}
            className="rounded-lg border border-emerald-100 bg-emerald-50 p-2 text-emerald-600 shadow-sm transition-all hover:bg-emerald-600 hover:text-white dark:border-emerald-900/30 dark:bg-emerald-950/30"
          >
            <FileSpreadsheet size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ExcelTableToolbar;
