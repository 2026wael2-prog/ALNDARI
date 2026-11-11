import { useEffect, useState } from 'react';
import { useCompany } from '../../../../settings/hooks';
import { useInvoiceSettings } from '../../../../settings/settingsStore';
import type { CompanyHeaderData, HeaderLayoutMode } from '../PrintDocumentHeader';
import {
  EMPTY_COMPANY_HEADER,
  mergeCompanyHeader,
  resolveCompanyHeader,
  type InvoiceCompanyHeader,
  type InvoiceCompanyInfo,
} from './companyHeader';

export interface InvoicePrintState {
  layoutMode: HeaderLayoutMode;
  accentColor: string;
  showQrCode: boolean;
  companyHeader: InvoiceCompanyHeader;
  setLayoutMode: (mode: HeaderLayoutMode) => void;
  setAccentColor: (color: string) => void;
  toggleQrCode: () => void;
  updateCompany: (updated: Partial<CompanyHeaderData>) => void;
}

/**
 * حالة أدوات الطباعة + رأس المنشأة. تُفصل عن القالب كي يبقى المكوّن الرئيسي
 * تركيباً صرفياً، وكي تُستدعى كل الـhooks قبل أي `return` مبكر.
 */
export const useInvoicePrintState = (
  invoiceCompany: InvoiceCompanyInfo | null | undefined
): InvoicePrintState => {
  const { data: settingsCompany } = useCompany();
  const invoiceSettings = useInvoiceSettings();
  const [layoutMode, setLayoutMode] = useState<HeaderLayoutMode>('modern-centered');
  const [accentColor, setAccentColor] = useState<string>('#1F4E78');
  const [showQrCode, setShowQrCode] = useState<boolean>(true);
  const [companyHeader, setCompanyHeader] = useState<InvoiceCompanyHeader>(EMPTY_COMPANY_HEADER);

  useEffect(() => {
    setCompanyHeader(previous =>
      resolveCompanyHeader({ previous, settingsCompany, invoiceCompany, invoiceSettings })
    );
  }, [settingsCompany, invoiceCompany, invoiceSettings]);

  return {
    layoutMode,
    accentColor,
    showQrCode,
    companyHeader,
    setLayoutMode,
    setAccentColor,
    toggleQrCode: () => {
      setShowQrCode(previous => !previous);
    },
    updateCompany: (updated: Partial<CompanyHeaderData>) => {
      setCompanyHeader(previous => mergeCompanyHeader(previous, updated));
    },
  };
};
