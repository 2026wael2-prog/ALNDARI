import type { XlsxCell, XlsxSheet } from '../../../../core/utils/excelExporterBase';

export interface CompanyInfo {
  name_ar: string;
  address?: string;
  phone?: string;
  tax_number?: string;
  commercial_reg?: string;
  logo_url?: string;
  bank_name?: string;
  bank_account_iban?: string;
}

export interface StatementEntry {
  date: string;
  operation_type?: string | undefined;
  reference_no?: string | undefined;
  desc: string;
  debit: number;
  credit: number;
  balance: number;
  payment_status?: string | undefined;
  currency?: string | undefined;
}

export interface StatementExportOptions {
  currencyCode?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  partyPhone?: string | undefined;
  partyCategory?: string | undefined;
  partyType?: 'customer' | 'supplier' | undefined;
}

export interface CurrencyBreakdownItem {
  currency: string;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  count: number;
}

export interface CurrencyTheme {
  primaryBg: string;
  subtitleBg: string;
  balanceBg: string;
  balanceText: string;
  labelAr: string;
}

export const getCell = (sheet: XlsxSheet, ref: string): XlsxCell | undefined => {
  return Object.getOwnPropertyDescriptor(sheet, ref)?.value as XlsxCell | undefined;
};

export const getCurrencyTheme = (currency: string): CurrencyTheme => {
  const norm = currency.trim().toUpperCase();
  if (norm === 'SAR') {
    return {
      primaryBg: '1E3A8A',
      subtitleBg: '2563EB',
      balanceBg: 'EFF6FF',
      balanceText: '1E3A8A',
      labelAr: 'الريال السعودي (SAR)',
    };
  }
  if (norm === 'YER') {
    return {
      primaryBg: '065F46',
      subtitleBg: '059669',
      balanceBg: 'ECFDF5',
      balanceText: '065F46',
      labelAr: 'الريال اليمني (YER)',
    };
  }
  return {
    primaryBg: '334155',
    subtitleBg: '475569',
    balanceBg: 'F8FAFC',
    balanceText: '0F172A',
    labelAr: `${currency}`,
  };
};

export const crispCellBorder = {
  top: { style: 'thin', color: { rgb: '94A3B8' } },
  bottom: { style: 'thin', color: { rgb: '94A3B8' } },
  left: { style: 'thin', color: { rgb: '94A3B8' } },
  right: { style: 'thin', color: { rgb: '94A3B8' } },
};

export const headerBorder = {
  top: { style: 'medium', color: { rgb: '0F172A' } },
  bottom: { style: 'medium', color: { rgb: '0F172A' } },
  left: { style: 'thin', color: { rgb: '94A3B8' } },
  right: { style: 'thin', color: { rgb: '94A3B8' } },
};

export const totalRowBorder = {
  top: { style: 'medium', color: { rgb: '0F172A' } },
  bottom: { style: 'double', color: { rgb: '0F172A' } },
  left: { style: 'thin', color: { rgb: '94A3B8' } },
  right: { style: 'thin', color: { rgb: '94A3B8' } },
};

export const translatePaymentStatusAr = (status?: string): string => {
  if (status === 'paid') return 'خالص / مسدد';
  if (status === 'partially_paid' || status === 'partial') return 'مسدد جزئياً';
  if (status === 'unpaid') return 'غير مسدد';
  if (status === 'void') return 'ملغي';
  return 'مسوى';
};

export const buildCompanyInfoLine = (company: CompanyInfo): string =>
  `${company.address ? `العنوان: ${company.address}  |  ` : ''}${company.phone ? `هاتف: ${company.phone}  |  ` : ''}${company.tax_number ? `الرقم الضريبي: ${company.tax_number}` : ''}`;
