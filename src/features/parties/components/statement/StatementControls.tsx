import type React from 'react';
import { useState } from 'react';
import type { Party, PartyType } from '../../types';
import { type StatementMovement, partiesService } from '../../service';
import type { StatementPartyScope } from '../../hooks/useStatementController';
import Button from '../../../../ui/base/Button';
import {
  Share2,
  FileDown,
  Printer,
  Maximize2,
  Minimize2,
  Users,
  Truck,
  Layers,
  Calendar,
  X,
} from 'lucide-react';
import { cn } from '../../../../core/utils';
import { getDateRangeForPreset } from '../../../../core/utils/dateUtils';
import { logger } from '../../../../core/utils/logger';
import { useAuthStore } from '../../../auth/store';
import { useCompany } from '../../../settings/hooks';
import { SmartPartySelect } from '../SmartPartySelect';
import { StatementWhatsAppModal } from './StatementWhatsAppModal';

interface StatementControlsProps {
  partyType: PartyType;
  partyScope?: StatementPartyScope;
  onPartyScopeChange?: (scope: StatementPartyScope) => void;
  effectivePartyType?: 'customer' | 'supplier';
  parties?: Party[];
  selectedPartyId: string;
  onSelectPartyId: (id: string) => void;
  startDate: string;
  onStartDateChange: (val: string) => void;
  endDate: string;
  onEndDateChange: (val: string) => void;
  /** Chronological (oldest -> newest) movements for accurate running-balance calculation in Excel/PDF/WhatsApp. */
  statement?: StatementMovement[];
  companyNameAr: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const SCOPE_OPTIONS: ReadonlyArray<{
  id: StatementPartyScope;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  activeClass: string;
}> = [
  {
    id: 'all',
    label: 'الكل (عملاء وموردون)',
    icon: Layers,
    activeClass: 'bg-slate-900 text-white shadow-sm dark:bg-blue-600',
  },
  {
    id: 'customer',
    label: 'العملاء',
    icon: Users,
    activeClass: 'bg-emerald-600 text-white shadow-sm',
  },
  {
    id: 'supplier',
    label: 'الموردون',
    icon: Truck,
    activeClass: 'bg-blue-600 text-white shadow-sm',
  },
];

export const StatementControls: React.FC<StatementControlsProps> = ({
  partyType,
  partyScope = partyType === 'supplier' ? 'supplier' : partyType === 'customer' ? 'customer' : 'all',
  onPartyScopeChange,
  effectivePartyType,
  parties,
  selectedPartyId,
  onSelectPartyId,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  statement,
  companyNameAr,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const user = useAuthStore(state => state.user);
  const { data: settingsCompany } = useCompany();

  const selectedParty = parties?.find(p => p.id === selectedPartyId);
  const chronologicalStatement = statement ?? [];
  const exportPartyType: 'customer' | 'supplier' =
    effectivePartyType ??
    (selectedParty?.type === 'supplier' || partyType === 'supplier' ? 'supplier' : 'customer');
  const selectPartyType: PartyType = partyType === 'employee' ? 'employee' : partyScope;

  // تحويل StatementMovement[] → StatementEntry[] (يضمن balance إلزامياً و currency) لتمريره للمصدِّرات.
  const statementEntries = chronologicalStatement.map(r => ({
    date: r.date,
    operation_type: r.operation_type ?? '',
    reference_no: r.ref,
    desc: r.desc,
    debit: r.debit || 0,
    credit: r.credit || 0,
    balance: r.balance ?? 0,
    payment_status: r.payment_status,
    currency: r.currency || 'SAR',
  }));

  const applyQuickRange = (preset: 'this_month' | 'this_year' | 'all'): void => {
    if (preset === 'all') {
      onStartDateChange('');
      onEndDateChange('');
      return;
    }
    const range = getDateRangeForPreset(preset);
    onStartDateChange(range.from ?? '');
    onEndDateChange(range.to ?? '');
  };

  const handleWhatsAppShare = (): void => {
    if (selectedPartyId === '' || !statement || !selectedParty) return;
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
          partyType: exportPartyType,
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
          partyType: exportPartyType,
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
          partyType: exportPartyType,
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

  const hasDateFilter = Boolean(startDate || endDate);

  return (
    <div className="no-print rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5 shadow-sm transition-all md:p-3">
      <div className="flex flex-wrap items-center gap-2 md:gap-2.5">
        {/* 1. Unified Party Scope Switcher (All / Customers / Suppliers) */}
        {partyType !== 'employee' && onPartyScopeChange && (
          <div className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 dark:border-slate-700/80 dark:bg-slate-900/70">
            {SCOPE_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = partyScope === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onPartyScopeChange(opt.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all',
                    active
                      ? opt.activeClass
                      : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  )}
                >
                  <Icon size={13} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 2. Unified Smart Search Box for Customers & Suppliers */}
        <div className="min-w-[240px] flex-1 max-md:w-full">
          <SmartPartySelect
            partyType={selectPartyType}
            selectedPartyId={selectedPartyId}
            onSelectPartyId={onSelectPartyId}
            placeholder={
              selectPartyType === 'all'
                ? 'ابحث عن عميل أو مورد بالاسم أو رقم الهاتف...'
                : selectPartyType === 'supplier'
                  ? 'ابحث عن مورد بالاسم أو رقم الهاتف...'
                  : 'ابحث عن عميل بالاسم أو رقم الهاتف...'
            }
            {...(parties ? { parties } : {})}
          />
        </div>

        {/* 3. Modern Date Range Group + Quick Presets */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-2 py-1 dark:border-slate-700/80 dark:bg-slate-900/60 max-md:w-full">
          <Calendar size={13} className="hidden text-slate-400 sm:block" />
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-400">من</span>
            <input
              type="date"
              aria-label="من تاريخ"
              value={startDate}
              onChange={e => onStartDateChange(e.target.value)}
              className="w-[122px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-400">إلى</span>
            <input
              type="date"
              aria-label="إلى تاريخ"
              value={endDate}
              onChange={e => onEndDateChange(e.target.value)}
              className="w-[122px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
          <div className="hidden items-center gap-1 border-r border-slate-200 pr-1.5 dark:border-slate-700 xl:flex">
            <button
              type="button"
              onClick={() => applyQuickRange('this_month')}
              className="rounded-md px-2 py-1 text-[10px] font-bold text-slate-500 transition-colors hover:bg-white hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              الشهر
            </button>
            <button
              type="button"
              onClick={() => applyQuickRange('this_year')}
              className="rounded-md px-2 py-1 text-[10px] font-bold text-slate-500 transition-colors hover:bg-white hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              السنة
            </button>
            {hasDateFilter && (
              <button
                type="button"
                onClick={() => applyQuickRange('all')}
                className="inline-flex items-center gap-0.5 rounded-md bg-rose-50 px-1.5 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400"
                title="مسح فلتر التاريخ"
              >
                <X size={11} />
                الكل
              </button>
            )}
          </div>
        </div>

        {/* 4. Action Buttons (WhatsApp, Share, Excel, Print, Fullscreen) */}
        <div className="flex flex-wrap items-center gap-1.5 max-md:w-full max-md:justify-end">
          {selectedPartyId && selectedParty && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleWhatsAppShare}
                className="gap-1.5 rounded-xl border-emerald-200 bg-emerald-50/50 px-2.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100/80 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300 sm:text-xs"
                title="إرسال كشف الحساب عبر واتساب (مع الهيدر الرسمي)"
              >
                <Share2 size={13} />
                واتساب
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleShareExcel}
                className="gap-1.5 rounded-xl border-blue-200 bg-blue-50/40 px-2.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100/70 dark:border-blue-800/60 dark:bg-blue-950/30 dark:text-blue-300 sm:text-xs"
                disabled={isExporting}
              >
                <FileDown size={13} />
                مشاركة
              </Button>
              <Button
                size="sm"
                onClick={handleExportExcel}
                isLoading={isExporting}
                className="rounded-xl bg-emerald-600 px-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700 sm:text-xs"
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
                className="rounded-xl px-2.5 text-[11px] font-bold shadow-sm sm:text-xs"
              >
                طباعة
              </Button>
            </>
          )}

          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className={cn(
                'inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition-all sm:text-xs',
                isFullscreen
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              )}
              title={isFullscreen ? 'إنهاء وضع ملء الشاشة (Esc)' : 'تكبير كشف الحساب لملء الشاشة'}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span className="hidden sm:inline">{isFullscreen ? 'تصغير' : 'ملء الشاشة'}</span>
            </button>
          )}
        </div>
      </div>

      {selectedParty && isWhatsAppModalOpen && (
        <StatementWhatsAppModal
          isOpen={isWhatsAppModalOpen}
          onClose={() => setIsWhatsAppModalOpen(false)}
          party={selectedParty}
          partyType={exportPartyType}
          movements={chronologicalStatement}
          startDate={startDate}
          endDate={endDate}
          company={{
            name_ar: companyNameAr,
            address: settingsCompany?.address || '',
            phone: settingsCompany?.phone || '',
            tax_number: settingsCompany?.tax_number || '',
            bank_name:
              (settingsCompany as { bank_name?: string } | null | undefined)?.bank_name || '',
            bank_account_iban:
              (settingsCompany as { bank_account_iban?: string } | null | undefined)
                ?.bank_account_iban || '',
          }}
          companyNameAr={companyNameAr}
        />
      )}
    </div>
  );
};
