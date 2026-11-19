/**
 * أنماط الطباعة الموحدة الرسمية لشركة النظاري لقطع غيار السيارات
 * مطابقة للفاتورة المرجعية الرسمية: A4، اتجاه RTL، حدود سوداء واضحة،
 * ترويسات رمادية خفيفة، وتكرار الترويسة في الصفحات المتعددة.
 */
export const ALNADARY_PRINT_CSS = `
  .alnadary-print-sheet {
    width: 100%;
    max-width: 210mm;
    margin: 0 auto;
    padding: 12px 14px;
    background-color: #ffffff !important;
    color: #000000 !important;
    font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif !important;
    direction: rtl;
    text-align: right;
    font-variant-numeric: tabular-nums;
    box-sizing: border-box;
    line-height: 1.45;
  }

  .alnadary-print-sheet * {
    box-sizing: border-box;
    color: #000000;
  }

  /* ── 1. الهيدر الموحد ثلاثي الأعمدة ── */
  .alnadary-header-grid {
    display: grid;
    grid-template-columns: 1.3fr 0.72fr 1.28fr;
    align-items: center;
    gap: 8px;
    padding-bottom: 6px;
  }

  .alnadary-header-right {
    text-align: center;
  }

  .alnadary-company-title {
    font-size: 26px;
    font-weight: 900;
    color: #000000 !important;
    letter-spacing: 0.5px;
    line-height: 1.15;
    margin: 0 0 4px 0;
  }

  .alnadary-tagline {
    margin: 0;
    font-size: 12px;
    font-weight: 800;
    color: #b91c1c !important;
    line-height: 1.5;
  }

  .alnadary-tagline-line {
    display: block;
    color: #b91c1c !important;
  }

  .alnadary-header-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .alnadary-logo-img {
    height: 82px;
    width: auto;
    max-width: 115px;
    object-fit: contain;
    display: block;
  }

  .alnadary-header-left {
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 6px;
  }

  .alnadary-address-block {
    font-size: 11.5px;
    font-weight: 700;
    color: #000000 !important;
    line-height: 1.55;
  }

  .alnadary-date-row {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 800;
    padding-top: 4px;
    padding-inline-start: 10px;
  }

  .alnadary-solid-divider {
    border: 0;
    border-top: 1.4px solid #000000;
    margin: 2px 0 6px 0;
  }

  .alnadary-dashed-divider {
    border: 0;
    border-bottom: 1.6px dashed #000000;
    margin: 6px 0 10px 0;
  }

  /* ── 2. شريط عنوان المستند وبيانات الطرف ── */
  .alnadary-doc-title {
    text-align: center;
    font-size: 14px;
    font-weight: 900;
    color: #000000 !important;
    margin: 0 0 6px 0;
  }

  .alnadary-meta-grid {
    display: grid;
    grid-template-columns: 1.55fr 1fr;
    gap: 6px 14px;
    font-size: 12.5px;
    align-items: center;
  }

  .alnadary-meta-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }

  .alnadary-meta-label {
    font-weight: 800;
    white-space: nowrap;
  }

  .alnadary-meta-value {
    font-weight: 700;
  }

  /* ── 3. الجدول المحاسبي الرسمي ── */
  .alnadary-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-bottom: 10px;
    background-color: #ffffff !important;
  }

  .alnadary-table thead {
    display: table-header-group;
  }

  .alnadary-table tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .alnadary-table th,
  .alnadary-table td {
    border: 1px solid #000000 !important;
    padding: 5px 6px;
    vertical-align: middle;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  .alnadary-table th {
    background-color: #e5e7eb !important;
    color: #000000 !important;
    font-size: 12px;
    font-weight: 800;
    text-align: center;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .alnadary-table td {
    background-color: #ffffff !important;
    color: #000000 !important;
    font-size: 11.5px;
    font-weight: 600;
  }

  .alnadary-td-center {
    text-align: center;
  }

  .alnadary-td-right {
    text-align: right;
  }

  .alnadary-td-num {
    text-align: center;
    font-weight: 700;
    direction: ltr;
  }

  /* ── 4. صناديق الإجماليات والتفقيط أسفل المستند (مطابقة للصورة المرجعية) ── */
  .alnadary-totals-section {
    break-inside: avoid;
    page-break-inside: avoid;
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }

  .alnadary-total-bar {
    display: grid;
    grid-template-columns: 110px 1fr 125px;
    border: 1px solid #000000;
    min-height: 28px;
    align-items: stretch;
  }

  .alnadary-total-bar-label {
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    background-color: #f3f4f6 !important;
    border-left: 1px solid #000000;
    padding: 4px 8px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .alnadary-total-bar-words {
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    padding: 4px 10px;
    text-align: center;
    border-left: 1px solid #000000;
  }

  .alnadary-total-bar-amount {
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 13px;
    padding: 4px 8px;
    direction: ltr;
  }

  .alnadary-inline-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 18px;
    padding: 2px 6px;
    font-weight: 800;
  }

  .alnadary-remaining-row {
    display: grid;
    grid-template-columns: 135px 95px 1fr;
    gap: 8px;
    align-items: center;
  }

  .alnadary-remaining-words-box {
    border: 1px solid #000000;
    padding: 4px 10px;
    text-align: center;
    font-weight: 700;
    min-height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .alnadary-notes-box {
    border: 1px solid #000000;
    padding: 5px 8px;
    font-size: 11.5px;
    font-weight: 700;
    margin-top: 2px;
  }

  /* ── 5. تذييل الشروط والتوقيعات ── */
  .alnadary-footer {
    break-inside: avoid;
    page-break-inside: avoid;
    margin-top: 16px;
    padding-top: 8px;
    border-top: 1px solid #000000;
    font-size: 11px;
    font-weight: 700;
  }

  .alnadary-terms-row {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
  }

  .alnadary-signatures-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    text-align: center;
    margin-top: 10px;
    font-size: 11.5px;
    font-weight: 800;
  }

  .alnadary-sig-line {
    margin-top: 22px;
    border-top: 1px dotted #000000;
    padding-top: 3px;
  }

  /* ── قواعد الطباعة A4 ── */
  @media print {
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }

    html,
    body {
      background: #ffffff !important;
      color: #000000 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .no-print {
      display: none !important;
    }

    .alnadary-print-sheet {
      max-width: none !important;
      width: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
      box-shadow: none !important;
      border: none !important;
    }
  }
`;
