/**
 * بصمة مختصرة لكشف تعديل كميات الجرد دون تخصيص ميغابايتات من JSON.
 *
 * سبب وجود الملف: كانت الدالة داخل `AuditSessionPage` ومحاطة بكتلة
 * `eslint-disable` عريضة (‏`security/detect-object-injection` +
 * `restrict-template-expressions` + `prefer-nullish-coalescing` + ...)، فكانت
 * تخفي أي مخالفة جديدة في الصفحة كلها. هنا نُفّذت كتابةً نظيفة لا تحتاج أي
 * تعطيل: مفاتيح حرفية، وتحويل صريح للأنواع، و`??` بدل `||`.
 *
 * البصمة تُستخدم فقط للمقارنة الداخلية (هل تغيّرت الكميات؟) ولا تُخزَّن، لكن
 * صيغتها ثابتة: `العدد:معرّف=الكمية;...`.
 */
export function computeItemsSignature(items: Array<Record<string, unknown>>): string {
  let signature = `${String(items.length)}:`;

  items.forEach((item, index) => {
    const productId = toIdentifier(item.product_id ?? item.id ?? index);
    const counted = item.counted_quantity;
    if (counted === undefined || counted === null || counted === '') return;
    signature += `${productId}=${toText(counted)};`;
  });

  return signature;
}

/** معرّف نصيّ آمن للمنتج (يرجع نصاً فارغاً للأنواع غير المدعومة). */
const toIdentifier = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  return '';
};

/** تحويل قيمة كمية إلى نص بلا استدعاء `String` على كائنات. */
const toText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};
