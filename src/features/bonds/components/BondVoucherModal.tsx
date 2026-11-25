import React, { useEffect, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import type { Bond } from '../types';
import { cn } from '../../../core/utils';
import { useCompany } from '../../settings/hooks';
import { useInvoiceSettings, useDocumentHeaderSettings } from '../../settings/settingsStore';
import { PdfCaptureHost } from '@/core/components/PdfCaptureHost';
import { buildWhatsappHeader } from '@/core/utils/whatsappHeader';
import { logger } from '../../../core/utils/logger';
import WhatsAppShareChoiceModal from '@/ui/common/WhatsAppShareChoiceModal';
import { useAuthStore } from '../../auth/store';
import { partiesService } from '../../parties/service';
import {
  resolveVoucherBalanceFromStatement,
  type VoucherBalanceSnapshot,
} from '../utils/bondPartyBalance';
import {
  buildBondWhatsAppText,
  deriveBondVoucherMeta,
  type BondVoucherCompanyInfo,
} from './voucher/bondVoucherHelpers';
import { BondVoucherToolbar } from './voucher/BondVoucherToolbar';
import { BondVoucherSheet } from './voucher/BondVoucherSheet';

interface BondVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  bond: Bond | null;
}

export const BondVoucherModal: React.FC<BondVoucherModalProps> = ({ isOpen, onClose, bond }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [voucherBalance, setVoucherBalance] = useState<VoucherBalanceSnapshot | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const pdfCaptureRef = useRef<HTMLDivElement>(null);
  const { data: settingsCompany } = useCompany();
  const invoiceSettings = useInvoiceSettings();
  const headerConfig = useDocumentHeaderSettings();
  const companyId = useAuthStore(s => s.user?.company_id);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !bond || !bond.party_id || !companyId || bond.type === 'transfer') {
      setVoucherBalance(null);
      return;
    }

    const loadBalance = async () => {
      try {
        const movements = await partiesService.getStatement(
          bond.party_id as string,
          'all',
          { currencyCode: bond.currency_code || 'SAR' },
          companyId
        );
        if (cancelled) return;
        setVoucherBalance(
          resolveVoucherBalanceFromStatement({
            movements,
            bondId: bond.id,
            paymentNumber: bond.payment_number,
            bondCurrency: bond.currency_code || 'SAR',
            bondType: bond.type,
            bondAmount: bond.amount,
            bondStatus: bond.status,
          })
        );
      } catch (err) {
        logger.warn('BondVoucherModal', 'Failed to load party balance for voucher', err);
        if (!cancelled) setVoucherBalance(null);
      }
    };

    void loadBalance();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    bond?.id,
    bond?.party_id,
    bond?.payment_number,
    bond?.currency_code,
    bond?.type,
    bond?.amount,
    bond?.status,
    companyId,
  ]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `سند_${bond?.payment_number || 'مالي'}`,
  });

  if (!isOpen || !bond) return null;

  const company: BondVoucherCompanyInfo = {
    name_ar: invoiceSettings?.company_name_ar || settingsCompany?.name_ar || 'اسم المنشأة التجارية',
    address: invoiceSettings?.company_address || settingsCompany?.address || '',
    phone: invoiceSettings?.company_phone || settingsCompany?.phone || '',
    tax_number: settingsCompany?.tax_number || '---',
    logo_url: settingsCompany?.logo_url || '',
  };

  const meta = deriveBondVoucherMeta(bond);

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    await new Promise(resolve => setTimeout(resolve, 60));
    try {
      const target = pdfCaptureRef.current || printRef.current;
      if (target) {
        const { exportToPDF } = await import('../../../core/utils/pdfExporter');
        await exportToPDF(
          target,
          `${meta.voucherTitle.replace(/\s+/g, '_')}_${bond.payment_number || 'مالي'}`
        );
      }
    } catch (err) {
      logger.error('BondVoucherModal', 'PDF export failed', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      const { exportSingleBondToExcel } = await import('../../../core/utils/bondExcelExporter');
      await exportSingleBondToExcel(company, bond);
    } catch (err) {
      logger.error('BondVoucherModal', 'Excel export failed', err);
    }
  };

  const generateBondPdfBlob = async (): Promise<Blob> => {
    setIsExportingPdf(true);
    await new Promise(resolve => setTimeout(resolve, 80));
    try {
      const target = pdfCaptureRef.current || printRef.current;
      if (!target) throw new Error('Bond print target not ready');
      const { generatePDFBlob } = await import('../../../core/utils/pdfExporter');
      return await generatePDFBlob(target);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const waHeader = headerConfig?.whatsapp
    ? buildWhatsappHeader(headerConfig.whatsapp, {
        name: headerConfig.details.companyNameOverride || company.name_ar,
        phone: company.phone || undefined,
        taxNumber: company.tax_number || undefined,
        slogan: headerConfig.details.sloganText || undefined,
      })
    : '';

  const bondWhatsAppText = buildBondWhatsAppText({ bond, meta, waHeader, voucherBalance });

  return (
    <>
      <div
        className={cn(
          'font-cairo fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm transition-all duration-300 sm:items-center sm:p-4',
          isFullscreen && 'p-0'
        )}
        onClick={onClose}
      >
        <div
          className={cn(
            'flex flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl',
            isFullscreen ? 'h-[100dvh] w-full rounded-none' : 'max-h-[92dvh] w-full max-w-4xl'
          )}
          onClick={e => {
            e.stopPropagation();
          }}
        >
          <BondVoucherToolbar
            paymentNumber={bond.payment_number}
            meta={meta}
            isExportingPdf={isExportingPdf}
            isFullscreen={isFullscreen}
            onPrint={() => {
              handlePrint();
            }}
            onExportPdf={() => {
              void handleExportPdf();
            }}
            onWhatsApp={() => {
              setIsWhatsAppModalOpen(true);
            }}
            onExportExcel={() => {
              void handleExportExcel();
            }}
            onToggleFullscreen={() => {
              setIsFullscreen(prev => !prev);
            }}
            onClose={onClose}
          />

          <div className="flex-1 overflow-y-auto bg-slate-100/70 p-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:bg-slate-950 sm:p-6">
            <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-slate-300 bg-white p-1 shadow-lg sm:p-2">
              <BondVoucherSheet
                bond={bond}
                company={company}
                meta={meta}
                voucherBalance={voucherBalance}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Off-screen dedicated print target (never clipped by modal overflow) */}
      <div
        className="pointer-events-none fixed -left-[10000px] top-0 w-[210mm] opacity-0"
        aria-hidden="true"
      >
        <div ref={printRef} id="bond-printable-voucher-isolated">
          <BondVoucherSheet
            bond={bond}
            company={company}
            meta={meta}
            voucherBalance={voucherBalance}
          />
        </div>
      </div>

      {/* Dedicated host for high-resolution PDF capture */}
      <PdfCaptureHost innerRef={pdfCaptureRef}>
        <div style={{ width: '210mm', backgroundColor: '#ffffff' }}>
          <BondVoucherSheet
            bond={bond}
            company={company}
            meta={meta}
            voucherBalance={voucherBalance}
          />
        </div>
      </PdfCaptureHost>

      <WhatsAppShareChoiceModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => {
          setIsWhatsAppModalOpen(false);
        }}
        title={`${meta.voucherTitle} #${bond.payment_number}`}
        textMessage={bondWhatsAppText}
        pdfFileName={`${meta.voucherTitle.replace(/\s+/g, '_')}_${bond.payment_number}`}
        pdfCaption={`مرفق ${meta.voucherTitle} رقم ${bond.payment_number} بصيغة PDF`}
        onGeneratePdfBlob={generateBondPdfBlob}
      />
    </>
  );
};

export default BondVoucherModal;
