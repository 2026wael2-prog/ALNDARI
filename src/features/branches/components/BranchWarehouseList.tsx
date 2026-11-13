/* eslint-disable max-lines-per-function -- مكون اختيار مستودعات الفرع */
import React from 'react';
import { Warehouse, Check } from 'lucide-react';
import { useBranchFilterStore } from '../store';
import { useBranchFilter } from '../hooks/useBranchFilter';
import { useWarehousesWithBranches } from '../../inventory/hooks/useWarehouseStock';
import { cn } from '../../../core/utils';

interface BranchWarehouseListProps {
  onSelect?: () => void;
}

export const BranchWarehouseList: React.FC<BranchWarehouseListProps> = ({ onSelect }) => {
  const { branchId: effectiveBranchId } = useBranchFilter();
  const activeWarehouseId = useBranchFilterStore(s => s.activeWarehouseId);
  const setActiveWarehouse = useBranchFilterStore(s => s.setActiveWarehouse);

  const { warehouses: allWarehouses } = useWarehousesWithBranches();

  if (effectiveBranchId === null || effectiveBranchId.trim() === '') {
    return null;
  }

  const branchWarehouses = allWarehouses.filter(w => w.branch_id === effectiveBranchId);

  if (branchWarehouses.length === 0) {
    return null;
  }

  const handleSelectAll = (): void => {
    setActiveWarehouse(null, null);
    onSelect?.();
  };

  const handleSelectWarehouse = (id: string, name: string): void => {
    setActiveWarehouse(id, name);
    onSelect?.();
  };

  const isAllSelected = activeWarehouseId === null;

  return (
    <div className="border-t border-gray-100 bg-gray-50/70 p-2 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600 dark:text-slate-300">
          <Warehouse size={13} className="text-purple-600 dark:text-purple-400" />
          <span>مستودعات الفرع:</span>
        </span>
        {!isAllSelected && (
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-[10px] font-bold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            عرض الكل
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {/* الخيار الافتراضي: كافة المستودعات */}
        <button
          type="button"
          onClick={handleSelectAll}
          className={cn(
            'flex items-center justify-between rounded-lg px-2 py-1.5 text-right text-xs font-bold transition-colors',
            isAllSelected
              ? 'bg-purple-100/80 text-purple-900 dark:bg-purple-950/60 dark:text-purple-300'
              : 'text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800'
          )}
        >
          <span>كافة مستودعات الفرع</span>
          {isAllSelected && (
            <Check size={14} className="shrink-0 text-purple-700 dark:text-purple-400" />
          )}
        </button>

        {/* قائمة مستودعات الفرع النشط */}
        {branchWarehouses.map(wh => {
          const isSelected = activeWarehouseId === wh.id;
          return (
            <button
              key={wh.id}
              type="button"
              onClick={() => {
                handleSelectWarehouse(wh.id, wh.name_ar);
              }}
              className={cn(
                'flex items-center justify-between rounded-lg px-2 py-1.5 text-right text-xs font-bold transition-colors',
                isSelected
                  ? 'bg-purple-100/80 text-purple-900 dark:bg-purple-950/60 dark:text-purple-300'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800'
              )}
            >
              <span className="truncate">{wh.name_ar}</span>
              {isSelected && (
                <Check size={14} className="shrink-0 text-purple-700 dark:text-purple-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
