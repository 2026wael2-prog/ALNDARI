import { exportToPDF } from '../../../core/utils/pdfExporter';
import { formatLocalDate } from '../../../core/utils/dateUtils';

export async function exportStudyElementToPdf(
  element: HTMLElement,
  fileName = `دراسة_ذكاء_المخزون_${formatLocalDate()}`
): Promise<void> {
  await exportToPDF(element, fileName.replace(/\.pdf$/i, ''), {
    pageSize: 'a4',
    orientation: 'p',
    marginMm: 8,
    scale: 2,
    breakSelector: 'tr, [data-pdf-break]',
  });
}

const escapeHtmlText = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function printStudyElement(element: HTMLElement, title = 'دراسة ذكاء المخزون والمشتريات'): void {
  const win = window.open('', '_blank', 'width=1024,height=768');
  if (!win) {
    window.print();
    return;
  }

  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(node => node.outerHTML)
    .join('\n');

  const safeTitle = escapeHtmlText(title);

  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  ${styles}
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { background: #ffffff !important; color: #0f172a !important; padding: 12px; font-family: Tahoma, Arial, sans-serif; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
    tr { page-break-inside: avoid; break-inside: avoid; }
  </style>
</head>
<body>
  ${element.outerHTML}
</body>
</html>`);
  win.document.close();

  // Trigger print from parent window (no inline <script> so strict CSP script-src 'self' is never violated)
  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } catch {
      // Ignore if popup was closed before print
    }
  };
  win.addEventListener('load', () => {
    setTimeout(triggerPrint, 250);
  });
  setTimeout(triggerPrint, 500);
}
