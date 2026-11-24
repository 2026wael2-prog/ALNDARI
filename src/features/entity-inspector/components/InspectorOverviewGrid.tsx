import React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../../core/utils';
import type { InspectorFieldRow } from '../types';
import { EntityInfoDot } from './EntityInfoDot';
import { TONE_TEXT } from './inspectorMeta';

interface InspectorOverviewGridProps {
  groupedFields: Array<[string, InspectorFieldRow[]]>;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
}

const FieldCellContent: React.FC<{
  field: InspectorFieldRow;
  sectionName: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
}> = ({ field, sectionName, copiedKey, onCopy }) => {
  const copyId = `${sectionName}-${field.label}`;
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={cn(
          TONE_TEXT[field.tone ?? 'default'],
          field.mono && 'font-mono tabular-nums'
        )}
      >
        {field.value}
      </span>
      <div className="flex items-center gap-1">
        {field.target && (
          <EntityInfoDot
            type={field.target.type}
            id={field.target.id}
            label={field.target.label}
            subType={field.target.subType}
            inInspector
            size="xs"
          />
        )}
        {field.copyValue && (
          <button
            type="button"
            onClick={() => onCopy(copyId, field.copyValue!)}
            className="rounded p-1 text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-blue-600"
            title="نسخ القيمة"
          >
            {copiedKey === copyId ? (
              <Check size={12} className="text-emerald-600" />
            ) : (
              <Copy size={12} />
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export const InspectorOverviewGrid: React.FC<InspectorOverviewGridProps> = ({
  groupedFields,
  copiedKey,
  onCopy,
}) => (
  <div className="space-y-3">
    {groupedFields.map(([sectionName, sectionFields]) => (
      <div
        key={sectionName}
        className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]"
      >
        <div
          data-inspector-subheader="true"
          className="border-b border-[var(--app-border)] bg-[var(--app-bg)] px-3.5 py-2 text-xs font-black text-[var(--app-text)]"
        >
          {sectionName}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-right text-xs">
            <tbody>
              {Array.from({ length: Math.ceil(sectionFields.length / 2) }).map((_, rowIdx) => {
                const leftField = sectionFields[rowIdx * 2];
                const rightField = sectionFields[rowIdx * 2 + 1];
                return (
                  <tr
                    key={rowIdx}
                    className="border-b border-[var(--app-border)] last:border-b-0 odd:bg-[var(--app-surface)] even:bg-[var(--app-bg)]/45"
                  >
                    {leftField && (
                      <>
                        <th className="w-36 border-l border-[var(--app-border)] bg-[var(--app-bg)]/75 px-3 py-2 font-extrabold text-[var(--app-text-secondary)]">
                          {leftField.label}
                        </th>
                        <td
                          colSpan={rightField ? 1 : 3}
                          className="border-l border-[var(--app-border)] px-3 py-2 font-bold last:border-l-0"
                        >
                          <FieldCellContent
                            field={leftField}
                            sectionName={sectionName}
                            copiedKey={copiedKey}
                            onCopy={onCopy}
                          />
                        </td>
                      </>
                    )}

                    {rightField && (
                      <>
                        <th className="w-36 border-l border-[var(--app-border)] bg-[var(--app-bg)]/75 px-3 py-2 font-extrabold text-[var(--app-text-secondary)]">
                          {rightField.label}
                        </th>
                        <td className="px-3 py-2 font-bold">
                          <FieldCellContent
                            field={rightField}
                            sectionName={sectionName}
                            copiedKey={copiedKey}
                            onCopy={onCopy}
                          />
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    ))}
  </div>
);
