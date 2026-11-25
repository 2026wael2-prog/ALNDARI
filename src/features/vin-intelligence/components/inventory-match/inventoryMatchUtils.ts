import type {
  CompatibilityStatus,
  MatchingInventoryProduct,
  VehicleProductLink,
} from '../../types';

type LinkedProduct = NonNullable<VehicleProductLink['product']>;

export function isPresent(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== '';
}

export function firstNonEmpty(primary: string | null | undefined, fallback: string): string {
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

  if (isPresent(link.id)) existing.link_id = link.id;

  if (link.product != null) {
    mergeProductText(existing, link.product);
    mergeProductNumbers(existing, link.product);
  }
}

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

export function buildLinkedMap(linked: VehicleProductLink[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const link of linked) {
    if (isPresent(link.id)) map.set(link.product_id, link.id);
  }
  return map;
}

export function filterProductsByName(
  products: MatchingInventoryProduct[],
  search: string
): MatchingInventoryProduct[] {
  const query = search.trim().toLowerCase();
  if (query === '') return products;
  return products.filter(
    product =>
      product.name_ar.toLowerCase().includes(query) ||
      product.sku.toLowerCase().includes(query) ||
      (product.part_number?.toLowerCase() ?? '').includes(query) ||
      (product.brand?.toLowerCase() ?? '').includes(query)
  );
}

export function countInStock(products: MatchingInventoryProduct[]): number {
  return products.filter(product => (product.quantity ?? 0) > 0).length;
}
