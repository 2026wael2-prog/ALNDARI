/**
 * قراءة كميات الجرد من أي مصدر (نموذج / مسودة / خادم) بقاعدة واحدة.
 *
 * سبب وجود الملف: حقل الكمية الرقمي الفارغ كان يُرجع `NaN` من
 * react-hook-form (`valueAsNumber`)، و`NaN` كان يعبر فحوص `!== ''` إلى:
 *  • عمود «الفرق» وتذييل الجدول ⇒ نص `NaN` أمام المستخدم.
 *  • `calculateAuditStats` ⇒ `discrepancyValue = NaN` في بلاطة الأثر المالي.
 *  • `buildProgressItems` ⇒ `null` يُرسل للخادم، و`save_audit_progress` تكتب
 *    `counted_quantity = NULL` ⇒ **مسح كمية سبق جردها** لمجرد تفريغ الحقل.
 *
 * القاعدة هنا: أي قيمة غير منتهية (NaN/Infinity/فراغ) = `null` (غير مجرود)،
 * ولا يُعدَّل أي رقم صالح إطلاقاً — فالكميات المجرودة وقيد الجرد لا تتأثر.
 */

/**
 * يحوّل قيمة كمية إلى رقم صالح أو `null`.
 *
 * ملاحظة محاسبية: الأرقام السالبة تُعاد كما هي (لا تُحوَّل إلى `null`)
 * حتى لا يتحوّل خطأ إدخال إلى «مسح كمية»؛ رفضها مسؤولية قيد الخادم
 * (`save_audit_progress` يرفض < 0 و > 1000000) ورسالة `parseError` الواضحة.
 */
export const toCountedQuantity = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * `setValueAs` لحقل الكمية: يُمنع دخول `NaN` إلى النموذج أصلاً.
 * حقل فارغ ⇒ `null` (لا `NaN` ولا `0`) — نفس دلالة الحفظ السابقة، لكن بلا `NaN`.
 */
export const parseCountedInput = (value: unknown): number | null => toCountedQuantity(value);
