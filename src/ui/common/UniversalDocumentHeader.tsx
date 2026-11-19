/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React from 'react';
import type { DocumentHeaderConfig } from '@/core/types/documentHeader';
import { DEFAULT_DOCUMENT_HEADER_CONFIG } from '@/core/types/documentHeader';
import { AlNadaryPrintHeader } from '@/ui/print/AlNadaryPrintHeader';
import { ALNADARY_PRINT_CSS } from '@/ui/print/alNadaryPrintStyles';

export interface UniversalDocumentHeaderProps {
  config?: DocumentHeaderConfig;
  company?: {
    name?: string | undefined;
    branchName?: string | undefined;
    logo_url?: string | undefined;
    phone?: string | undefined;
    email?: string | undefined;
    address?: string | undefined;
    tax_number?: string | undefined;
    commercial_register?: string | undefined;
    slogan?: string | undefined;
    name_en?: string | undefined;
  };
  documentTitle?: string | undefined;
  documentNumber?: string | undefined;
  documentDate?: string | undefined;
  statusBadge?: string | undefined;
  className?: string | undefined;
}

/**
 * الترويسة الشاملة لجميع مستندات وتقارير النظام (عروض الأسعار، الطلبات، المصاريف، التسوية، PDF).
 * تعتمد الهيدر الرسمي الموحد لشركة النظاري مع التخصيص التلقائي لكل فرع.
 */
export const UniversalDocumentHeader: React.FC<UniversalDocumentHeaderProps> = ({
  config = DEFAULT_DOCUMENT_HEADER_CONFIG,
  company = {},
  documentTitle = 'مستند رسمي',
  documentNumber,
  documentDate,
  statusBadge,
  className = '',
}) => {
  const { logo, banner, details } = config;
  const resolvedLogoUrl = logo.logoUrl?.trim() || company.logo_url?.trim() || undefined;

  if (banner.enabled && banner.bannerUrl) {
    return (
      <header className={`w-full overflow-hidden print:w-full ${className}`}>
        <img
          src={banner.bannerUrl}
          alt={details.companyNameOverride || company.name || 'شركة النظاري'}
          style={{
            height: `${banner.height}px`,
            objectFit: banner.objectFit,
            width: '100%',
          }}
          className="block w-full"
        />
      </header>
    );
  }

  return (
    <div className={`alnadary-print-sheet ${className}`} style={{ padding: 0 }} dir="rtl">
      <style>{ALNADARY_PRINT_CSS}</style>
      <AlNadaryPrintHeader
        documentTitle={documentTitle}
        documentDate={documentDate}
        documentNumber={documentNumber}
        documentNumberLabel="رقم المستند"
        company={{
          nameAr: details.companyNameOverride || company.name,
          branchName: company.branchName,
          logoUrl: resolvedLogoUrl,
          address: company.address,
          phone: company.phone,
        }}
        leftMeta={statusBadge ? [{ label: 'الحالة', value: statusBadge }] : []}
      />
    </div>
  );
};

export default UniversalDocumentHeader;
