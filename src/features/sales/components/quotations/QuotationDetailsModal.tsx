import { useEffect, useRef } from 'react';
import type { FC } from 'react';
import { FileText } from 'lucide-react';
import Modal from '@/ui/base/Modal';
import { useAuthStore } from '@/features/auth/store';
import { useFeedbackStore } from '@/features/feedback/store';
import { useCompany } from '@/features/settings/hooks';
import { useDocumentHeaderSettings, useInvoiceSettings } from '@/features/settings/settingsStore';
import type { QuotationRowAction } from './QuotationActionIcons';
import type { QuotationDetailRow } from '../../api/quotationsApi';
import { useQuotationDetails } from './hooks/useQuotationDetails';
import { useQuotationShare, type ShareOptions, type ShareResult } from './hooks/useQuotationShare';
import { useQuotationAction } from './hooks/useQuotationAction';
import { useQuotationPdf } from './hooks/useQuotationPdf';
import { QuotationBody } from './sections/QuotationBody';
import { QuotationFooterBar } from './sections/QuotationFooterBar';

interface QuotationDetailsModalProps {
  quotationId: string;
  onClose: () => void;
  onRefresh: () => void;
  onConvertToInvoice?: (() => void) | undefined;
  /** إجراء يبدأ تلقائياً بعد تحميل العرض (من أيقونات قائمة العروض). */
  initialAction?: QuotationRowAction | undefined;
}

type CompanyLike = ReturnType<typeof useCompany>['data'];

interface ExcelContextInput {
  company: CompanyLike;
  specialization: string;
  issuedBy: string;
}

const excelContextFor = (input: ExcelContextInput) => ({
  companyName: input.company?.name_ar ?? 'الشركة',
  companyNameEn: input.company?.name_en ?? '',
  companyAddress: input.company?.address ?? '',
  companyPhone: input.company?.phone ?? '',
  taxNumber: input.company?.tax_number ?? '',
  companySpecialization: input.specialization,
  issuedBy: input.issuedBy,
  accentColor: '1F4E78',
});

interface ShareOptionInput {
  quotation: QuotationDetailRow | null;
  company: CompanyLike;
  specialization: string;
  issuedBy: string;
  headerConfig: ReturnType<typeof useDocumentHeaderSettings>;
  notify: (message: string, type: 'success' | 'error') => void;
}

const buildShareOptions = (input: ShareOptionInput): ShareOptions => ({
  quotation: input.quotation,
  companyName: input.company?.name_ar ?? 'الشركة',
  companyPhone: input.company?.phone ?? '',
  companyTaxNumber: input.company?.tax_number ?? '',
  slogan: input.headerConfig.details.sloganText ?? '',
  whatsapp: input.headerConfig.whatsapp,
  issuedBy: input.issuedBy,
  excelContext: excelContextFor({
    company: input.company,
    specialization: input.specialization,
    issuedBy: input.issuedBy,
  }),
  notify: input.notify,
});

const useQuotationShareFor = (quotation: QuotationDetailRow | null): ShareResult => {
  const { data: company } = useCompany();
  const { user } = useAuthStore();
  const headerConfig = useDocumentHeaderSettings();
  const invoiceSettings = useInvoiceSettings();
  const { showToast } = useFeedbackStore();

  return useQuotationShare(
    buildShareOptions({
      quotation,
      company,
      specialization: invoiceSettings.company_specialization,
      issuedBy: user?.full_name ?? user?.email ?? 'النظام',
      headerConfig,
      notify: showToast,
    })
  );
};

const useInitialAction = (
  quotation: QuotationDetailRow | null,
  share: ShareResult,
  initialAction?: QuotationRowAction
): void => {
  const handled = useRef<boolean>(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (handled.current || initialAction === undefined || quotation === null) return;
    handled.current = true;
    if (initialAction === 'print') {
      timer.current = setTimeout(() => {
        window.print();
      }, 350);
      return;
    }
    if (initialAction === 'excel') {
      share.exportExcel();
      return;
    }
    share.shareWhatsApp();
  }, [initialAction, quotation, share]);

  useEffect(
    () => (): void => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );
};

export const QuotationDetailsModal: FC<QuotationDetailsModalProps> = ({
  quotationId,
  onClose,
  onRefresh,
  onConvertToInvoice,
  initialAction,
}) => {
  const { quotation, loading, error, reload } = useQuotationDetails(quotationId);
  const share = useQuotationShareFor(quotation);
  const pdf = useQuotationPdf(quotation);
  const { busy, run } = useQuotationAction({
    quotation,
    onClose,
    onRefresh,
    ...(onConvertToInvoice !== undefined ? { onConvertToInvoice } : {}),
    reload,
  });
  useInitialAction(quotation, share, initialAction);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      icon={FileText}
      title={quotation?.quotation_number ?? 'عرض سعر'}
      description="تفاصيل عرض السعر"
      size="xl"
      footer={
        <QuotationFooterBar
          quotation={quotation}
          busy={busy}
          share={share}
          onClose={onClose}
          run={run}
        />
      }
    >
      <QuotationBody
        loading={loading}
        quotation={quotation}
        errorText={error}
        onRetry={reload}
        exportPdf={pdf.exportPdf}
        isExporting={pdf.isExporting}
        printRef={pdf.printRef}
      />
    </Modal>
  );
};

export default QuotationDetailsModal;
