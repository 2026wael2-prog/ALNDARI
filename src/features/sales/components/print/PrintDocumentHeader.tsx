/* eslint-disable @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import React from 'react';
import { useDocumentHeaderSettings } from '@/features/settings/settingsStore';
import { UniversalDocumentHeader } from '@/ui/common/UniversalDocumentHeader';
import { DEFAULT_DOCUMENT_HEADER_CONFIG } from '@/core/types/documentHeader';

export type HeaderLayoutMode = 'modern-centered' | 'classic-split' | 'full-banner';

export interface CompanyHeaderData {
  nameAr: string;
  nameEn?: string;
  specialization?: string;
  address?: string;
  phone?: string;
  taxNumber?: string;
  crNumber?: string; // Commercial Registration
  email?: string;
  logoUrl?: string;
  bannerUrl?: string;
}

export interface DocumentHeaderMeta {
  titleAr: string;
  titleEn?: string;
  documentNumber?: string;
  documentDate?: string;
  badge?: string;
}

interface PrintDocumentHeaderProps {
  company: CompanyHeaderData;
  document: DocumentHeaderMeta;
  layoutMode?: HeaderLayoutMode;
  onUpdateCompany?: (updated: Partial<CompanyHeaderData>) => void;
  accentColor?: string;
  allowEdit?: boolean;
}

export const PrintDocumentHeader: React.FC<PrintDocumentHeaderProps> = ({
  company,
  document,
  layoutMode = 'classic-split',
  accentColor = '#1F4E78',
}) => {
  const globalHeaderConfig = useDocumentHeaderSettings();
  const baseConfig = globalHeaderConfig || DEFAULT_DOCUMENT_HEADER_CONFIG;

  const mergedConfig = {
    ...baseConfig,
    style: {
      ...baseConfig.style,
      layout: (layoutMode as any) || baseConfig.style.layout,
      accentColor: accentColor || baseConfig.style.accentColor,
    },
    logo: {
      ...baseConfig.logo,
      logoUrl: company.logoUrl ?? baseConfig.logo.logoUrl ?? '',
    },
    banner: {
      ...baseConfig.banner,
      bannerUrl: company.bannerUrl ?? baseConfig.banner.bannerUrl ?? '',
    },
  };

  return (
    <div className="mb-4 w-full">
      <UniversalDocumentHeader
        config={mergedConfig}
        company={{
          name: company.nameAr,
          name_en: company.nameEn,
          phone: company.phone,
          email: company.email,
          address: company.address,
          tax_number: company.taxNumber,
          commercial_register: company.crNumber,
          slogan: company.specialization,
          logo_url: company.logoUrl,
        }}
        documentTitle={document.titleAr}
        documentNumber={document.documentNumber}
        documentDate={document.documentDate}
        statusBadge={document.badge}
      />
    </div>
  );
};

export default PrintDocumentHeader;
