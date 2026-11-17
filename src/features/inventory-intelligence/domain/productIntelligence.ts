import type {
  ClassificationStatus,
  ProductFitmentRow,
  ProductIdentityProfile,
  QualityGrade,
  RawCrossRefRow,
  RawProductSnapshot,
} from '../types';
import { extractPartType, extractProductSize } from './product/sizeExtractor';

const GENUINE_KEYWORDS = ['اصلي', 'أصلي', 'وكالة', 'genuine', 'oem', 'toyota', 'hyundai', 'kia', 'nissan', 'mobis', 'denso'];
const JAPANESE_KEYWORDS = ['ياباني', 'japan', 'aisin', 'aisn', 'kyb', 'ngk', 'nsk', 'koyo', '555', 'tokico', 'exedy', 'koito'];
const KOREAN_KEYWORDS = ['كوري', 'korea', 'korean', 'ctr', 'mando', 'valeo phc', 'phc', 'sangsin', 'hi-q'];
const THAI_KEYWORDS = ['تايلند', 'تايلندي', 'thai', 'thailand'];
const CHINESE_KEYWORDS = ['صيني', 'تجاري', 'china', 'chinese', 'commercial'];

const GRADE_ORIGIN_LABELS: Record<QualityGrade, string> = {
  genuine_oem: 'أصلي / وكالة (OEM)',
  japanese_aftermarket: 'ياباني (بعد البيع)',
  korean_aftermarket: 'كوري (بعد البيع)',
  thai_aftermarket: 'تايلندي',
  chinese_commercial: 'صيني / تجاري',
  other_aftermarket: 'بديل تجاري آخر',
};

/**
 * Classifies quality grade and origin using structured DB fields first,
 * falling back to keyword classification (marking uncertain matches for review).
 */
export function classifyQualityGrade(
  brand: string | null | undefined,
  name: string | null | undefined,
  structuredGrade?: QualityGrade | null,
  structuredOrigin?: string | null,
  structuredStatus?: ClassificationStatus | null
): {
  grade: QualityGrade;
  originTag: string;
  classificationStatus: ClassificationStatus;
} {
  if (structuredGrade) {
    return {
      grade: structuredGrade,
      originTag: structuredOrigin || GRADE_ORIGIN_LABELS[structuredGrade],
      classificationStatus: structuredStatus ?? 'verified',
    };
  }

  const combined = `${brand ?? ''} ${name ?? ''} ${structuredOrigin ?? ''}`.toLowerCase();

  if (GENUINE_KEYWORDS.some(k => combined.includes(k))) {
    return { grade: 'genuine_oem', originTag: GRADE_ORIGIN_LABELS.genuine_oem, classificationStatus: 'auto' };
  }
  if (JAPANESE_KEYWORDS.some(k => combined.includes(k))) {
    return { grade: 'japanese_aftermarket', originTag: GRADE_ORIGIN_LABELS.japanese_aftermarket, classificationStatus: 'auto' };
  }
  if (KOREAN_KEYWORDS.some(k => combined.includes(k))) {
    return { grade: 'korean_aftermarket', originTag: GRADE_ORIGIN_LABELS.korean_aftermarket, classificationStatus: 'auto' };
  }
  if (THAI_KEYWORDS.some(k => combined.includes(k))) {
    return { grade: 'thai_aftermarket', originTag: GRADE_ORIGIN_LABELS.thai_aftermarket, classificationStatus: 'auto' };
  }
  if (CHINESE_KEYWORDS.some(k => combined.includes(k))) {
    return { grade: 'chinese_commercial', originTag: GRADE_ORIGIN_LABELS.chinese_commercial, classificationStatus: 'auto' };
  }
  return {
    grade: 'other_aftermarket',
    originTag: structuredOrigin || GRADE_ORIGIN_LABELS.other_aftermarket,
    classificationStatus: 'pending_review',
  };
}

export function buildProductIdentityProfile(
  raw: RawProductSnapshot,
  fitments: ProductFitmentRow[] = []
): ProductIdentityProfile {
  const altNums = (raw.alternative_numbers ?? '')
    .split(/[\s,;/|]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const brand = (raw.brand ?? '').trim() || 'غير محدد';
  const { grade, originTag, classificationStatus } = classifyQualityGrade(
    brand,
    raw.name_ar,
    raw.quality_grade,
    raw.origin_country,
    raw.classification_status
  );
  const unitCost =
    Number(raw.cost_price) > 0
      ? Number(raw.cost_price)
      : Number(raw.purchase_price) > 0
        ? Number(raw.purchase_price)
        : 0;

  const { size, sizeSortKey } = extractProductSize(raw.name_ar, raw.size);
  const partType = extractPartType(raw.name_ar, raw.category_name);

  return {
    productId: raw.id,
    name: raw.name_ar,
    partType,
    size,
    sizeSortKey,
    sku: (raw.sku ?? '').trim() || '—',
    partNumber: (raw.part_number ?? '').trim() || '—',
    alternativeNumbers: altNums,
    brand,
    originTag,
    originCountry: raw.origin_country ?? null,
    qualityGrade: grade,
    classificationStatus,
    categoryId: raw.category_id,
    categoryName: raw.category_name || 'عام',
    fitments,
    unitCost,
    salePrice: Number(raw.sale_price) || 0,
    minStockLevel: Math.max(0, Number(raw.min_stock_level) || 0),
  };
}

/**
 * Returns ONLY verified/approved product alternatives for a given product,
 * keeping unverified suggestions strictly separate.
 */
export function getProductRelationships(
  productId: string,
  crossReferences: RawCrossRefRow[]
): {
  verifiedAlternatives: RawCrossRefRow[];
  pendingSuggestions: RawCrossRefRow[];
} {
  const relevant = crossReferences.filter(
    cr => cr.base_product_id === productId || cr.alternative_product_id === productId
  );

  return {
    verifiedAlternatives: relevant.filter(
      cr => cr.status === 'approved' && cr.relationship_type !== 'unverified_similar'
    ),
    pendingSuggestions: relevant.filter(
      cr => cr.status === 'pending_review' || cr.relationship_type === 'unverified_similar'
    ),
  };
}
