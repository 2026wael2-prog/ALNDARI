/**
 * Automotive Cross-Sell & Mechanical Systems Relation Engine
 *
 * Provides offline, instant (<1ms) heuristic companion product recommendations
 * and mechanical-system relation matching for auto parts and vehicle maintenance.
 * Supports Yemeni/Gulf/Arabic & English spare parts terminology with Arabic
 * orthographic normalization (أ/إ/آ -> ا, ة -> ه, ى -> ي).
 */

export interface CompanionRule {
  id: string;
  systemLabel: string;
  keywords: string[];
  recommendations: string[];
  /** Short high-recall search tokens used to query actual inventory products */
  searchTokens: string[];
}

export interface AutomotiveRelationResult {
  matchedSystems: CompanionRule[];
  primarySystemLabel: string | null;
  companionChips: string[];
  searchTokens: string[];
  vehicleTokens: string[];
}

/**
 * Comprehensive automotive companion rules based on real-world spare parts
 * workshop & retail sales patterns (Yemen / GCC / international OEM terminology).
 */
export const AUTOMOTIVE_COMPANION_RULES: readonly CompanionRule[] = [
  // 1. CV Axles & Drive Shafts (منظومة العكوس والدفع)
  {
    id: 'cv_axle',
    systemLabel: 'منظومة العكوس والدفع',
    keywords: [
      'راس عكس',
      'رأس عكس',
      'عكس',
      'عكوس',
      'ربل عكس',
      'ربلة عكس',
      'ربلات عكس',
      'صليب عكس',
      'عكس داخلي',
      'عكس خارجي',
      'ربل شريم',
      'ربلات شريم',
      'شريم',
      'كوباية عكس',
      'cv joint',
      'axle',
      'drive shaft',
      'cv boot',
    ],
    recommendations: [
      'ربلات عكس',
      'ركب ذراع',
      'ربلات شريم',
      'صليب عكس داخلي',
      'راس عكس خارجي',
      'راس عكس داخلي',
      'شحم عكوس',
      'رمان هوب',
      'مسمار توازن',
    ],
    searchTokens: [
      'ربل عكس',
      'ربلة عكس',
      'ربلات عكس',
      'ركبة ذراع',
      'ركب ذراع',
      'شريم',
      'صليب عكس',
      'عكس داخلي',
      'عكس خارجي',
      'شحم',
      'رمان هوب',
    ],
  },

  // 2. Control Arms, Bushings & Ball Joints (منظومة المقصات والبوشات والجوزات)
  {
    id: 'control_arm',
    systemLabel: 'منظومة المقصات والتعليق الأمامي',
    keywords: [
      'بوش مقص',
      'بوشات مقص',
      'بوش',
      'بوشات',
      'مقص',
      'مقصات',
      'جوزة',
      'جوزات',
      'جوزه',
      'ركبة مقص',
      'ركب مقص',
      'مسمار توازن',
      'جلد توازن',
      'ربل توازن',
      'عمود توازن',
      'control arm',
      'bushing',
      'ball joint',
      'stabilizer',
    ],
    recommendations: [
      'جوزة مقص فوق',
      'جوزة مقص تحت',
      'بوشات مقص',
      'مقص كامل',
      'مسمار توازن',
      'ربلات توازن',
      'ركب ذراع',
      'أذرعة دركسون',
      'كراسي مساعدات',
    ],
    searchTokens: [
      'جوزة',
      'جوزه',
      'جوزات',
      'بوش مقص',
      'بوشات',
      'مقص',
      'مسمار توازن',
      'توازن',
      'ركبة',
      'ذراع',
    ],
  },

  // 3. Leaf Springs & Shackles (منظومة اللعابات والسست الخلفية)
  {
    id: 'leaf_spring_shackle',
    systemLabel: 'منظومة اللعابات والسست',
    keywords: [
      'لعابة',
      'لعابه',
      'لعابات',
      'سست',
      'سستة',
      'سسته',
      'ربل سست',
      'ربلات سست',
      'جلد لعابة',
      'ربل لعابة',
      'مسمار لعابة',
      'قفيز سست',
      'مسمار سنتر',
      'shackle',
      'leaf spring',
    ],
    recommendations: [
      'ربلات لعابة',
      'مسمار لعابة',
      'ربلات سست',
      'بوش سست',
      'مسمار سنتر سست',
      'قفيز سست',
      'مساعد خلفي',
      'ربلة صدام خلفي',
    ],
    searchTokens: [
      'لعابة',
      'لعابه',
      'ربل سست',
      'ربلات سست',
      'سست',
      'مسمار سنتر',
      'قفيز',
      'مساعد خلفي',
      'بوش سست',
    ],
  },

  // 4. Steering System (منظومة الدركسون والتوجيه)
  {
    id: 'steering',
    systemLabel: 'منظومة الدركسون والتوجيه',
    keywords: [
      'ذراع دركسون',
      'أذرعة',
      'اذرعة',
      'ركبة ذراع',
      'ركب ذراع',
      'دودة',
      'دودة دركسون',
      'علبة دركسون',
      'ربل دودة',
      'طرمبة باور',
      'ذراع داخلي',
      'ذراع خارجي',
      'tie rod',
      'rack end',
      'steering rack',
      'power steering',
    ],
    recommendations: [
      'ذراع دركسون داخلي',
      'ذراع دركسون خارجي',
      'ركب ذراع',
      'ربلات دودة دركسون',
      'زيت باور دركسون',
      'جوزة مقص',
      'مسمار توازن',
    ],
    searchTokens: [
      'ذراع داخلي',
      'ذراع خارجي',
      'ركبة ذراع',
      'ربل دودة',
      'دودة',
      'زيت باور',
      'جوزة',
      'مسمار توازن',
    ],
  },

  // 5. Shock Absorbers & Struts (منظومة المساعدات واليايات)
  {
    id: 'shocks',
    systemLabel: 'منظومة المساعدات واليايات',
    keywords: ['مساعد', 'مساعدات', 'كرسي مساعد', 'ياي', 'يايات', 'shock absorber', 'strut'],
    recommendations: [
      'كراسي مساعدات',
      'ربلة غطاء غبار مساعد',
      'جلود مقصات',
      'مسامير توازن',
      'بوشات مقص',
      'جوزات مقص',
    ],
    searchTokens: ['كرسي مساعد', 'مساعد', 'ربل مساعد', 'مسمار توازن', 'بوش مقص', 'جوزة'],
  },

  // 6. Engine Oil & Routine Service (منظومة الزيوت والصيانة الدورية — prioritized over engine overhaul for "زيت محرك")
  {
    id: 'oil_service',
    systemLabel: 'منظومة الزيوت والصيانة الدورية',
    keywords: [
      'زيت محرك',
      'زيت',
      'تخليقي',
      'engine oil',
      'سيفون',
      'فلتر زيت',
      '5w30',
      '10w40',
      '20w50',
      '5w40',
      '0w20',
    ],
    recommendations: ['فلتر زيت محرك', 'فلتر هواء محرك', 'فلتر مكيف', 'وردة صرة زيت'],
    searchTokens: ['فلتر زيت', 'فلتر هواء', 'فلتر مكيف', 'سيفون', 'صرة زيت'],
  },

  // 7. Engine Overhaul & Internal Parts (منظومة المحرك والعمرة)
  {
    id: 'engine_overhaul',
    systemLabel: 'منظومة المحرك والعمرة',
    keywords: [
      'عمرة',
      'توضيب',
      'راس محرك',
      'راس مكينة',
      'مكينة',
      'مكينه',
      'شنبر',
      'شنابر',
      'بستم',
      'بساتم',
      'سبيكة',
      'سبايك',
      'وجيه',
      'وجه راس',
      'طقم وجيه',
      'بلوف',
      'جلد بلوف',
      'كرنك',
      'صوفة كرنك',
      'طرمبة زيت',
      'كارتير',
      'محرك',
      'piston',
      'piston ring',
      'gasket',
      'head gasket',
      'main bearing',
      'conrod',
    ],
    recommendations: [
      'طقم وجيه كامل',
      'وجه راس مكينة',
      'طقم شنابر',
      'سبايك ثابت',
      'سبايك متحرك',
      'جلد بلوف',
      'طرمبة زيت',
      'صوفة كرنك أمامي',
      'صوفة كرنك خلفي',
      'سير تيمن',
      'فلتر زيت محرك',
      'بلف حرارة',
    ],
    searchTokens: [
      'طقم وجيه',
      'وجه راس',
      'شنابر',
      'سبايك',
      'بستم',
      'جلد بلوف',
      'طرمبة زيت',
      'صوفة كرنك',
      'فلتر زيت',
      'سير تيمن',
    ],
  },

  // 8. Brake System (منظومة الفرامل)
  {
    id: 'brakes_pads',
    systemLabel: 'منظومة الفرامل',
    keywords: [
      'قماش',
      'قماشات',
      'فحمات',
      'فحمة فرامل',
      'فرامل',
      'تيل',
      'كليبر',
      'اصلاح كليبر',
      'باكم',
      'brake',
      'brake pad',
      'caliper',
    ],
    recommendations: [
      'هوبات فرامل أمامية',
      'هوبات فرامل خلفية',
      'زيت فرامل DOT4',
      'منظف فرامل',
      'اصلاح كليبر',
      'لي فرامل',
    ],
    searchTokens: ['هوب', 'فحمات', 'قماش', 'زيت فرامل', 'كليبر', 'لي فرامل'],
  },
  {
    id: 'brakes_rotors',
    systemLabel: 'منظومة الهوبات والفرملة',
    keywords: ['هوب', 'هوبات', 'دسك فرامل', 'rotor', 'brake disc'],
    recommendations: [
      'فحمات فرامل أصلية',
      'رمان هوب',
      'صوفة هوب',
      'مسامير كليبر',
      'شحم كليبر حراري',
      'مسامير كفر',
    ],
    searchTokens: ['فحمات', 'قماش', 'رمان هوب', 'صوفة هوب', 'كليبر', 'مسامير كفر'],
  },

  // 9. Wheel Hub & Bearings (منظومة الرمان والفلنجة)
  {
    id: 'wheel_hub',
    systemLabel: 'منظومة الرمان والهوب',
    keywords: ['رمان', 'رمان هوب', 'رمان كفر', 'فلنجة', 'صوفة هوب', 'wheel bearing', 'hub'],
    recommendations: ['صوفة هوب', 'فلنجة كفر', 'شحم رمان حراري', 'هوب فرامل', 'فحمات فرامل', 'راس عكس'],
    searchTokens: ['صوفة هوب', 'فلنجة', 'رمان', 'شحم', 'هوب', 'فحمات'],
  },

  // 10. Clutch & Transmission (منظومة الكلتش والقير)
  {
    id: 'clutch_transmission',
    systemLabel: 'منظومة الكلتش والقير',
    keywords: [
      'كلتش',
      'دسك كلتش',
      'صحن كلتش',
      'فحمة كلتش',
      'علبة كلتش',
      'قير',
      'جير',
      'ناقل حركة',
      'clutch',
      'flywheel',
      'transmission',
      'atf',
      'cvt',
    ],
    recommendations: [
      'دسك كلتش',
      'صحن كلتش',
      'فحمة كلتش',
      'علبة كلتش فوق',
      'علبة كلتش تحت',
      'صوفة كرنك خلفي',
      'فلتر قير',
      'وجه كارتير قير',
      'معالج زيت قير',
    ],
    searchTokens: ['دسك', 'صحن كلتش', 'فحمة كلتش', 'علبة كلتش', 'فلتر قير', 'وجه كارتير', 'زيت قير'],
  },

  // 11. Ignition System (منظومة الإشعال)
  {
    id: 'ignition',
    systemLabel: 'منظومة الإشعال',
    keywords: ['بواجي', 'شمعات', 'شمعة', 'بوجيه', 'كويل', 'كويلات', 'spark plug', 'coil'],
    recommendations: ['كويلات إشعال', 'طقم بواجي ليزر', 'أسلاك بواجي', 'منظف بخاخات', 'فلتر بنزين', 'فيش كويل'],
    searchTokens: ['بواجي', 'كويل', 'أسلاك بواجي', 'فلتر بنزين', 'منظف بخاخات'],
  },

  // 12. Belts & Timing (منظومة السيور والتوقيت)
  {
    id: 'belts_timing',
    systemLabel: 'منظومة السيور والتوقيت',
    keywords: ['سير', 'سير مكينة', 'تيمين', 'تيمن', 'جنزير', 'صدر', 'شداد', 'بكرة', 'belt', 'timing', 'tensioner'],
    recommendations: ['شداد سير', 'بكرة سير', 'طرمبة ماء', 'سير مكيف', 'سير دينمو', 'صوفة صدر'],
    searchTokens: ['شداد', 'بكرة', 'سير', 'طرمبة ماء', 'صوفة صدر', 'جنزير'],
  },

  // 13. Cooling System (منظومة التبريد)
  {
    id: 'cooling',
    systemLabel: 'منظومة التبريد والرديتر',
    keywords: ['رديتر', 'راديتر', 'طرمبة ماء', 'مضخة ماء', 'بلف حرارة', 'ثرموستات', 'ماء رديتر', 'radiator', 'water pump', 'coolant'],
    recommendations: ['غطاء رديتر أصلي', 'بلف حرارة (ثرموستات)', 'طرمبة ماء', 'ليات رديتر', 'سائل تبريد أصلي', 'معجون وجيه'],
    searchTokens: ['غطاء رديتر', 'بلف حرارة', 'طرمبة ماء', 'لي رديتر', 'ماء رديتر', 'سير'],
  },

  // 14. Fuel System (منظومة الوقود)
  {
    id: 'fuel',
    systemLabel: 'منظومة الوقود والبخاخات',
    keywords: ['طرمبة بنزين', 'طلمبة بنزين', 'فلتر بنزين', 'بخاخ', 'بخاخات', 'fuel pump', 'injector'],
    recommendations: ['فلتر بنزين خارجي', 'منظف دورة الوقود', 'حلق غطاء تانكي', 'بواجي', 'فلتر هواء'],
    searchTokens: ['فلتر بنزين', 'طرمبة بنزين', 'بخاخ', 'منظف', 'فلتر هواء'],
  },

  // 15. Electrical & Battery (منظومة الكهرباء والبطارية)
  {
    id: 'electrical',
    systemLabel: 'منظومة الكهرباء والبطارية',
    keywords: ['بطارية', 'بطاريه', 'دينمو', 'سلف', 'كتاوت', 'battery', 'alternator', 'starter'],
    recommendations: ['أصابع بطارية نحاس', 'فحمات دينمو', 'كتاوت دينمو', 'سير دينمو', 'بخاخ حماية أصابع البطارية'],
    searchTokens: ['أصابع بطارية', 'فحمات دينمو', 'كتاوت', 'سير دينمو', 'بطارية'],
  },

  // 16. Air Conditioning (منظومة التكييف)
  {
    id: 'ac_system',
    systemLabel: 'منظومة التكييف',
    keywords: ['كمبروسر', 'ضاغط', 'مكيف', 'فريون', 'رديتر مكيف', 'ثلاجة مكيف', 'ac compressor'],
    recommendations: ['فلتر مكيف (كابينة)', 'سير مكيف', 'بلف مكيف', 'زيت كمبروسر', 'فريون أصلي'],
    searchTokens: ['فلتر مكيف', 'سير مكيف', 'بلف مكيف', 'فريون', 'كمبروسر'],
  },

  // 17. Wipers & Visibility (منظومة المساحات والإضاءة)
  {
    id: 'wipers',
    systemLabel: 'منظومة المساحات والإضاءة',
    keywords: ['مساحات', 'شفرات مساحات', 'لمبة', 'لمبات', 'wiper', 'wipers'],
    recommendations: ['ماء مساحات مركز', 'لمبات هالوجين/LED', 'ملمع زجاج'],
    searchTokens: ['ماء مساحات', 'لمبة', 'لمبات', 'مساحات'],
  },
];

/**
 * Common vehicle makes and models in Yemen & GCC spare parts catalogs.
 * Used to preserve car-model context when recommending companion parts.
 */
const KNOWN_VEHICLE_TOKENS: readonly string[] = [
  'تويوتا', 'هايلوكس', 'هايلكس', 'كامري', 'كورولا', 'كرولا', 'لاندكروزر', 'شاص', 'ربع',
  'برادو', 'يارس', 'افالون', 'فورتشنر', 'انوفا', 'راف فور', 'هايس', 'كوستر', 'سيكويا', 'تندرا', 'بريفيا', 'لاند',
  'هيونداي', 'هونداي', 'سوناتا', 'النترا', 'اكسنت', 'سنتافي', 'توسان', 'ازيرا', 'سنترا', 'اتش وان', 'ستاركس', 'كريد',
  'كيا', 'اوبتيما', 'سيراتو', 'ريو', 'سبورتاج', 'سورينتو', 'كرنفال', 'بيكانتو',
  'نيسان', 'باترول', 'صني', 'ددسن', 'نافارا', 'التيما', 'مكسيما', 'باثفندر', 'اكستيرا', 'اورفان', 'سفاري',
  'ميتسوبيشي', 'متسوبيشي', 'باجيرو', 'لانسير', 'لانسر', 'ال200', 'l200', 'كانتر', 'اتراج', 'مونتيرو',
  'ايسوزو', 'ديماكس', 'ديمكس', 'ان بي ار', 'npr', 'دينا',
  'هوندا', 'اكورد', 'سيفيك', 'سي ار في', 'اوديسي',
  'سوزوكي', 'فيتارا', 'جيمني', 'سويفت', 'ديزاير', 'ارتيجا',
  'فورد', 'فكتوريا', 'ماركيز', 'اكسبلورر', 'اكسبديشن', 'تورس', 'رينجر', 'اف150',
  'شيفروليه', 'شفروليه', 'تاهو', 'سوبربان', 'كابرس', 'ماليبو', 'افيو', 'اوبترا', 'سيلفرادو',
  'جمس', 'يوكن', 'سييرا',
  'مازدا', 'مازدا 3', 'مازدا 6', 'cx9', 'cx5',
  'دايهاتسو', 'تيريوس', 'سيريون',
  'hilux', 'camry', 'corolla', 'prado', 'yaris', 'land cruiser', 'fortuner', 'hiace',
  'sonata', 'elantra', 'accent', 'tucson', 'santafe', 'patrol', 'sunny', 'pajero', 'dmax', 'accord', 'civic',
];

/**
 * Normalizes Arabic & Latin text for resilient matching:
 * unifies أ/إ/آ -> ا, ة -> ه, ى -> ي, strips tashkeel and punctuation.
 */
export function normalizeAutomotiveText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NORMALIZED_VEHICLES = KNOWN_VEHICLE_TOKENS.map(v => ({
  raw: v,
  norm: normalizeAutomotiveText(v),
}));

/**
 * Extracts recognizable vehicle model & year tokens from a product name or search query.
 */
export function extractVehicleTokens(text: string): string[] {
  const norm = normalizeAutomotiveText(text);
  if (!norm) return [];

  const found: string[] = [];

  for (const v of NORMALIZED_VEHICLES) {
    if (norm.includes(v.norm) && !found.includes(v.raw)) {
      found.push(v.raw);
    }
  }

  // Extract 4-digit vehicle model years (1990-2030)
  const yearMatches = norm.match(/\b(199\d|20[0-2]\d)\b/g);
  if (yearMatches) {
    for (const y of yearMatches) {
      if (!found.includes(y)) found.push(y);
    }
  }

  return found.slice(0, 3);
}

/**
 * Analyzes a product name or search query and returns all matching mechanical
 * systems, companion chips, high-recall inventory search tokens, and vehicle context.
 */
export function analyzeAutomotiveQuery(text: string): AutomotiveRelationResult {
  const norm = normalizeAutomotiveText(text);
  if (!norm || norm.length < 2) {
    return {
      matchedSystems: [],
      primarySystemLabel: null,
      companionChips: [],
      searchTokens: [],
      vehicleTokens: [],
    };
  }

  const matchedSystems: CompanionRule[] = [];
  const companionChips: string[] = [];
  const searchTokens: string[] = [];

  for (const rule of AUTOMOTIVE_COMPANION_RULES) {
    const isMatch = rule.keywords.some(kw => {
      const normKw = normalizeAutomotiveText(kw);
      return normKw.length >= 2 && (norm.includes(normKw) || normKw.includes(norm));
    });

    if (isMatch) {
      matchedSystems.push(rule);
      for (const rec of rule.recommendations) {
        const recNorm = normalizeAutomotiveText(rec);
        if (!norm.includes(recNorm) && !companionChips.includes(rec)) {
          companionChips.push(rec);
        }
      }
      for (const tok of rule.searchTokens) {
        if (!searchTokens.includes(tok)) {
          searchTokens.push(tok);
        }
      }
    }
  }

  const vehicleTokens = extractVehicleTokens(text);

  return {
    matchedSystems,
    primarySystemLabel: matchedSystems[0]?.systemLabel ?? null,
    companionChips: companionChips.slice(0, 8),
    searchTokens: searchTokens.slice(0, 8),
    vehicleTokens,
  };
}

/**
 * Builds a clean Google Search URL for a spare part or raw search term.
 */
export function buildGoogleSearchUrl(params: {
  name?: string | null;
  partNumber?: string | null;
  brand?: string | null;
  query?: string | null;
}): string {
  const parts = params.query?.trim()
    ? [params.query.trim()]
    : [params.partNumber?.trim(), params.brand?.trim(), params.name?.trim()].filter(Boolean);

  const q = parts.join(' ').trim() || 'قطع غيار سيارات';
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/**
 * Extracts local cross-sell suggestions based on items in the cart.
 *
 * @param cartItemNames List of item names currently in the cart
 * @param limit Maximum number of suggestions to return (default: 6)
 * @returns Deduplicated list of recommended products
 */
export function getLocalCrossSellSuggestions(cartItemNames: string[], limit = 6): string[] {
  if (!cartItemNames || cartItemNames.length === 0) {
    return [];
  }

  const normalizedCart = cartItemNames.map(normalizeAutomotiveText);
  const matchedRecommendations: string[] = [];

  for (const cartName of normalizedCart) {
    if (!cartName) continue;

    for (const rule of AUTOMOTIVE_COMPANION_RULES) {
      const isMatch = rule.keywords.some(kw => {
        const normalizedKw = normalizeAutomotiveText(kw);
        return cartName.includes(normalizedKw) || normalizedKw.includes(cartName);
      });

      if (isMatch) {
        for (const rec of rule.recommendations) {
          const recNorm = normalizeAutomotiveText(rec);
          const alreadyInCart = normalizedCart.some(
            c => c.includes(recNorm) || recNorm.includes(c)
          );
          if (!alreadyInCart && !matchedRecommendations.includes(rec)) {
            matchedRecommendations.push(rec);
          }
        }
      }
    }
  }

  if (matchedRecommendations.length === 0) {
    const universalFallbacks = [
      'فلتر زيت محرك',
      'فلتر هواء محرك',
      'ماء مساحات مركز',
      'زيت فرامل DOT4',
      'منظف بخاخات',
      'فلتر مكيف',
    ];
    for (const item of universalFallbacks) {
      const itemNorm = normalizeAutomotiveText(item);
      const alreadyInCart = normalizedCart.some(c => c.includes(itemNorm) || itemNorm.includes(c));
      if (!alreadyInCart && !matchedRecommendations.includes(item)) {
        matchedRecommendations.push(item);
      }
    }
  }

  return matchedRecommendations.slice(0, limit);
}
