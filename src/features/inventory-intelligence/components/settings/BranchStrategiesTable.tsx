import React from 'react';
import type { BranchInfo, EngineConfig } from '../../types';
import { GRID_TABLE_CLASS } from '../shared/IntelligenceBadges';

type BranchStrategy = NonNullable<EngineConfig['branch_strategies']>[string];

interface BranchStrategiesTableProps {
  branches: BranchInfo[];
  strategies: EngineConfig['branch_strategies'];
  onChangeStrategy: (branchId: string, next: BranchStrategy) => void;
}

export const BranchStrategiesTable: React.FC<BranchStrategiesTableProps> = ({
  branches,
  strategies,
  onChangeStrategy,
}) => {
  if (branches.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-[var(--app-border)] pt-4">
      <h4 className="text-xs font-bold text-[var(--app-text)]">
        استراتيجيات الفروع المستقلة (Branch Strategies)
      </h4>
      <div className="overflow-x-auto rounded-lg border border-[var(--app-border)]">
        <table className={GRID_TABLE_CLASS}>
          <thead className="bg-[var(--app-surface-hover)] text-[11px] font-bold text-[var(--app-text-secondary)]">
            <tr>
              <th className="p-2.5">الفرع</th>
              <th className="p-2.5 text-center">مضاعف مخزون الأمان</th>
              <th className="p-2.5 text-center">السماح بالتحويل الصادر</th>
            </tr>
          </thead>
          <tbody>
            {branches.map(b => {
              const strat = strategies?.[b.id] ?? {
                safetyMultiplier: 1,
                allowOutTransfer: true,
              };
              return (
                <tr key={b.id}>
                  <td className="p-2.5 font-bold text-[var(--app-text)]">{b.name}</td>
                  <td className="p-2.5 text-center">
                    <input
                      type="number"
                      step="0.1"
                      min={0.5}
                      max={3}
                      value={strat.safetyMultiplier ?? 1}
                      onChange={e => {
                        const val = Math.max(0.5, Math.min(3, Number(e.target.value) || 1));
                        onChangeStrategy(b.id, { ...strat, safetyMultiplier: val });
                      }}
                      className="w-20 rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1 text-center font-mono text-xs"
                      dir="ltr"
                    />
                  </td>
                  <td className="p-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={strat.allowOutTransfer !== false}
                      onChange={e => {
                        onChangeStrategy(b.id, { ...strat, allowOutTransfer: e.target.checked });
                      }}
                      className="h-4 w-4 accent-blue-600"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
