import React, { useMemo, useState } from 'react';
import { PackagePlus, ScanLine, Search, CheckCircle2, Boxes } from 'lucide-react';
import Button from '../../../ui/base/Button';
import Input from '../../../ui/base/Input';
import ExcelTable from '../../../ui/common/ExcelTable';
import type { MatchingInventoryProduct, VehicleProductLink } from '../types';
import {
  buildLinkedMap,
  countInStock,
  filterProductsByName,
  mergeMatchingAndLinkedProducts,
} from './inventory-match/inventoryMatchUtils';
import { createProductColumns } from './inventory-match/InventoryMatchColumns';

export { mergeMatchingAndLinkedProducts };

interface InventoryMatchTabProps {
  hasVehicle: boolean;
  matchingProducts: MatchingInventoryProduct[];
  isMatching: boolean;
  linkedProducts: VehicleProductLink[];
  isLinkedLoading: boolean;
  isLinking: boolean;
  onLink: (productId: string) => void;
  onUnlink: (id: string) => void;
  onNavigateToExtract?: () => void;
  onNavigateToDecode?: () => void;
}

export const InventoryMatchTab: React.FC<InventoryMatchTabProps> = ({
  hasVehicle,
  matchingProducts,
  isMatching,
  linkedProducts,
  isLinkedLoading,
  isLinking,
  onLink,
  onUnlink,
  onNavigateToExtract,
  onNavigateToDecode,
}) => {
  const [searchFilter, setSearchFilter] = useState('');

  const linkedMap = useMemo(() => buildLinkedMap(linkedProducts), [linkedProducts]);
  const allProducts = useMemo(
    () => mergeMatchingAndLinkedProducts(matchingProducts, linkedProducts),
    [matchingProducts, linkedProducts]
  );
  const filteredProducts = useMemo(
    () => filterProductsByName(allProducts, searchFilter),
    [allProducts, searchFilter]
  );

  const columns = useMemo(
    () => createProductColumns({ linkedMap, isLinking, isLinkedLoading, onLink, onUnlink }),
    [linkedMap, isLinking, isLinkedLoading, onLink, onUnlink]
  );

  if (!hasVehicle) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 py-16 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
          <ScanLine size={28} />
        </div>
        <h3 className="mb-2 text-base font-bold text-slate-800 dark:text-slate-100">
          لم يتم تحديد سيارة بعد
        </h3>
        <p className="mx-auto mb-6 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          قم بفك رقم الشاصي (VIN) أو اختيار موديل ومواصفات السيارة لعرض كافة قطع الغيار المتطابقة في
          مخزونك تلقائياً بأسمائها وأسعارها وكمياتها.
        </p>
        {onNavigateToDecode && (
          <Button
            size="md"
            onClick={onNavigateToDecode}
            className="rounded-xl bg-blue-600 font-bold text-white shadow-md shadow-blue-500/20"
          >
            <ScanLine size={16} className="ml-1.5" />
            الانتقال لفك الشاصي وتحديد السيارة
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <Boxes size={18} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                قطع المخزون المتوافقة ({allProducts.length})
              </h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                منها {countInStock(allProducts)} قطعة متوفرة حالياً في المخزن
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 size={13} /> {linkedProducts.length} قطعة مثبتة بالمركبة
          </span>
        </div>

        {onNavigateToExtract && (
          <Button
            size="sm"
            onClick={onNavigateToExtract}
            className="rounded-xl bg-indigo-600 font-bold text-white shadow-xs hover:bg-indigo-700"
          >
            <PackagePlus size={14} className="ml-1.5" />
            تسعير واستخراج قطع جديدة لهذه السيارة
          </Button>
        )}
      </div>

      {allProducts.length > 0 && (
        <div className="max-w-md">
          <Input
            value={searchFilter}
            onChange={event => {
              setSearchFilter(event.target.value);
            }}
            placeholder="بحث برقم القطعة، الاسم، أو رمز الصنف (SKU)..."
            icon={<Search size={14} className="text-slate-400" />}
          />
        </div>
      )}

      <ExcelTable
        columns={columns}
        data={filteredProducts}
        title="قطع المخزون المتطابقة والمرتبطة بهذه المركبة"
        enablePagination={filteredProducts.length > 25}
        pageSize={25}
        showSearch={false}
        isLoading={isMatching || isLinkedLoading}
        emptyMessage={
          searchFilter !== ''
            ? 'لا توجد نتائج مطابقة لبحثك'
            : 'لا توجد قطع مطابقة أو مرتبطة بهذه المركبة في المخزون حالياً'
        }
        colorTheme="blue"
        isRTL
      />
    </div>
  );
};
