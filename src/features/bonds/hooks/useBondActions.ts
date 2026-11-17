import { useCallback, useMemo } from 'react';
import type { Bond } from '../types';
import { toBaseCurrency } from '../../../core/utils';
import { useDeleteBond } from '../hooks';
import { useCompany } from '../../settings/hooks';
import { useInvoiceSettings } from '../../settings/settingsStore';
import { logger } from '../../../core/utils/logger';

export interface BondsPageTotals {
  receipts: number;
  payments: number;
  transfers: number;
  net: number;
  count: number;
}

/**
 * Filters bonds, computes aggregate SAR totals, and handles delete / Excel export /
 * WhatsApp share actions cleanly outside presentation views.
 */
export const useBondActions = (bonds: Bond[], searchTerm: string) => {
  const { mutate: deleteBond } = useDeleteBond();
  const { data: settingsCompany } = useCompany();
  const invoiceSettings = useInvoiceSettings();

  const filteredBonds = useMemo(() => {
    if (!bonds) return [];
    if (!searchTerm.trim()) return bonds;
    const term = searchTerm.toLowerCase();
    return bonds.filter(
      b =>
        b.description.toLowerCase().includes(term) ||
        b.account_name.toLowerCase().includes(term) ||
        (b.party_name || '').toLowerCase().includes(term) ||
        (b.payment_number || '').toLowerCase().includes(term)
    );
  }, [bonds, searchTerm]);

  const pageTotals: BondsPageTotals = useMemo(() => {
    let receipts = 0;
    let payments = 0;
    let transfers = 0;
    filteredBonds.forEach(b => {
      let amt = b.base_amount;
      if (amt === undefined || amt === null) {
        try {
          amt = toBaseCurrency({
            amount: b.amount || 0,
            currency_code: b.currency_code || 'SAR',
            exchange_rate: b.exchange_rate ?? 1,
          });
        } catch {
          amt = b.amount || 0;
        }
      }
      if (b.type === 'receipt') {
        receipts += amt;
      } else if (b.type === 'payment') {
        payments += amt;
      } else if (b.type === 'transfer') {
        transfers += amt;
      }
    });
    return {
      receipts,
      payments,
      transfers,
      net: receipts - payments,
      count: filteredBonds.length,
    };
  }, [filteredBonds]);

  const companyMeta = useMemo(
    () => ({
      name_ar: invoiceSettings?.company_name_ar || settingsCompany?.name_ar || 'اسم الشركة',
      address: invoiceSettings?.company_address || settingsCompany?.address || '',
      phone: invoiceSettings?.company_phone || settingsCompany?.phone || '',
      tax_number: settingsCompany?.tax_number || '---',
    }),
    [invoiceSettings, settingsCompany]
  );

  const handleDelete = useCallback(
    (id: string, number: string) => {
      if (window.confirm(`هل أنت متأكد من حذف السند رقم (${number})؟`)) {
        deleteBond(id);
      }
    },
    [deleteBond]
  );

  const handleWhatsAppShare = useCallback(
    async (bond: Bond) => {
      try {
        const { generateSingleBondExcelBlob, exportSingleBondToExcel: exportSingle } =
          await import('../../../core/utils/bondExcelExporter');

        const blob = await generateSingleBondExcelBlob(companyMeta, bond);
        const bondTitle =
          bond.type === 'receipt' ? 'سند_قبض' : bond.type === 'payment' ? 'سند_صرف' : 'سند_تحويل';
        const file = new File([blob], `${bondTitle}_${bond.payment_number}.xlsx`, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${bondTitle.replace('_', ' ')} ${bond.payment_number}`,
            text: `مرفق ${bondTitle.replace('_', ' ')} رقم ${bond.payment_number}`,
          });
        } else {
          await exportSingle(companyMeta, bond);
          const text = encodeURIComponent(
            `مرفق ${bondTitle.replace('_', ' ')} رقم ${bond.payment_number}.`
          );
          window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
        }
      } catch (err) {
        logger.error('BondsList', 'WhatsApp share failed', err);
      }
    },
    [companyMeta]
  );

  const handleExport = useCallback(
    async (bond: Bond) => {
      const { exportSingleBondToExcel } = await import('../../../core/utils/bondExcelExporter');
      await exportSingleBondToExcel(companyMeta, bond);
    },
    [companyMeta]
  );

  return {
    filteredBonds,
    pageTotals,
    handleDelete,
    handleWhatsAppShare,
    handleExport,
  };
};
