import type { CompanyHeaderData } from '../PrintDocumentHeader';

/** بيانات المنشأة كما تصل من جدول `companies` أو من إعدادات الفاتورة. */
export interface InvoiceCompanyInfo {
  name_ar?: string | null | undefined;
  name?: string | null | undefined;
  name_en?: string | null | undefined;
  english_name?: string | null | undefined;
  address?: string | null | undefined;
  phone?: string | null | undefined;
  tax_number?: string | null | undefined;
  cr_number?: string | null | undefined;
  specialization?: string | null | undefined;
  email?: string | null | undefined;
  logo_url?: string | null | undefined;
}

/** الحقول التي تقرأها الفاتورة من إعدادات المتجر (لا أكثر). */
export interface InvoiceSettingsInfo {
  company_name_ar?: string | null | undefined;
  company_name_en?: string | null | undefined;
  company_address?: string | null | undefined;
  company_specialization?: string | null | undefined;
  company_phone?: string | null | undefined;
  company_email?: string | null | undefined;
}

/** رأس مستند الفاتورة بعد الحل — كل الحقول مُهيّأة للعرض. */
export interface InvoiceCompanyHeader {
  nameAr: string;
  nameEn: string;
  address: string;
  taxNumber: string;
  crNumber: string;
  specialization: string;
  phone: string;
  email: string;
  logoUrl: string;
}

export const EMPTY_COMPANY_HEADER: InvoiceCompanyHeader = {
  nameAr: 'اسم المنشأة التجارية',
  nameEn: 'Commercial Enterprise',
  address: 'المملكة العربية السعودية',
  taxNumber: '---',
  crNumber: '',
  specialization: 'تجارة قطع غيار السيارات ومستلزماتها',
  phone: '',
  email: '',
  logoUrl: '',
};

const text = (value: string | null | undefined): string => (value ?? '').trim();

/** أول قيمة نصية غير فارغة من القائمة — أداة حل الأولويات. */
export const firstNonEmpty = (...candidates: Array<string | null | undefined>): string => {
  for (const candidate of candidates) {
    const value = text(candidate);
    if (value !== '') return value;
  }
  return '';
};

/**
 * يحل رأس المنشأة بأولوية: إعدادات الفاتورة ← بيانات القاعدة ← الحالة السابقة.
 * يعيد كائناً كامل الحقول كي لا يظهر undefined في الطباعة.
 */
export const resolveCompanyHeader = (params: {
  previous: InvoiceCompanyHeader;
  settingsCompany?: InvoiceCompanyInfo | null | undefined;
  invoiceCompany?: InvoiceCompanyInfo | null | undefined;
  invoiceSettings?: InvoiceSettingsInfo | null | undefined;
}): InvoiceCompanyHeader => {
  const { previous, settingsCompany, invoiceCompany, invoiceSettings } = params;
  const company = settingsCompany ?? invoiceCompany ?? {};
  const settings = invoiceSettings ?? {};
  return {
    nameAr:
      firstNonEmpty(settings.company_name_ar, company.name_ar, company.name, previous.nameAr) ||
      EMPTY_COMPANY_HEADER.nameAr,
    nameEn:
      firstNonEmpty(settings.company_name_en, company.name_en, company.english_name, previous.nameEn) ||
      EMPTY_COMPANY_HEADER.nameEn,
    address:
      firstNonEmpty(settings.company_address, company.address, previous.address) ||
      EMPTY_COMPANY_HEADER.address,
    taxNumber:
      firstNonEmpty(company.tax_number, previous.taxNumber) || EMPTY_COMPANY_HEADER.taxNumber,
    crNumber: firstNonEmpty(company.cr_number, previous.crNumber),
    specialization:
      firstNonEmpty(settings.company_specialization, company.specialization, previous.specialization) ||
      EMPTY_COMPANY_HEADER.specialization,
    phone: firstNonEmpty(settings.company_phone, company.phone, previous.phone),
    email: firstNonEmpty(settings.company_email, company.email, previous.email),
    logoUrl: firstNonEmpty(previous.logoUrl, company.logo_url),
  };
};

/**
 * دمج تعديل المستخدم على الترويسة (نموذج `PrintDocumentHeader`) في الحالة
 * الحالية دون إدخال `undefined` إلى حقول الطباعة.
 */
export const mergeCompanyHeader = (
  previous: InvoiceCompanyHeader,
  updated: Partial<CompanyHeaderData>
): InvoiceCompanyHeader => ({
  nameAr: updated.nameAr ?? previous.nameAr,
  nameEn: updated.nameEn ?? previous.nameEn,
  address: updated.address ?? previous.address,
  taxNumber: updated.taxNumber ?? previous.taxNumber,
  crNumber: updated.crNumber ?? previous.crNumber,
  specialization: updated.specialization ?? previous.specialization,
  phone: updated.phone ?? previous.phone,
  email: updated.email ?? previous.email,
  logoUrl: updated.logoUrl ?? previous.logoUrl,
});
