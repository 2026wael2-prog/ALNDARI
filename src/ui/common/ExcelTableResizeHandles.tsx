import React from 'react';
import type { TableResizeDirection } from './hooks/useTableWrapperResize';

export interface ExcelTableResizeHandlesProps {
  onResizeStart: (direction: TableResizeDirection, e: React.MouseEvent) => void;
}

interface HandleDefinition {
  direction: TableResizeDirection;
  /** موضع المقبض وأبعاده ومؤشره (الأصناف التي كانت مكرّرة ثماني مرات). */
  className: string;
}

const HANDLES: readonly HandleDefinition[] = [
  { direction: 'n', className: 'left-0 right-0 top-0 h-1.5 cursor-n-resize' },
  { direction: 's', className: 'bottom-0 left-0 right-0 h-1.5 cursor-s-resize' },
  { direction: 'w', className: 'bottom-0 left-0 top-0 w-1.5 cursor-w-resize' },
  { direction: 'e', className: 'bottom-0 right-0 top-0 w-1.5 cursor-e-resize' },
  { direction: 'nw', className: 'left-0 top-0 h-3 w-3 cursor-nw-resize' },
  { direction: 'ne', className: 'right-0 top-0 h-3 w-3 cursor-ne-resize' },
  { direction: 'sw', className: 'bottom-0 left-0 h-3 w-3 cursor-sw-resize' },
  { direction: 'se', className: 'bottom-0 right-0 h-3 w-3 cursor-se-resize' },
];

/**
 * مقابض تغيير حجم حاوية الجدول.
 *
 * سبب وجود الملف: كانت ثمانية عناصر `div` متطابقة تقريباً مكتوبة يدوياً داخل
 * `ExcelTable` (‏~55 سطراً) وتضخّم عمق شجرة JSX. الآن مصدر واحد للبيانات
 * وشجرة واحدة قابلة للقراءة، مع الحفاظ على نفس الأصناف والسلوك تماماً.
 */
export const ExcelTableResizeHandles = ({
  onResizeStart,
}: ExcelTableResizeHandlesProps): React.ReactElement => (
  <>
    {HANDLES.map(({ direction, className }) => (
      <div
        key={direction}
        role="presentation"
        className={`absolute z-10 transition-colors hover:bg-blue-500/30 ${className}`}
        onMouseDown={e => {
          onResizeStart(direction, e);
        }}
      />
    ))}
  </>
);

export default ExcelTableResizeHandles;
