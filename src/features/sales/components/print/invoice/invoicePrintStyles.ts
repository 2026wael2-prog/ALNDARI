/**
 * أنماط طباعة الفاتورة (A4) — تُحقن في وسم <style> داخل الصفحة.
 * اللون الرئيسي يأتي من شريط الأدوات، لذا تُبنى السلسلة دالةً في اللون.
 */
const INVOICE_PRINT_CSS_TEMPLATE = `
  @media print {
      body {
          background-color: white !important;
          margin: 0 !important;
          padding: 0 !important;
      }
      .no-print {
          display: none !important;
      }
      .printable-invoice-container {
          display: block !important;
          width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
          box-shadow: none !important;
          border: none !important;
      }
      .invoice-page-box {
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
          border: none !important;
      }
      @page {
          margin: 8mm;
          size: A4 portrait;
      }
      tr {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
      }
      .avoid-break {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
      }
  }
  .invoice-page-box {
      max-width: 210mm;
      margin: auto;
      padding: 8mm 10mm;
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      line-height: 1.45;
      font-variant-numeric: tabular-nums;
  }
  .inv-cell-header {
      background-color: __ACCENT_COLOR__ !important;
      color: #ffffff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
  }
  .inv-row-zebra:nth-child(even) {
      background-color: #f8fafc !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
  }
  .inv-total-highlight {
      background-color: #f0fdf4 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
  }
`;

/**
 * يبني CSS الطباعة باللون الرئيسي المختار. الاستبدال على قالب ثابت (لا `innerHTML`
 * ولا كائنات مفهرسة) لتفادي أي تلويث للأنماط.
 */
export const buildInvoicePrintCss = (accentColor: string): string =>
  INVOICE_PRINT_CSS_TEMPLATE.replace(/__ACCENT_COLOR__/g, accentColor);

