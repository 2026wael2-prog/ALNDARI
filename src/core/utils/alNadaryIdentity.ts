import { useAuthStore } from '@/features/auth/store';
import { useBranchFilterStore } from '@/features/branches/store';
import { queryClient } from '@/lib/queryClient';
import { usePrintTemplateStore } from '@/ui/print/printTemplateStore';

export const ALNADARY_DEFAULT_LOGO = '/assets/alnadary-print-logo.svg';
export const ALNADARY_DEFAULT_NAME = 'النظــــاري';
export const ALNADARY_DEFAULT_PLAIN_NAME = 'النظاري لبيع قطع غيار السيارات';
export const ALNADARY_DEFAULT_TAGLINE: readonly string[] = [
  'لبيع قطع غيار السيارات بجميع أنواعها',
  'وبيع جميع أنواع الفريمات والمكملات',
  'والزيوت والإطارات والبطاريات',
];
export const ALNADARY_DEFAULT_ADDRESS = 'الجمهورية اليمنية - المهرة - الغيظة - خلف مطعم قطر';
export const ALNADARY_DEFAULT_PHONE = 'هاتف : 05610263 - جوال : 712165706 - 770319249';

export interface AlNadaryIdentityOverride {
  nameAr?: string | null | undefined;
  branchName?: string | null | undefined;
  logoUrl?: string | null | undefined;
  address?: string | null | undefined;
  phone?: string | null | undefined;
  taglineLines?: readonly string[] | undefined;
}

export interface ResolvedAlNadaryIdentity {
  companyTitle: string;
  plainCompanyName: string;
  branchName: string | null;
  taglineLines: readonly string[];
  logoUrl: string;
  address: string;
  phone: string;
  showLogo: boolean;
}

interface CachedBranchRecord {
  id: string;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  is_main?: boolean | null;
}

const cleanStr = (val: string | null | undefined): string => (val ?? '').trim();

/** يستبعد العناوين الافتراضية القديمة المرتبطة بالسعودية لضمان عرض عنوان الجمهورية اليمنية دائماً. */
const sanitizeAddress = (val: string | null | undefined): string => {
  const s = cleanStr(val);
  if (!s) return '';
  if (
    s.includes('المملكة العربية السعودية') ||
    s.includes('السعودية') ||
    s.toLowerCase().includes('saudi arabia')
  ) {
    return '';
  }
  return s;
};

/**
 * يقرأ بيانات الفرع النشط (الاسم، الهاتف، العنوان) من حالة التطبيق والكاش المحلي
 * بدون أي طلب شبكة إضافي، لتمكين تخصيص الترويسة والأرقام تلقائياً لكل فرع.
 */
export function getActiveBranchIdentity(): CachedBranchRecord | null {
  try {
    const user = useAuthStore.getState().user;
    const branchState = useBranchFilterStore.getState();
    const companyId = user?.company_id ?? branchState.activeCompanyId ?? null;
    const isManager =
      user?.role === 'owner' || user?.role === 'admin' || user?.role === 'manager';

    const effectiveBranchId = isManager
      ? branchState.allBranchesSelected
        ? null
        : (branchState.activeBranchId ?? user?.branch_id ?? null)
      : (user?.branch_id ?? null);

    const effectiveBranchName = isManager
      ? branchState.allBranchesSelected
        ? null
        : (branchState.activeBranchName ?? user?.branch_name ?? null)
      : (user?.branch_name ?? null);

    if (!effectiveBranchId) return null;

    const cachedLists = queryClient.getQueriesData<CachedBranchRecord[]>({
      queryKey: ['branches'],
    });
    for (const [, list] of cachedLists) {
      if (Array.isArray(list)) {
        const match = list.find(b => b.id === effectiveBranchId);
        if (match) return match;
      }
    }

    if (companyId) {
      const direct = queryClient.getQueryData<CachedBranchRecord[]>(['branches', companyId]);
      if (Array.isArray(direct)) {
        const match = direct.find(b => b.id === effectiveBranchId);
        if (match) return match;
      }
    }

    return effectiveBranchName ? { id: effectiveBranchId, name: effectiveBranchName } : null;
  } catch {
    return null;
  }
}

/**
 * يوحّد هوية شركة النظاري مع التخصيص التلقائي لكل فرع + التعديلات المحفوظة في محرر القالب.
 */
export function resolveAlNadaryIdentity(
  override?: AlNadaryIdentityOverride | null
): ResolvedAlNadaryIdentity {
  const activeBranch = getActiveBranchIdentity();
  const tpl = usePrintTemplateStore.getState().config;
  const branchOverride = activeBranch?.id ? tpl.branchOverrides[activeBranch.id] : undefined;

  const branchName =
    cleanStr(branchOverride?.branchName) ||
    cleanStr(override?.branchName) ||
    cleanStr(activeBranch?.name) ||
    null;

  const address =
    sanitizeAddress(branchOverride?.address) ||
    sanitizeAddress(activeBranch?.address) ||
    sanitizeAddress(override?.address) ||
    sanitizeAddress(tpl.defaultAddress) ||
    ALNADARY_DEFAULT_ADDRESS;

  const phone =
    cleanStr(branchOverride?.phone) ||
    cleanStr(activeBranch?.phone) ||
    cleanStr(override?.phone) ||
    cleanStr(tpl.defaultPhone) ||
    ALNADARY_DEFAULT_PHONE;

  const logoUrl =
    cleanStr(branchOverride?.logoUrl) ||
    cleanStr(override?.logoUrl) ||
    cleanStr(tpl.logoUrl) ||
    ALNADARY_DEFAULT_LOGO;

  const taglineLines =
    override?.taglineLines && override.taglineLines.length > 0
      ? override.taglineLines
      : tpl.taglineLines.filter(Boolean).length > 0
        ? tpl.taglineLines
        : ALNADARY_DEFAULT_TAGLINE;

  return {
    companyTitle: cleanStr(tpl.companyTitle) || ALNADARY_DEFAULT_NAME,
    plainCompanyName: ALNADARY_DEFAULT_PLAIN_NAME,
    branchName,
    taglineLines,
    logoUrl,
    address,
    phone,
    showLogo: tpl.showLogo,
  };
}

/**
 * ترويسة نصية رسمية موحدة لرسائل الواتساب وتليجرام (بدون رموز عشوائية).
 */
export function buildOfficialTextHeader(override?: AlNadaryIdentityOverride | null): string {
  const id = resolveAlNadaryIdentity(override);
  const lines: string[] = [
    `*${id.plainCompanyName}*`,
    ...(id.branchName ? [`*${id.branchName}*`] : []),
    ...id.taglineLines,
    `العنوان: ${id.address}`,
    id.phone.includes('هاتف') || id.phone.includes('جوال') ? id.phone : `هاتف: ${id.phone}`,
    '━━━━━━━━━━━━━━━━━━━━━━',
  ];
  return lines.join('\n') + '\n\n';
}
