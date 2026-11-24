import React, { useState } from 'react';
import type { Party, PartyType } from '../../types';
import { type StatementMovement, partiesService } from '../../service';
import Button from '../../../../ui/base/Button';
import { Share2, FileDown, Printer } from 'lucide-react';
import { logger } from '../../../../core/utils/logger';
import { useAuthStore } from '../../../auth/store';
import { useCompany } from '../../../settings/hooks';
import { SmartPartySelect } from '../SmartPartySelect';
import { StatementWhatsAppModal } from './StatementWhatsAppModal';

interface StatementControlsProps {
  partyType: PartyType;
  parties?: Party[];
  selectedPartyId: string;
  onSelectPartyId: (id: string) => void;
  startDate: string;
  onStartDateChange: (val: string) => void;
  endDate: string;
  onEndDateChange: (val: string) => void;
  statement?: StatementMovement[];
  companyNameAr: string;
}

export const StatementControls: React.FC<StatementControlsProps> = ({
  partyType,
  parties,
  selectedPartyId,
  onSelectPartyId,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  statement,
  companyNameAr,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const user = useAuthStore(state => state.user);
  const { data: settingsCompany } = useCompany();

  const selectedParty = parties?.find(p => p.id === selectedPartyId);
  const filteredStatement = statement || [];

  // تحويل StatementMovement[] → StatementEntry[] (يضمن balance إلزامياً و currency) لتمريره للمصدِّرات.
  const statementEntries = filteredStatement.map(r => ({
    date: r.date,
    operation_type: r.operation_type ?? '',
    reference_no: r.ref,
    desc: r.desc,
    debit: Number(r.debit) || 0,
    credit: Number(r.credit) || 0,
    balance: Number(r.balance) || 0,
    payment_status: r.payment_status,
    currency: r.currency || 'SAR',
  }));

  const handleWhatsAppShare = () => {
    if (!selectedPartyId || !statement || !selectedParty) return;
    setIsWhatsAppModalOpen(true);
  };

  const handleShareExcel = async () => {
    if (!selectedPartyId || !statement || !user?.company_id || !selectedParty) return;
    setIsExporting(true);
    try {
      const companyDetails = await partiesService.getCompanyDetails(user.company_id);
      const companyObj = {
        ...companyDetails,
        address: companyDetails.address || '',
        phone: companyDetails.phone || '',
        tax_number: companyDetails.tax_number || '',
        logo_url: companyDetails.logo_url || '',
      };

      const { generateStatementExcelBlob } = await import('../../utils/statementExcelExporter');
      const blob = await generateStatementExcelBlob(
        companyObj,
        selectedParty.name,
        statementEntries,
        {
          partyType: partyType === 'supplier' ? 'supplier' : 'customer',
          ...(selectedParty.phone ? { partyPhone: selectedParty.phone } : {}),
          dateFrom: startDate,
          dateTo: endDate,
        }
      );

      const file = new File([blob], `كشف_حساب_${selectedParty.name.replace(/\s+/g, '_')}.xlsx`, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `كشف حساب ${selectedParty.name}`,
          text: `مرفق كشف حساب ${selectedParty.name}`,
        });
      } else {
        const { exportStatementToExcel } = await import('../../utils/statementExcelExporter');
        await exportStatementToExcel(companyObj, selectedParty.name, statementEntries, {
          partyType: partyType === 'supplier' ? 'supplier' : 'customer',
          ...(selectedParty.phone ? { partyPhone: selectedParty.phone } : {}),
          dateFrom: startDate,
          dateTo: endDate,
        });
      }
    } catch (err) {
      logger.error('StatementView', 'Share failed', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!selectedPartyId || !statement || !user?.company_id || !selectedParty) return;
    setIsExporting(true);
    try {
      const companyDetails = await partiesService.getCompanyDetails(user.company_id);
      const { exportStatementToExcel } = await import('../../utils/statementExcelExporter');
      await exportStatementToExcel(
        {
          ...companyDetails,
          address: companyDetails.address || '',
          phone: companyDetails.phone || '',
          tax_number: companyDetails.tax_number || '',
          logo_url: companyDetails.logo_url || '',
        },
        selectedParty.name,
        statementEntries,
        {
          ...(selectedParty.phone ? { partyPhone: selectedParty.phone } : {}),
          dateFrom: startDate,
          dateTo: endDate,
        }
      );
    } catch (err) {
      logger.error('StatementView', 'Export failed', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="no-print flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-[var(--app-surface)] p-2 shadow-sm dark:border-slate-800 md:gap-3 md:p-4">
      <div className="min-w-[200px] flex-1 max-md:w-full">
        <label className="mb-0.5 block text-[11px] font-bold text-slate-500 dark:text-slate-400 md:mb-1 md:text-xs">
          اختر {partyType === 'customer' ? 'العميل' : 'المورد'}
          <span className="hidden sm:inline"> (بحث ذكي بالاسم أو الهاتف)</span>
        </label>
        <SmartPartySelect
          partyType={partyType}
          selectedPartyId={selectedPartyId}
          onSelectPartyId={onSelectPartyId}
          {...(parties ? { parties } : {})}
        />
      </div>
      <div className="w-36 max-md:flex-1">
        <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 md:text-xs">من تاريخ</label>
        <input
          type="date"
          value={startDate}
          onChange={e => {
            onStartDateChange(e.target.value);
          }}
          className="mt-0.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 md:mt-1 md:px-3 md:py-1.5 md:text-sm"
        />
      </div>
      <div className="w-36 max-md:flex-1">
        <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 md:text-xs">إلى تاريخ</label>
        <input
          type="date"
          value={endDate}
          onChange={e => {
            onEndDateChange(e.target.value);
          }}
          className="mt-0.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 md:mt-1 md:px-3 md:py-1.5 md:text-sm"
        />
      </div>
      {selectedPartyId && selectedParty && (
        <div className="mt-auto grid w-full grid-cols-4 gap-1 sm:flex sm:w-auto sm:flex-wrap sm:gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleWhatsAppShare}
            className="gap-1 rounded-lg border-emerald-200 px-1.5 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-800/60 dark:hover:bg-emerald-950/30 sm:gap-2 sm:px-3 sm:text-xs"
          >
            <Share2 size={13} />
            واتساب
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleShareExcel}
            className="gap-1 rounded-lg border-blue-200 px-1.5 text-[11px] font-bold text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-800/60 dark:hover:bg-blue-950/30 sm:gap-2 sm:px-3 sm:text-xs"
            disabled={isExporting}
          >
            <FileDown size={13} />
            مشاركة
          </Button>
          <Button
            size="sm"
            onClick={handleExportExcel}
            isLoading={isExporting}
            className="rounded-lg bg-emerald-600 px-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700 sm:px-3 sm:text-xs"
            leftIcon={<FileDown size={13} />}
          >
            Excel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              window.print();
            }}
            leftIcon={<Printer size={13} />}
            className="rounded-lg px-1.5 text-[11px] font-bold shadow-sm sm:px-3 sm:text-xs"
          >
            طباعة
          </Button>
        </div>
      )}

      {selectedParty && isWhatsAppModalOpen && (
        <StatementWhatsAppModal
          isOpen={isWhatsAppModalOpen}
          onClose={() => setIsWhatsAppModalOpen(false)}
          party={selectedParty}
          partyType={partyType}
          movements={filteredStatement}
          startDate={startDate}
          endDate={endDate}
          company={{
            name_ar: companyNameAr,
            address: settingsCompany?.address || '',
            phone: settingsCompany?.phone || '',
            tax_number: settingsCompany?.tax_number || '',
            bank_name: (settingsCompany as { bank_name?: string } | null | undefined)?.bank_name || '',
            bank_account_iban: (settingsCompany as { bank_account_iban?: string } | null | undefined)?.bank_account_iban || '',
          }}
          companyNameAr={companyNameAr}
        />
      )}
    </div>
  );
};
