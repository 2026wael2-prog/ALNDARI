/**
 * تحديد تاريخ استحقاق فاتورة البيع — مصدر واحد للحقيقة في طبقة الواجهة.
 *
 * العيب المُصلَح (تقرير إصلاح الديون 2026-11-03 / §18):
 *   كان `sales/api/index.ts` يرسل `p_due_date = formatLocalDate()` عند غياب
 *   تاريخ استحقاق صريح، أي **تاريخ اليوم** ⇒ صفر يوم سماح لكل فاتورة آجلة،
 *   بينما `parties.payment_terms_days = 30` لكل طرف. النتيجة: 100% من
 *   المديونية تُصنَّف «متأخرة» منذ لحظة الإصدار، فتفقد شاشة التحصيل
 *   وتقادم الأعمار والتصعيد معناها.
 *
 * القاعدة المعتمدة:
 *   • تاريخ صريح صالح ⇒ يُحترم كما هو (نية المستخدم أولاً)، ويُقيَّد بحدّه
 *     الأدنى `issue_date` لتفادي خرق القيد `chk_due_after_issue`.
 *   • بيع نقدي ⇒ الاستحقاق = تاريخ الإصدار (لا أجل).
 *   • بيع آجل ومدة السماح معروفة ⇒ الإصدار + المدة.
 *   • بيع آجل ومدة السماح مجهولة ⇒ `null` ليحسمها الخادم من
 *     `parties.payment_terms_days` عبر مُشغّل قاعدة البيانات.
 *     لا نُخمّن 30 يوماً هنا: التخمين في الواجهة يعني نسختين من الحقيقة.
 */
import { formatLocalDate } from '@/core/utils/dateUtils';

/** تاريخ ISO صالح بالصيغة YYYY-MM-DD فقط (لا نقبل تواريخ فضفاضة). */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface IsoParts {
  year: number;
  month: number;
  day: number;
}

/**
 * يتحقق أن (سنة/شهر/يوم) تاريخ تقويمي حقيقي (يرفض 2026-02-30).
 * مفصولة عن التحليل لإبقاء تعقيد الدالة الأم منخفضاً وقابلاً للمراجعة.
 */
const isRealCalendarDate = ({ year, month, day }: IsoParts): boolean => {
  const probe = new Date(year, month - 1, day);
  return (
    probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === day
  );
};

/**
 * يُحلّل تاريخاً محلياً بلا أي تحويل إلى UTC، ويعيد `null` إن كان غير صالح.
 * نستخدم البناء المحلي `new Date(y, m-1, d)` لأن `new Date('2026-03-01')`
 * يُفسَّر كـ UTC فينزاح اليوم في مناطق GMT+2/+3.
 */
const parseIsoDate = (value: string | null | undefined): IsoParts | null => {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE_RE.exec(value.trim());
  if (match === null) return null;

  const parts: IsoParts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return null;
  return isRealCalendarDate(parts) ? parts : null;
};

/** يُعيد التاريخ بصيغته القانونية YYYY-MM-DD من مكوّناته المُتحقَّق منها. */
const toIsoDate = ({ year, month, day }: IsoParts): string =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * يُضيف عدداً من الأيام إلى تاريخ ISO محلياً ويعيد ISO محلياً.
 * يعتمد حساب المكوّنات المحلية، لذا يبقى صحيحاً عبر تغيّرات التوقيت الصيفي.
 */
export const addDaysToIsoDate = (isoDate: string, days: number): string => {
  const parts = parseIsoDate(isoDate);
  if (parts === null) return '';
  const wholeDays = Number.isFinite(days) ? Math.trunc(days) : 0;
  const shifted = new Date(parts.year, parts.month - 1, parts.day + wholeDays);
  return formatLocalDate(shifted);
};

export interface ResolveDueDateInput {
  /** تاريخ إصدار الفاتورة (YYYY-MM-DD). يُستخدم تاريخ اليوم عند غيابه. */
  issueDate?: string | null;
  /** تاريخ الاستحقاق الذي اختاره المستخدم صراحةً — يسبق أي اشتقاق. */
  explicitDueDate?: string | null;
  /** طريقة الدفع: النقدي لا أجل له. */
  paymentMethod?: string | null;
  /** مدة السماح الخاصة بالطرف (`parties.payment_terms_days`) إن كانت معروفة. */
  paymentTermsDays?: number | null;
}

/**
 * يعيد تاريخ الاستحقاق الذي يجب إرساله إلى `commit_sales_invoice_v2`.
 * `null` تعني «لا تاريخ صريح — اتركه للخادم».
 */
export const resolveSaleInvoiceDueDate = (input: ResolveDueDateInput): string | null => {
  const issueParts = parseIsoDate(input.issueDate);
  const issueDate = issueParts === null ? formatLocalDate() : toIsoDate(issueParts);

  const explicitParts = parseIsoDate(input.explicitDueDate);
  const explicit = explicitParts === null ? null : toIsoDate(explicitParts);

  if (explicit !== null) {
    // قيد قاعدة البيانات chk_due_after_issue يرفض استحقاقاً قبل الإصدار،
    // فنُقيّده بدل إرسال قيمة تُفشل الفاتورة كلها.
    return addDaysToIsoDate(explicit, 0) < issueDate ? issueDate : explicit;
  }

  const isCredit = (input.paymentMethod ?? 'cash').toLowerCase() === 'credit';
  if (!isCredit) {
    return issueDate;
  }

  const terms = input.paymentTermsDays;
  if (typeof terms !== 'number' || !Number.isFinite(terms)) {
    // الخادم يحسمها من `parties.payment_terms_days` عبر المُشغّل.
    return null;
  }

  return addDaysToIsoDate(issueDate, terms > 0 ? Math.trunc(terms) : 0);
};
