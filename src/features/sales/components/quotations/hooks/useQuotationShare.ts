import { useCallback, useMemo } from 'react';
import type { QuotationDetailRow } from '@/features/sales/api/quotationsApi';
import type { QuotationExcelContext } from '../print/quotationPrintModel';
import {
  mapQuotationToPrintData,
  toQuotationExcelData,
  toSharePayload,
} from '../print/quotationPrintModel';
import {
  exportQuotationToExcel,
  generateQuotationExcelBlob,
  type QuotationExcelData,
} from '@/core/utils/quotationExcelExporter';
import {
  buildQuotationCaption,
  copyQuotationText,
  openQuotationTelegram,
  openQuotationWhatsApp,
  type QuotationSharePayload,
} from '@/features/sales/utils/quotationShareHelper';
import { buildWhatsappHeader } from '@/core/utils/whatsappHeader';
import type { WhatsappHeaderConfig } from '@/core/types/documentHeader';
import { shareSpreadsheet } from '@/core/utils/shareUtils';
import { logger } from '@/core/utils/logger';
import { parseError } from '@/core/utils/errorUtils';

export interface ShareOptions {
  quotation: QuotationDetailRow | null;
  companyName: string;
  companyPhone: string;
  companyTaxNumber: string;
  slogan: string;
  whatsapp: WhatsappHeaderConfig;
  issuedBy: string;
  excelContext: QuotationExcelContext;
  notify: (message: string, type: 'success' | 'error') => void;
}

export interface ShareResult {
  shareWhatsApp: () => void;
  shareTelegram: () => void;
  copyText: () => void;
  exportExcel: () => void;
}

const supportsNativeFileShare = (): boolean => {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
  try {
    const probe = new File(['probe'], 'probe.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
};

const reportShareError = (
  error: unknown,
  notify: (message: string, type: 'success' | 'error') => void
): void => {
  logger.error('QuotationDetailsModal', 'WhatsApp share failed', error);
  notify(parseError(error).message, 'error');
};

const sendExcelToWhatsApp = async (data: QuotationExcelData, caption: string): Promise<void> => {
  const blob = await generateQuotationExcelBlob(data);
  await shareSpreadsheet({
    blob,
    fileName: `عرض_سعر_${data.quotationNumber}.xlsx`,
    shareTitle: `عرض سعر ${data.quotationNumber}`,
    shareText: caption,
    fallbackText: caption,
    onDownloadFallback: () => exportQuotationToExcel(data),
  });
};

const runWhatsAppShare = (
  data: QuotationExcelData,
  payload: QuotationSharePayload,
  notify: (message: string, type: 'success' | 'error') => void
): void => {
  if (!supportsNativeFileShare()) {
    openQuotationWhatsApp(payload);
    void exportQuotationToExcel(data).then(
      () => {
        notify('تم فتح واتساب وتنزيل ملف العرض لإرفاقه', 'success');
      },
      (error: unknown) => {
        reportShareError(error, notify);
      }
    );
    return;
  }
  void sendExcelToWhatsApp(data, buildQuotationCaption(payload)).then(
    () => {
      notify('تم تجهيز ملف عرض السعر للإرسال', 'success');
    },
    (error: unknown) => {
      reportShareError(error, notify);
    }
  );
};

export const useQuotationShare = (options: ShareOptions): ShareResult => {
  const { quotation, companyName, companyPhone, companyTaxNumber, slogan, whatsapp, excelContext, notify } = options;

  const payload = useMemo((): QuotationSharePayload | null => {
    if (quotation === null) return null;
    const headerText = buildWhatsappHeader(whatsapp, {
      name: companyName,
      phone: companyPhone,
      taxNumber: companyTaxNumber,
      slogan,
    });
    return toSharePayload(mapQuotationToPrintData(quotation), { companyName, headerText });
  }, [quotation, companyName, companyPhone, companyTaxNumber, slogan, whatsapp]);

  const buildExcel = useCallback(
    (): QuotationExcelData | null =>
      quotation === null ? null : toQuotationExcelData(mapQuotationToPrintData(quotation), excelContext),
    [quotation, excelContext]
  );

  const shareWhatsApp = useCallback((): void => {
    const data = buildExcel();
    if (data === null || payload === null) {
      notify('لم تُحمَّل بيانات العرض بعد، أعد المحاولة بعد لحظة', 'error');
      return;
    }
    runWhatsAppShare(data, payload, notify);
  }, [buildExcel, payload, notify]);

  const shareTelegram = useCallback((): void => {
    if (payload === null) {
      notify('لم تُحمَّل بيانات العرض بعد، أعد المحاولة بعد لحظة', 'error');
      return;
    }
    openQuotationTelegram(payload);
  }, [payload, notify]);

  const copyText = useCallback((): void => {
    if (payload === null) return;
    void copyQuotationText(payload).then((copied: boolean) => {
      notify(copied ? 'تم نسخ نص العرض' : 'تعذّر النسخ', copied ? 'success' : 'error');
    });
  }, [payload, notify]);

  const exportExcel = useCallback((): void => {
    const data = buildExcel();
    if (data === null) return;
    void exportQuotationToExcel(data).then(() => {
      notify('تم تنزيل ملف عرض السعر', 'success');
    });
  }, [buildExcel, notify]);

  return { shareWhatsApp, shareTelegram, copyText, exportExcel };
};
