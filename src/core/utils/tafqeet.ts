/**
 * Arabic Number to Words (Tafqeet) — تفقيط المبالغ المالية للطباعة.
 *
 * الضمانات:
 *  - لا استدعاء ذاتي غير محدود: أي قيمة غير منتهية (NaN/Infinity) تُعطي نصًّا فارغًا
 *    بدل RangeError (كان `convertGroup(NaN)` يعيد استدعاء نفسه بلا نهاية).
 *  - التقريب يتم على الخانات العشرية أولًا ثم يُرحَّل للصحيح: 1.999 → «اثنان»
 *    وليس «واحد و مئة هللة».
 *  - يدعم حتى 999,999,999,999 (مليار) بدل تسمية 1e9 «ألف مليون».
 *  - يحفظ الإشارة: -5 → «سالب خمسة».
 *  - اسم الكسر (هللة/فلس/سنت) يُشتق من العملة، ولا يُفرض على عملة أخرى.
 */

const ones = [
  '',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
] as const;

const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'] as const;

const hundreds = [
  '',
  'مئة',
  'مئتان',
  'ثلاثمئة',
  'أربعمئة',
  'خمسمئة',
  'ستمئة',
  'سبعمئة',
  'ثمانمئة',
  'تسعمئة',
] as const;

/** الكسور العشرية بحسب العملة — بلا فرض «هللة» على الريال اليمني أو الدولار. */
const subUnitOf = (currency: string): string => {
  const upper = currency.toUpperCase();
  if (upper.includes('YER') || currency.includes('يمني') || currency.trim() === 'ر.ي') return 'فلس';
  if (upper.includes('USD') || currency.includes('دولار') || currency.trim() === '$') return 'سنت';
  if (
    upper.includes('SAR') ||
    currency.includes('سعودي') ||
    currency.trim() === 'ر.س'
  ) {
    return 'هللة';
  }
  return '';
};

/** 0..999 */
const convertGroup = (n: number): string => {
  if (n <= 0) return '';
  if (n < 20) return ones[n] ?? '';
  if (n < 100) {
    const one = n % 10;
    const ten = Math.floor(n / 10);
    return (one > 0 ? (ones[one] ?? '') + ' و ' : '') + (tens[ten] ?? '');
  }
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return (hundreds[hundred] ?? '') + (rest > 0 ? ' و ' + convertGroup(rest) : '');
};

interface Scale {
  value: number;
  singular: string;
  dual: string;
  plural: string;
}

/** من الكبير إلى الصغير — كل مجموعة تُقرأ بوزنها الصحيح. */
const SCALES: readonly Scale[] = [
  { value: 1_000_000_000_000, singular: 'تريليون', dual: 'تريليونان', plural: 'تريليونات' },
  { value: 1_000_000_000, singular: 'مليار', dual: 'ملياران', plural: 'مليارات' },
  { value: 1_000_000, singular: 'مليون', dual: 'مليونان', plural: 'ملايين' },
  { value: 1_000, singular: 'ألف', dual: 'ألفان', plural: 'آلاف' },
];

const scaleWord = (count: number, scale: Scale): string => {
  if (count === 1) return scale.singular;
  if (count === 2) return scale.dual;
  // 3..10 جمع، وما فوقها مفرد («أحد عشر مليارًا» تُبسّط إلى «مليار»).
  // convertInteger (لا convertGroup) لأن العدد قد يتجاوز 999 عند التريليونات.
  if (count >= 3 && count <= 10) return convertInteger(count) + ' ' + scale.plural;
  return convertInteger(count) + ' ' + scale.singular;
};

const convertInteger = (value: number): string => {
  let remaining = Math.floor(value);
  const parts: string[] = [];

  for (const scale of SCALES) {
    if (remaining >= scale.value) {
      const count = Math.floor(remaining / scale.value);
      remaining %= scale.value;
      parts.push(scaleWord(count, scale));
    }
  }

  if (remaining > 0) parts.push(convertGroup(remaining));
  return parts.join(' و ');
};

/**
 * @param n المبلغ (يُقبل سالبًا)
 * @param currency اسم العملة كما يُطبع (مثل «ر.س» أو «ريال يمني»)
 * @returns النص التفقيطي، أو '' لقيمة غير منتهية — والطباعة تتحقق من الفراغ.
 */
export function tafqeet(n: number, currency = 'ر.س'): string {
  if (!Number.isFinite(n)) return '';

  // التقريب على الخانات العشرية أولًا يمنع بقايا العائمة (1.999 → 2.00)
  const cents = Math.round(Math.abs(n) * 100);
  const integerPart = Math.floor(cents / 100);
  const decimalPart = cents % 100;

  const label = currency.trim();
  const suffix = label === '' ? '' : ' ' + label;

  if (integerPart === 0 && decimalPart === 0) return 'صفر' + suffix;

  const words: string[] = [];
  if (integerPart > 0) words.push(convertInteger(integerPart));

  if (decimalPart > 0) {
    const unit = subUnitOf(label);
    words.push(convertGroup(decimalPart) + (unit === '' ? '' : ' ' + unit));
  }

  const sign = n < 0 ? 'سالب ' : '';
  return sign + words.join(' و ') + suffix;
}
