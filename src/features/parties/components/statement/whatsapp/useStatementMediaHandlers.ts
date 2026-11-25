import type React from 'react';
import { useState } from 'react';
import { formatLocalDate } from '../../../../../core/utils/dateUtils';
import { buildWhatsAppWebLink } from '../../../../../core/utils/whatsapp';
import {
  exportStatementToExcel,
  generateStatementExcelBlob,
  type CompanyInfo,
  type StatementEntry,
} from '../../../utils/statementExcelExporter';
import type { PartyType } from '../../../types';
import { triggerBlobDownload } from './statementWhatsAppUtils';

interface ClipboardCapabilities {
  clipboard?: {
    write?: ((items: ClipboardItem[]) => Promise<void>) | undefined;
  };
}

interface ShareCapabilities {
  canShare?: ((data?: ShareData) => boolean) | undefined;
  share?: ((data?: ShareData) => Promise<void>) | undefined;
}

interface ClipboardItemGlobal {
  ClipboardItem?: typeof ClipboardItem | undefined;
}

export interface StatementMediaHandlersParams {
  company: CompanyInfo;
  partyName: string;
  partyType: PartyType;
  phone: string;
  isValidPhone: boolean;
  startDate: string | undefined;
  endDate: string | undefined;
  statementEntries: StatementEntry[];
  whatsappMessage: string;
  gridImageRef: React.RefObject<HTMLDivElement | null>;
  setCopiedType: React.Dispatch<React.SetStateAction<'text' | 'image' | null>>;
  showToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const useStatementMediaHandlers = (params: StatementMediaHandlersParams) => {
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isCapturingImage, setIsCapturingImage] = useState(false);
  const exportRole = params.partyType === 'supplier' ? 'supplier' : 'customer';

  const handleShareExcel = async (): Promise<void> => {
    setIsExportingExcel(true);
    try {
      const blob = await generateStatementExcelBlob(
        params.company,
        params.partyName,
        params.statementEntries,
        {
          partyType: exportRole,
          partyPhone: params.phone,
          dateFrom: params.startDate,
          dateTo: params.endDate,
        }
      );

      const fileName = `كشف_حساب_${params.partyName.replace(/\s+/g, '_')}_${formatLocalDate()}.xlsx`;
      const file = new File([blob], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const shareNavigator: ShareCapabilities = navigator;
      if (shareNavigator.canShare?.({ files: [file] }) === true) {
        await navigator.share({
          files: [file],
          title: `كشف حساب ${params.partyName}`,
          text: params.whatsappMessage,
        });
        params.showToast('تمت مشاركة كشف حساب Excel بنجاح', 'success');
      } else {
        triggerBlobDownload(blob, fileName);
        await navigator.clipboard.writeText(params.whatsappMessage);
        params.showToast(
          'تم تنزيل ملف Excel ونسخ نص الكشف للحافظة! جاري فتح واتساب ويب...',
          'info'
        );
        if (params.isValidPhone) {
          window.open(
            buildWhatsAppWebLink(params.phone, params.whatsappMessage),
            '_blank',
            'noopener,noreferrer'
          );
        }
      }
    } catch {
      params.showToast('تعذر تصدير أو مشاركة ملف Excel', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleDownloadExcel = async (): Promise<void> => {
    setIsExportingExcel(true);
    try {
      await exportStatementToExcel(params.company, params.partyName, params.statementEntries, {
        partyType: exportRole,
        partyPhone: params.phone,
        dateFrom: params.startDate,
        dateTo: params.endDate,
      });
      params.showToast('تم تنزيل كشف الحساب Excel بنجاح', 'success');
    } catch {
      params.showToast('فشل تنزيل ملف Excel', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleCapturedImageBlob = async (blob: Blob | null): Promise<void> => {
    if (blob === null) {
      params.showToast('فشل توليد صورة الجريد', 'error');
      setIsCapturingImage(false);
      return;
    }

    const clipboardApi = (navigator as ClipboardCapabilities).clipboard;
    const clipboardItemCtor = (globalThis as ClipboardItemGlobal).ClipboardItem;

    if (clipboardItemCtor !== undefined && clipboardApi?.write !== undefined) {
      try {
        await clipboardApi.write([new clipboardItemCtor({ 'image/png': blob })]);
        params.setCopiedType('image');
        setTimeout(() => {
          params.setCopiedType(null);
        }, 3000);
        params.showToast(
          'تم نسخ صورة كشف الحساب بنجاح! يمكنك الآن لصقها (Ctrl+V) مباشرة في واتساب',
          'success'
        );
      } catch {
        params.showToast('المتصفح لم يسمح بالنسخ المباشر للصورة، يرجى استخدام زر التحميل', 'info');
      }
    } else {
      params.showToast('المتصفح لا يدعم نسخ الصور المباشر، تم توفير زر التحميل', 'info');
    }
    setIsCapturingImage(false);
  };

  const handleCopyGridImage = async (): Promise<void> => {
    if (!params.gridImageRef.current) return;
    setIsCapturingImage(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(params.gridImageRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      canvas.toBlob(blob => {
        void handleCapturedImageBlob(blob);
      }, 'image/png');
    } catch {
      params.showToast('حدث خطأ أثناء التقاط صورة الجريد', 'error');
      setIsCapturingImage(false);
    }
  };

  const handleDownloadGridImage = async (): Promise<void> => {
    if (!params.gridImageRef.current) return;
    setIsCapturingImage(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(params.gridImageRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `كشف_حساب_${params.partyName.replace(/\s+/g, '_')}_${formatLocalDate()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      params.showToast('تم تحميل صورة الجريد بنجاح', 'success');
    } catch {
      params.showToast('فشل تحميل صورة الجريد', 'error');
    } finally {
      setIsCapturingImage(false);
    }
  };

  return {
    isExportingExcel,
    isCapturingImage,
    handleShareExcel,
    handleDownloadExcel,
    handleCopyGridImage,
    handleDownloadGridImage,
  };
};
