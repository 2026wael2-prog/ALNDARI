import type { TrialBalanceItem } from '../../types/index';

export interface TrialBalanceRpcRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
  balance: number;
  is_cogs?: boolean;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const COGS_NAME_KEYWORDS = [
  'تكلفة المبيعات',
  'تكلفة البضاعة',
  'تكلفة القطع',
  'مشتريات بضاعة',
  'إجمالي المشتريات',
  'صافي المشتريات',
  'مردود مشتريات',
  'مرتجع مشتريات',
  'حسم نقدي مكتسب',
  'حسم تجاري مكتسب',
  'خصم مكتسب',
  'فروق وتسويات المخزون',
  'بضاعة أول المدة',
  'بضاعة اول المدة',
  'بضاعة آخر المدة',
  'بضاعة اخر المدة',
  'حساب المتاجرة',
];

const TREASURY_NAME_KEYWORDS = [
  'صندوق',
  'خزينة',
  'خزنة',
  'بنك',
  'مصرف',
  'صراف',
  'الكريمي',
  'أموال جاهزة',
];

/**
 * تصنيف حساب تكلفة المبيعات (COGS) بشكل موحّد يشمل:
 * - علامة `is_cogs` القادمة من قاعدة البيانات
 * - الأكواد القياسية (5100 / 51xx) وأكواد الميزان (MZ-5xxx / 312xxx / MZ-312xxx)
 * - الأسماء العربية الصريحة لتكلفة المبيعات والمشتريات وبضاعة أول/آخر المدة
 */
export const isCogsAccount = (code: string, name?: string, isCogsFlag?: boolean): boolean => {
  if (isCogsFlag === true) return true;
  const normalizedCode = (code || '').trim().toUpperCase();
  if (
    normalizedCode === '5100' ||
    normalizedCode.startsWith('51') ||
    normalizedCode.startsWith('MZ-5') ||
    normalizedCode.startsWith('312') ||
    normalizedCode.startsWith('MZ-312')
  ) {
    return true;
  }

  const normalizedName = (name || '').trim();
  if (!normalizedName) return false;
  if (COGS_NAME_KEYWORDS.some(keyword => normalizedName.includes(keyword))) {
    return true;
  }

  return (
    normalizedName.includes('مشتريات') &&
    !normalizedName.includes('أصول') &&
    !normalizedName.includes('قرطاسية') &&
    !normalizedName.includes('مهمات')
  );
};

/**
 * تحديد ما إذا كان الحساب يتبع للخزنة/النقدية والبنوك والصرافة:
 * - الحسابات المرتبطة مباشرة في جدولي cashboxes / exchange_companies
 * - الأكواد 101xx / 102xx / 103xx / 111xx / MZ-13xx / MZ-14xx (و 10xx عدا 1000)
 * - حسابات الأصول التي يحتوي اسمها على صندوق / خزنة / بنك / مصرف / صراف
 * مع استبعاد الحساب الرئيسي للأصول (1000) والذمم (1100 / 121 / MZ-121) والمخزون (1200).
 */
export const isTreasuryAccount = (
  acc: {
    id?: string | undefined;
    code: string;
    name?: string | undefined;
    name_ar?: string | undefined;
    type?: string | undefined;
  },
  linkedAccountIds?: Set<string>,
  id?: string
): boolean => {
  const effectiveId = id ?? acc.id;
  if (effectiveId && linkedAccountIds?.has(effectiveId)) {
    return true;
  }

  const normalizedCode = (acc.code || '').trim().toUpperCase();
  if (
    normalizedCode === '1000' ||
    normalizedCode === '1100' ||
    normalizedCode === '1200' ||
    normalizedCode.startsWith('121') ||
    normalizedCode.startsWith('MZ-121')
  ) {
    return false;
  }

  if (acc.type && acc.type !== 'asset') {
    return false;
  }

  if (
    normalizedCode.startsWith('101') ||
    normalizedCode.startsWith('102') ||
    normalizedCode.startsWith('103') ||
    normalizedCode.startsWith('111') ||
    normalizedCode.startsWith('MZ-13') ||
    normalizedCode.startsWith('MZ-14') ||
    (normalizedCode.startsWith('10') && normalizedCode !== '1000')
  ) {
    return true;
  }

  const accountName = `${acc.name_ar ?? ''} ${acc.name ?? ''}`.trim();
  if (!accountName) return false;
  return TREASURY_NAME_KEYWORDS.some(keyword => accountName.includes(keyword));
};

export const toTrialBalanceRows = (value: unknown): TrialBalanceRpcRow[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap(row => {
    const total_debit = Number(row.total_debit);
    const total_credit = Number(row.total_credit);
    const balance = Number(row.balance);
    if (
      (row.account_id !== null && typeof row.account_id !== 'string') ||
      typeof row.account_code !== 'string' ||
      typeof row.account_name !== 'string' ||
      typeof row.account_type !== 'string' ||
      Number.isNaN(total_debit) ||
      Number.isNaN(total_credit) ||
      Number.isNaN(balance)
    ) {
      return [];
    }
    return [
      {
        account_id:
          typeof row.account_id === 'string' ? row.account_id : `synthetic-${row.account_code}`,
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        total_debit,
        total_credit,
        balance,
        is_cogs: typeof row.is_cogs === 'boolean' ? row.is_cogs : false,
      },
    ];
  });
};

export const mapRpcRowToTrialBalanceItem = (row: TrialBalanceRpcRow): TrialBalanceItem => ({
  account_id: row.account_id,
  code: row.account_code,
  name: row.account_name,
  type: row.account_type,
  total_debit: row.total_debit,
  total_credit: row.total_credit,
  net_balance: row.balance,
});
