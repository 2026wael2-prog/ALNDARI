/**
 * تحويلات قيم آمنة للأنواع تُستخدم في شاشات الجرد.
 *
 * سبب وجود الملف: كان النمط `String(raw.field || '')` متكرراً في
 * `AuditSessionPage` فينتج `@typescript-eslint/no-base-to-string` (لأن `String`
 * على كائن يعطي `[object Object]`) و`prefer-nullish-coalescing`. هذه الدوال
 * تجعل النية صريحة: نص فقط، أو رقم فقط، أو أول قيمة غير فارغة.
 */

/** أول قيمة نصية غير فارغة (بديل `a || b || ''`). */
export const firstFilled = (...values: Array<string | null | undefined>): string =>
  values.find(value => value !== null && value !== undefined && value !== '') ?? '';

/** يحوّل قيمة مجهولة إلى نص فقط إن كانت أولية. */
export const toText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

/** يحوّل قيمة مجهولة إلى رقم (0 عند الفراغ أو عدم الصلاحية). */
export const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
