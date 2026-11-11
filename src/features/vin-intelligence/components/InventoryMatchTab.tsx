import React, { useMemo, useState } from 'react';
import { Link2, Unlink2, PackagePlus, ScanLine, Search, CheckCircle2, Boxes } from 'lucide-react';
import Button from '../../../ui/base/Button';
import Input from '../../../ui/base/Input';
import ExcelTable, { type Column } from '../../../ui/common/ExcelTable';
import { cn } from '../../../core/utils';
import type {
  CompatibilityStatus,
  MatchingInventoryProduct,
  VehicleProductLink,
} from '../types';

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

/** Product relation embedded in a vehicle link, when present. */
type LinkedProduct = NonNullable<VehicleProductLink['product']>;

const CONFIRMED_BADGE_CLASS =
  'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60';
const POSSIBLE_BADGE_CLASS =
  'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60';
const UNKNOWN_BADGE_CLASS =
  'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
const NOT_COMPATIBLE_BADGE_CLASS =
  'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60';

function isPresent(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== '';
}

function firstNonEmpty(primary: string | null | undefined, fallback: string): string {
  return isPresent(primary) ? primary : fallback;
}

function resolveCompatibilityStatus(
  candidate: CompatibilityStatus | null | undefined,
  fallback: CompatibilityStatus
): CompatibilityStatus {
  return isPresent(candidate) ? candidate : fallback;
}

function isBlankOrDash(value: string | null | undefined): boolean {
  return !isPresent(value) || value === '—';
}

function badgeClass(status: string): string {
  switch (status) {
    case 'CONFIRMED':
      return CONFIRMED_BADGE_CLASS;
    case 'POSSIBLE':
      return POSSIBLE_BADGE_CLASS;
    case 'NOT_COMPATIBLE':
      return NOT_COMPATIBLE_BADGE_CLASS;
    default:
      return UNKNOWN_BADGE_CLASS;
  }
}

function badgeLabel(status: string): string {
  switch (status) {
    case 'CONFIRMED':
      return 'مؤكد ✓';
    case 'POSSIBLE':
      return 'محتمل ⚡';
    case 'NOT_COMPATIBLE':
      return 'غير متوافق ✕';
    case 'UNKNOWN':
      return 'غير محدد';
    default:
      return status;
  }
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badgeClass(status)}`}
    >
      {badgeLabel(status)}
    </span>
  );
}

function SkuCell({ sku }: { sku: string }): React.ReactElement {
  return (
    <span className="rounded-md border border-slate-200/60 bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-300">
      {sku}
    </span>
  );
}

function OemCell({ partNumber }: { partNumber: string | null }): React.ReactElement {
  return (
    <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
      {partNumber ?? '—'}
    </span>
  );
}

function ProductNameCell({ name, source }: { name: string; source: string }): React.ReactElement {
  return (
    <div className="flex flex-col py-0.5">
      <span className="text-xs font-bold leading-snug text-slate-900 dark:text-slate-100">
        {name}
      </span>
      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
        المصدر: {source}
      </span>
    </div>
  );
}

function BrandCell({ brand }: { brand: string | null }): React.ReactElement {
  return (
    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{brand ?? '—'}</span>
  );
}

function QuantityCell({ quantity }: { quantity: number | undefined }): React.ReactElement {
  const qty = quantity ?? 0;
  const inStock = qty > 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-bold',
        inStock
          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      )}
    >
      {qty}
    </span>
  );
}

function PriceCell({ price }: { price: number }): React.ReactElement {
  return (
    <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
      {price ? price.toLocaleString() : '—'}
    </span>
  );
}

interface ProductColumnContext {
  linkedMap: Map<string, string>;
  isLinking: boolean;
  isLinkedLoading: boolean;
  onLink: (productId: string) => void;
  onUnlink: (linkId: string) => void;
}

interface ProductActionsCellProps {
  row: MatchingInventoryProduct;
  context: ProductColumnContext;
}

function resolveLinkId(
  primary: string | undefined,
  fallback: string | undefined
): string | undefined {
  return isPresent(primary) ? primary : fallback;
}

function ProductActionsCell({ row, context }: ProductActionsCellProps): React.ReactElement {
  const linkId = resolveLinkId(row.link_id, context.linkedMap.get(row.product_id));

  if (linkId !== undefined) {
    return (
      <button
        onClick={() => {
          context.onUnlink(linkId);
        }}
        disabled={context.isLinkedLoading}
        title="إلغاء ربط القطعة من هذه المركبة"
        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 shadow-xs transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
      >
        <Unlink2 size={11} /> إلغاء الربط
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        context.onLink(row.product_id);
      }}
      disabled={context.isLinking}
      title="تأكيد وربط القطعة بهذه المركبة"
      className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs transition-colors hover:bg-blue-700 disabled:opacity-50"
    >
      <Link2 size={11} /> ربط
    </button>
  );
}

function createProductColumns(
  context: ProductColumnContext
): Array<Column<MatchingInventoryProduct>> {
  return [
    {
      header: 'SKU',
      accessor: row => <SkuCell sku={row.sku} />,
      width: '110px',
    },
    {
      header: 'رقم القطعة (OEM)',
      accessor: row => <OemCell partNumber={row.part_number} />,
      width: '130px',
    },
    {
      header: 'اسم المنتج في المخزون',
      accessor: row => <ProductNameCell name={row.name_ar} source={row.match_source} />,
    },
    {
      header: 'الماركة',
      accessor: row => <BrandCell brand={row.brand} />,
      width: '100px',
    },
    {
      header: 'الكمية المتوفرة',
      accessor: row => <QuantityCell quantity={row.quantity} />,
      width: '100px',
    },
    {
      header: 'سعر البيع',
      accessor: row => <PriceCell price={row.sale_price} />,
      width: '90px',
    },
    {
      header: 'التوافق',
      accessor: row => <StatusBadge status={row.compatibility_status} />,
      width: '110px',
    },
    {
      header: 'الإجراءات',
      accessor: row => <ProductActionsCell row={row} context={context} />,
      width: '100px',
    },
  ];
}

/** Display name for a directly linked product, with a readable fallback. */
function linkedProductName(link: VehicleProductLink): string {
  const product = link.product;
  const directName = firstNonEmpty(product?.name_ar, firstNonEmpty(product?.name, ''));
  if (directName !== '') return directName;

  const partNumber = product?.part_number;
  if (isPresent(partNumber)) return `قطعة غيار (${partNumber})`;

  return `منتج (${link.product_id.slice(0, 8)})`;
}

function buildLinkedProduct(link: VehicleProductLink): MatchingInventoryProduct {
  const product = link.product;

  return {
    product_id: link.product_id,
    link_id: link.id,
    sku: firstNonEmpty(product?.sku, '—'),
    part_number: firstNonEmpty(product?.part_number, '—'),
    name_ar: linkedProductName(link),
    brand: firstNonEmpty(product?.brand, '—'),
    sale_price: product?.sale_price ?? 0,
    quantity: product?.quantity ?? 0,
    status: firstNonEmpty(product?.status, 'active'),
    compatibility_status: resolveCompatibilityStatus(link.fitment_status, 'CONFIRMED'),
    match_source: link.source === 'vin_extract' ? 'استخراج شاصي' : 'ربط يدوي',
  };
}

function mergeProductText(existing: MatchingInventoryProduct, product: LinkedProduct): void {
  if (existing.name_ar === '') {
    const name = firstNonEmpty(product.name_ar, firstNonEmpty(product.name, ''));
    if (name !== '') existing.name_ar = name;
  }
  if (isBlankOrDash(existing.sku) && isPresent(product.sku)) {
    existing.sku = product.sku;
  }
  if (isBlankOrDash(existing.part_number) && isPresent(product.part_number)) {
    existing.part_number = product.part_number;
  }
}

function mergeProductNumbers(existing: MatchingInventoryProduct, product: LinkedProduct): void {
  if (product.quantity != null) {
    existing.quantity = product.quantity;
  }
  if (product.sale_price != null && !existing.sale_price) {
    existing.sale_price = product.sale_price;
  }
}

function applyLinkToExisting(
  existing: MatchingInventoryProduct,
  link: VehicleProductLink
): void {
  existing.compatibility_status = resolveCompatibilityStatus(
    link.fitment_status,
    resolveCompatibilityStatus(existing.compatibility_status, 'CONFIRMED')
  );

  const linkId = link.id;
  if (isPresent(linkId)) existing.link_id = linkId;

  const product = link.product;
  if (product != null) {
    mergeProductText(existing, product);
    mergeProductNumbers(existing, product);
  }
}

/**
 * Merge graph matching products and direct vehicle-linked products
 * into a single unified deduplicated list with complete product names.
 */
export function mergeMatchingAndLinkedProducts(
  matching: MatchingInventoryProduct[],
  linked: VehicleProductLink[]
): MatchingInventoryProduct[] {
  const merged = new Map<string, MatchingInventoryProduct>();

  for (const matchingProduct of matching) {
    merged.set(matchingProduct.product_id, { ...matchingProduct });
  }

  for (const link of linked) {
    const existing = merged.get(link.product_id);
    if (existing === undefined) {
      merged.set(link.product_id, buildLinkedProduct(link));
      continue;
    }
    applyLinkToExisting(existing, link);
  }

  return Array.from(merged.values());
}

function buildLinkedMap(linked: VehicleProductLink[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const link of linked) {
    const linkId = link.id;
    if (isPresent(linkId)) map.set(link.product_id, linkId);
  }
  return map;
}

function matchesSearch(product: MatchingInventoryProduct, query: string): boolean {
  const name = product.name_ar.toLowerCase();
  const sku = product.sku.toLowerCase();
  const partNumber = product.part_number?.toLowerCase() ?? '';
  const brand = product.brand?.toLowerCase() ?? '';

  return (
    name.includes(query) ||
    sku.includes(query) ||
    partNumber.includes(query) ||
    brand.includes(query)
  );
}

function filterProductsByName(
  products: MatchingInventoryProduct[],
  search: string
): MatchingInventoryProduct[] {
  const query = search.trim().toLowerCase();
  if (query === '') return products;
  return products.filter(product => matchesSearch(product, query));
}

function countInStock(products: MatchingInventoryProduct[]): number {
  return products.filter(product => (product.quantity ?? 0) > 0).length;
}

interface NoVehicleSelectedStateProps {
  onNavigateToDecode?: (() => void) | undefined;
}

function NoVehicleSelectedState({
  onNavigateToDecode,
}: NoVehicleSelectedStateProps): React.ReactElement {
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

interface InventoryMatchBannerProps {
  total: number;
  inStock: number;
  linkedCount: number;
  onNavigateToExtract?: (() => void) | undefined;
}

function InventoryMatchBanner({
  total,
  inStock,
  linkedCount,
  onNavigateToExtract,
}: InventoryMatchBannerProps): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Boxes size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
              قطع المخزون المتوافقة ({total})
            </h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              منها {inStock} قطعة متوفرة حالياً في المخزن
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 size={13} /> {linkedCount} قطعة مثبتة بالمركبة
          </span>
        </div>
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
  );
}

interface InventorySearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

function InventorySearchBar({ value, onChange }: InventorySearchBarProps): React.ReactElement {
  return (
    <div className="max-w-md">
      <Input
        value={value}
        onChange={event => {
          onChange(event.target.value);
        }}
        placeholder="بحث برقم القطعة، الاسم، أو رمز الصنف (SKU)..."
        icon={<Search size={14} className="text-slate-400" />}
      />
    </div>
  );
}

interface InventoryProductsGridProps {
  columns: Array<Column<MatchingInventoryProduct>>;
  data: MatchingInventoryProduct[];
  searchFilter: string;
  isBusy: boolean;
}

function InventoryProductsGrid({
  columns,
  data,
  searchFilter,
  isBusy,
}: InventoryProductsGridProps): React.ReactElement {
  return (
    <ExcelTable
      columns={columns}
      data={data}
      title="قطع المخزون المتطابقة والمرتبطة بهذه المركبة"
      enablePagination={data.length > 25}
      pageSize={25}
      showSearch={false}
      isLoading={isBusy}
      emptyMessage={
        searchFilter !== ''
          ? 'لا توجد نتائج مطابقة لبحثك'
          : 'لا توجد قطع مطابقة أو مرتبطة بهذه المركبة في المخزون حالياً'
      }
      colorTheme="blue"
      isRTL
    />
  );
}

interface InventoryMatchViewProps {
  allProducts: MatchingInventoryProduct[];
  filteredProducts: MatchingInventoryProduct[];
  linkedMap: Map<string, string>;
  linkedCount: number;
  searchFilter: string;
  onSearchChange: (value: string) => void;
  isBusy: boolean;
  isLinking: boolean;
  isLinkedLoading: boolean;
  onLink: (productId: string) => void;
  onUnlink: (linkId: string) => void;
  onNavigateToExtract?: (() => void) | undefined;
}

function InventoryMatchView({
  allProducts,
  filteredProducts,
  linkedMap,
  linkedCount,
  searchFilter,
  onSearchChange,
  isBusy,
  isLinking,
  isLinkedLoading,
  onLink,
  onUnlink,
  onNavigateToExtract,
}: InventoryMatchViewProps): React.ReactElement {
  const columns = createProductColumns({
    linkedMap,
    isLinking,
    isLinkedLoading,
    onLink,
    onUnlink,
  });

  return (
    <div className="space-y-4">
      <InventoryMatchBanner
        total={allProducts.length}
        inStock={countInStock(allProducts)}
        linkedCount={linkedCount}
        onNavigateToExtract={onNavigateToExtract}
      />

      {allProducts.length > 0 && (
        <InventorySearchBar value={searchFilter} onChange={onSearchChange} />
      )}

      <InventoryProductsGrid
        columns={columns}
        data={filteredProducts}
        searchFilter={searchFilter}
        isBusy={isBusy}
      />
    </div>
  );
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

  if (!hasVehicle) {
    return <NoVehicleSelectedState onNavigateToDecode={onNavigateToDecode} />;
  }

  return (
    <InventoryMatchView
      allProducts={allProducts}
      filteredProducts={filteredProducts}
      linkedMap={linkedMap}
      linkedCount={linkedProducts.length}
      searchFilter={searchFilter}
      onSearchChange={setSearchFilter}
      isBusy={isMatching || isLinkedLoading}
      isLinkedLoading={isLinkedLoading}
      isLinking={isLinking}
      onLink={onLink}
      onUnlink={onUnlink}
      onNavigateToExtract={onNavigateToExtract}
    />
  );
};
