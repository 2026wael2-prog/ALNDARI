/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { WhatsappHeaderConfig } from '../types/documentHeader';
import { buildOfficialTextHeader, resolveAlNadaryIdentity } from './alNadaryIdentity';

export interface CompanyHeaderSource {
  name: string;
  branchName?: string | undefined;
  slogan?: string | undefined;
  phone?: string | undefined;
  taxNumber?: string | undefined;
  address?: string | undefined;
}

/**
 * يبني الترويسة النصية الرسمية الموحدة لرسائل الواتساب وتليجرام
 * متضمنة هوية شركة النظاري والفرع النشط وأرقام التواصل بشكل رسمي معتمد.
 */
export function buildWhatsappHeader(
  config: WhatsappHeaderConfig,
  company: CompanyHeaderSource
): string {
  const parts: string[] = [];

  if (config.customGreeting && config.customGreeting.trim()) {
    parts.push(config.customGreeting.trim());
  }

  const identity = resolveAlNadaryIdentity({
    nameAr: company.name,
    branchName: company.branchName,
    phone: company.phone,
    address: company.address,
  });

  if (config.includeCompanyName !== false) {
    parts.push(`*${identity.plainCompanyName}*`);
    if (identity.branchName) {
      parts.push(`*${identity.branchName}*`);
    }
  }

  if (config.includeSlogan !== false) {
    parts.push(...identity.taglineLines);
  }

  if (config.includeContact !== false) {
    parts.push(`العنوان: ${identity.address}`);
    parts.push(
      identity.phone.includes('هاتف') || identity.phone.includes('جوال')
        ? identity.phone
        : `هاتف: ${identity.phone}`
    );
  }

  if (config.includeTaxNumber && company.taxNumber && company.taxNumber.trim()) {
    parts.push(`الرقم الضريبي: ${company.taxNumber.trim()}`);
  }

  if (config.dividerStyle !== 'none' && parts.length > 0) {
    parts.push('━━━━━━━━━━━━━━━━━━━━━━');
  }

  return parts.length > 0 ? parts.join('\n') + '\n\n' : buildOfficialTextHeader(company);
}

export { buildOfficialTextHeader };
