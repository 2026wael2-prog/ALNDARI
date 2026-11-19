const PART_TYPE_RULES: Array<{ label: string; keywords: string[] }> = [
  { label: 'فلتر', keywords: ['فلتر', 'filter', 'صفاية', 'مصفاة'] },
  { label: 'فحمات / فرامل', keywords: ['فحمات', 'هوب', 'قماش', 'بريك', 'فرامل', 'brake', 'pad', 'disc'] },
  { label: 'بواجي / إشعال', keywords: ['بواجي', 'بوجي', 'كويل', 'spark', 'coil'] },
  { label: 'مساعدات / تعليق', keywords: ['مساعد', 'ياي', 'مقص', 'جوزة', 'ركبة', 'مسمار توازن', 'shock', 'strut', 'arm'] },
  { label: 'سير / بكرة', keywords: ['سير', 'بكرة', 'شداد', 'belt', 'pulley', 'tensioner'] },
  { label: 'رمان / بيرنق', keywords: ['رمان', 'بيرنق', 'فلنجة', 'bearing', 'hub'] },
  { label: 'طرمبة / مضخة', keywords: ['طرمبة', 'مضخة', 'pump'] },
  { label: 'حساس', keywords: ['حساس', 'sensor'] },
  { label: 'صوفة / وجه / كازكيت', keywords: ['صوفة', 'وجه', 'كازكيت', 'ربلة', 'seal', 'gasket'] },
  { label: 'زيت / سوائل', keywords: ['زيت', 'شحم', 'مبرد', 'ماء رديتر', 'oil', 'fluid', 'coolant'] },
  { label: 'صنفرة / تلميع', keywords: ['صنفرة', 'ورق', 'تلميع', 'sandpaper', 'polish'] },
  { label: 'شمعة / إنارة', keywords: ['شمعة', 'اسطب', 'لمبة', 'كشاف', 'فانوس', 'lamp', 'headlight'] },
  { label: 'بطارية', keywords: ['بطارية', 'battery'] },
  { label: 'إطار / كفر', keywords: ['كفر', 'إطار', 'tire', 'tyre'] },
];

const SIZE_PATTERNS: RegExp[] = [
  /(?<![\p{L}\p{N}])\d{3}\/\d{2}r\d{2}(?![\p{L}\p{N}])/iu, // 205/55R16
  /(?<![\p{L}\p{N}])\d{1,2}w[-/]?\d{2}(?![\p{L}\p{N}])/iu, // 10W40, 5W-30
  /(?<![\p{L}\p{N}])\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?(?:\s*[x×*]\s*\d+(?:\.\d+)?)?(?![\p{L}\p{N}])/iu, // 12x1.5, 40x60
  /(?<![\p{L}\p{N}])\d+(?:\.\d+)?\s*(?:mm|cm|m|ml|l|ltr|kg|g|inch|in|r|ملم|مم|سم|متر|لتر|مل|كجم|جم|بوصة)(?![\p{L}\p{N}])/iu, // 16mm, 10 ملم, 25 مم, 3 سم, 1.5 لتر
  /(?<![\p{L}\p{N}])\d+\/\d+(?![\p{L}\p{N}])/u, // 3/4, 1/2
  /(?:رقم|مقاس|حجم|size|no\.?)\s*[:#-]?\s*([a-z0-9./-]+)/i,
];

/**
 * Extracts a normalized part type ("اسم القطعة") from the product name and category.
 */
export function extractPartType(
  name: string | null | undefined,
  categoryName?: string | null
): string {
  const lower = (name ?? '').toLowerCase();
  for (const rule of PART_TYPE_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      return rule.label;
    }
  }
  const cat = (categoryName ?? '').trim();
  if (cat && cat !== 'عام') return cat;

  return 'أخرى / عام';
}

/**
 * Extracts a normalized size/dimension string ("المقاس") and a numeric sort key
 * from an explicit DB size column or from the product name.
 */
export function extractProductSize(
  name: string | null | undefined,
  explicitSize?: string | null
): { size: string; sizeSortKey: number } {
  const cleanExplicit = (explicitSize ?? '').trim();
  if (cleanExplicit) {
    return {
      size: cleanExplicit,
      sizeSortKey: parseNumericSizeKey(cleanExplicit),
    };
  }

  const text = (name ?? '').trim();
  for (const pattern of SIZE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const value = (match[1] ?? match[0]).trim();
      return {
        size: value,
        sizeSortKey: parseNumericSizeKey(value),
      };
    }
  }

  return { size: '—', sizeSortKey: Number.MAX_SAFE_INTEGER };
}

function parseNumericSizeKey(value: string): number {
  const numMatch = value.match(/\d+(?:\.\d+)?/);
  if (!numMatch) return Number.MAX_SAFE_INTEGER - 1;
  const parsed = Number(numMatch[0]);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER - 1;
}
