/**
 * shareUtils.ts
 * Shared utility for native file sharing via navigator.share with fallback
 */

/**
 * Share an Excel file using navigator.share API (mobile-first).
 * Falls back to direct download + WhatsApp link on unsupported browsers.
 *
 * @param blob - The Excel file Blob
 * @param filename - File name (e.g., "فاتورة_1001.xlsx")
 * @param title - Share title
 * @param text - Share body text
 */
export const shareExcelFile = async (
  blob: Blob,
  filename: string,
  title: string,
  text: string
): Promise<void> => {
  const file = new File([blob], filename, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title, text });
  } else {
    // Fallback: trigger download + open WhatsApp web
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encodedText}`, '_blank', 'noopener,noreferrer');
  }
};

export interface ShareSpreadsheetOptions {
  /** The generated workbook blob (e.g. from `generateInvoiceExcelBlob`). */
  blob: Blob;
  /** Download/share filename, e.g. `فاتورة_100.xlsx`. */
  fileName: string;
  /** `navigator.share` title (native share sheet only). */
  shareTitle: string;
  /** `navigator.share` text (native share sheet only). */
  shareText: string;
  /** WhatsApp prefilled message used in the non-native fallback path. */
  fallbackText: string;
  /** Downloads the workbook when the native share sheet is unavailable. */
  onDownloadFallback: () => Promise<void>;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Shares an Excel workbook via the native share sheet when available;
 * otherwise downloads it and falls back to WhatsApp deep-link sharing.
 *
 * Unlike `shareExcelFile`, the fallback path can reuse the document's real
 * exporter (e.g. `exportInvoiceToExcel`) and carry a dedicated WhatsApp
 * message distinct from the native share sheet text.
 */
export const shareSpreadsheet = async ({
  blob,
  fileName,
  shareTitle,
  shareText,
  fallbackText,
  onDownloadFallback,
}: ShareSpreadsheetOptions): Promise<void> => {
  const file = new File([blob], fileName, { type: XLSX_MIME });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle, text: shareText });
      return;
    } catch (error) {
      // إلغاء المستخدم للمشاركة ليس فشلاً — لا نفرض مساراً بديلاً عليه.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      // أي فشل آخر (NotAllowedError شائع لأن share() تُنادى بعد await، فيفقد
      // المتصفح تفعيل إيماءة النقر) يجب أن ينزل إلى المسار المضمون بدل أن ينتهي
      // الزر بلا أي أثر على الشاشة.
    }
  }

  // Fallback: open WhatsApp FIRST (still inside the click's user-gesture task),
  // then download the workbook. Calling window.open() after `await` lands outside
  // the transient user activation, so desktop browsers silently block the tab and
  // the user gets the file with no WhatsApp window — verified in Chromium.
  const text = encodeURIComponent(fallbackText);
  window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  await onDownloadFallback();
};

export interface SharePdfOptions {
  blob: Blob;
  fileName: string;
  shareTitle: string;
  shareText: string;
  phone?: string | undefined;
}

const buildWaLink = (text: string, phone?: string): string => {
  const digits = (phone || '').replace(/[^\d]/g, '');
  const cleanPhone = digits.startsWith('00') ? digits.slice(2) : digits;
  const encoded = encodeURIComponent(text);
  return cleanPhone.length >= 9
    ? `https://wa.me/${cleanPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
};

/**
 * Shares a generated PDF file via the native share sheet (mobile/supported browsers),
 * or downloads the PDF and opens WhatsApp directly to the recipient so the user can attach it.
 */
export const sharePdfViaWhatsApp = async ({
  blob,
  fileName,
  shareTitle,
  shareText,
  phone,
}: SharePdfOptions): Promise<'native' | 'download_and_wa'> => {
  const normalizedName = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  const file = new File([blob], normalizedName, { type: 'application/pdf' });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle, text: shareText });
      return 'native';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'native';
      }
    }
  }

  // Fallback for desktop browsers: download the colored PDF & open WhatsApp
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = normalizedName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  window.open(buildWaLink(shareText, phone), '_blank', 'noopener,noreferrer');
  return 'download_and_wa';
};

/** Opens WhatsApp with a prefilled formatted text message. */
export const shareTextViaWhatsApp = (text: string, phone?: string): void => {
  window.open(buildWaLink(text, phone), '_blank', 'noopener,noreferrer');
};
