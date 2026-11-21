import { logger } from '../../core/utils/logger';

/** A vertical window of the captured document that is rendered on its own PDF page. */
export interface PageSlice {
  /** Offset from the top of the captured document, in millimetres. */
  sourceY: number;
  /** Height of the window, in millimetres. */
  sourceHeight: number;
}

export interface PDFExportOptions {
  pageSize?: 'a4' | 'a5' | 'letter';
  orientation?: 'p' | 'l';
  /** Margin kept around the printable area, in millimetres. */
  marginMm?: number;
  /** html2canvas drawing scale for the capture. */
  scale?: number;
  /** Explicit page-break candidates (element bottoms) in millimetres. */
  breakpointsMm?: number[];
  /** Selector used to collect natural page-break boundaries from the DOM. */
  breakSelector?: string;
}

/** Minimum height a slice must gain before snapping to a breakpoint, to guarantee progress. */
const MIN_SLICE_MM = 1;

/**
 * Splits content of `totalHeight` into page-sized slices.
 * Breaks snap to the last candidate boundary that still fits, so a table row is never cut in half.
 */
export const computePageSlices = (
  totalHeight: number,
  pageHeight: number,
  breakpoints: number[] = []
): PageSlice[] => {
  if (!Number.isFinite(totalHeight) || !Number.isFinite(pageHeight)) return [];
  if (totalHeight <= 0 || pageHeight <= 0) return [];

  const candidates = breakpoints
    .filter(point => Number.isFinite(point) && point > 0 && point < totalHeight)
    .sort((a, b) => a - b);

  const slices: PageSlice[] = [];
  let start = 0;

  while (start < totalHeight - 1e-6) {
    const target = Math.min(start + pageHeight, totalHeight);
    let end = target;
    if (target < totalHeight - 1e-6) {
      const fitting = candidates.filter(point => point > start + MIN_SLICE_MM && point <= target);
      // `pop()` keeps the largest fitting boundary; an empty result means "cut at the page edge".
      const lastFitting = fitting.pop();
      if (lastFitting !== undefined) end = lastFitting;
    }
    slices.push({ sourceY: start, sourceHeight: end - start });
    start = end;
  }

  return slices;
};

/** Collects the bottom edge of table rows (and explicit markers) as page-break candidates. */
const collectBreakpointsMm = (
  element: HTMLElement,
  contentWidthMm: number,
  fallbackRatio: number,
  selector = 'tr, [data-pdf-break]'
): number[] => {
  if (typeof element.getBoundingClientRect !== 'function') return [];
  const rootRect = element.getBoundingClientRect();
  if (!Number.isFinite(rootRect.height) || rootRect.height <= 0) return [];

  // DOM coordinates from getBoundingClientRect() are in 1x CSS pixels, whereas
  // `canvas.width` is scaled by `scale` (e.g. 2x). Using `contentWidthMm / rootRect.width`
  // keeps DOM breakpoints aligned 1:1 with the rendered PDF millimetres.
  const domRatio =
    Number.isFinite(rootRect.width) && rootRect.width > 0
      ? contentWidthMm / rootRect.width
      : fallbackRatio;

  const boundaries: number[] = [];
  element.querySelectorAll<HTMLElement>(selector).forEach(node => {
    const rect = node.getBoundingClientRect();
    if (!Number.isFinite(rect.bottom) || rect.bottom <= rootRect.top) return;
    boundaries.push((rect.bottom - rootRect.top) * domRatio);
  });
  return boundaries;
};

/** Ensures all web fonts and embedded images (e.g. logos) are loaded before rasterizing. */
const waitForCaptureReadiness = async (element: HTMLElement): Promise<void> => {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // Non-fatal font readiness check
    }
  }

  if (typeof element.querySelectorAll === 'function') {
    const images = Array.from(element.querySelectorAll('img'));
    if (images.length > 0) {
      await Promise.all(
        images.map(img => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise<void>(resolve => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 600);
          });
        })
      );
    }
  }
};

/** Captures the DOM subtree as a high-resolution canvas (html2canvas is loaded on demand). */
const captureElement = async (element: HTMLElement, scale: number): Promise<HTMLCanvasElement> => {
  await waitForCaptureReadiness(element);
  const html2canvas = (await import('html2canvas')).default;
  return html2canvas(element, {
    scale, // Higher scale keeps text crisp when printed
    useCORS: true, // Allow loading cross-origin images
    logging: false,
    backgroundColor: '#ffffff', // Ensure white background
    windowWidth: Math.max(element.scrollWidth || 0, 794),
    windowHeight: Math.max(element.scrollHeight || 0, 1123),
    onclone: (clonedDoc, clonedElement) => {
      // In the cloned document used by html2canvas, reset any off-screen host positioning (-100000px)
      // so canvas coordinates start cleanly at (0, 0) without negative translation or layout drift.
      if (clonedElement && clonedElement.style) {
        clonedElement.style.position = 'static';
        clonedElement.style.left = '0px';
        clonedElement.style.top = '0px';
        clonedElement.style.margin = '0px';
        clonedElement.style.visibility = 'visible';
        clonedElement.style.opacity = '1';
      }

      let ancestor: HTMLElement | null = clonedElement?.parentElement ?? null;
      while (ancestor && ancestor !== clonedDoc.body) {
        if (ancestor.style) {
          ancestor.style.position = 'static';
          ancestor.style.left = '0px';
          ancestor.style.top = '0px';
          ancestor.style.margin = '0px';
          ancestor.style.padding = '0px';
          ancestor.style.transform = 'none';
          ancestor.style.visibility = 'visible';
          ancestor.style.opacity = '1';
        }
        ancestor = ancestor.parentElement;
      }

      if (clonedDoc?.body?.style) {
        clonedDoc.body.style.margin = '0px';
        clonedDoc.body.style.padding = '0px';
        clonedDoc.body.style.overflow = 'visible';
      }
    },
    ignoreElements: el =>
      Boolean(
        el.classList &&
          (el.classList.contains('no-print') || el.classList.contains('print:hidden'))
      ),
  });
};

/**
 * Crops a vertical slice `[sourceY, sourceY + sourceHeight]` (in mm) from a real
 * HTMLCanvasElement into its own tightly bounded PNG so content never bleeds into
 * PDF margins or duplicates rows from the next page. Returns `null` when running
 * on a non-canvas mock (e.g. jsdom unit tests without a 2D context).
 */
const cropSliceToDataUrl = (
  canvas: HTMLCanvasElement,
  slice: PageSlice,
  mmPerPx: number
): string | null => {
  if (typeof document === 'undefined' || mmPerPx <= 0) return null;
  const isDrawableCanvas =
    typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement;
  if (!isDrawableCanvas) return null;

  const srcY = Math.max(0, Math.round(slice.sourceY / mmPerPx));
  const srcHeight = Math.max(1, Math.min(canvas.height - srcY, Math.round(slice.sourceHeight / mmPerPx)));
  if (srcHeight <= 0) return null;

  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = canvas.width;
  pageCanvas.height = srcHeight;
  const ctx = pageCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
  ctx.drawImage(canvas, 0, srcY, canvas.width, srcHeight, 0, 0, canvas.width, srcHeight);
  return pageCanvas.toDataURL('image/png');
};

/** Lays the captured canvas out over standard pages (jsPDF is loaded on demand). */
const writeCanvasToPdf = async (
  canvas: HTMLCanvasElement,
  element: HTMLElement,
  fileName: string,
  options: PDFExportOptions
): Promise<void> => {
  const { jsPDF } = await import('jspdf');
  const { pageSize = 'a4', orientation = 'p', marginMm = 0 } = options;

  // 1. Initialize a standard page and its printable area.
  const pdf = new jsPDF(orientation, 'mm', pageSize);
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = Math.max(pdfWidth - marginMm * 2, 1);
  const contentHeight = Math.max(pdfHeight - marginMm * 2, 1);

  // 2. Fit the capture to the printable width; heights stay in millimetres.
  const ratio = contentWidth / canvas.width;
  const scaledHeight = canvas.height * ratio;

  // 3. Break long documents into standard pages instead of one overflowing page.
  const breakpoints =
    options.breakpointsMm ?? collectBreakpointsMm(element, contentWidth, ratio, options.breakSelector);
  const slices = computePageSlices(scaledHeight, contentHeight, breakpoints);
  if (slices.length === 0) {
    // A display:none or unmounted capture source yields an empty canvas:
    // fail loudly instead of downloading a misleading blank document.
    throw new Error('PDF export aborted: the captured element is empty');
  }

  // 4. Prefer exact per-page canvas cropping (prevents margin bleed and duplicated rows);
  // fall back to shifted full-image window when 2D canvas cropping isn't available.
  let fallbackImgData: string | null = null;
  slices.forEach((slice, index) => {
    if (index > 0) pdf.addPage();
    const cropped = cropSliceToDataUrl(canvas, slice, ratio);
    if (cropped !== null) {
      pdf.addImage(cropped, 'PNG', marginMm, marginMm, contentWidth, slice.sourceHeight);
    } else {
      fallbackImgData ??= canvas.toDataURL('image/png');
      pdf.addImage(fallbackImgData, 'PNG', marginMm, marginMm - slice.sourceY, contentWidth, scaledHeight);
    }
  });

  pdf.save(`${fileName}.pdf`);
};

export const exportToPDF = async (
  element: HTMLElement | null,
  fileName: string,
  options: PDFExportOptions = {}
): Promise<void> => {
  if (element === null) {
    logger.error('pdfExporter', 'Export element not provided');
    return;
  }

  try {
    const canvas = await captureElement(element, options.scale ?? 2);
    await writeCanvasToPdf(canvas, element, fileName, options);
  } catch (error) {
    logger.error('pdfExporter', 'PDF Export Failed:', error);
    throw error;
  }
};
