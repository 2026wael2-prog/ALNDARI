/**
 * أنماط الطباعة الموحدة الرسمية لشركة النظاري لقطع غيار السيارات
 * مطابقة للفاتورة المرجعية الرسمية: A4، اتجاه RTL، حدود سوداء واضحة،
 * ترويسات رمادية خفيفة، وتكرار الترويسة في الصفحات المتعددة.
 */
export const ALNADARY_PRINT_CSS = `
  .alnadary-print-sheet {
    width: 100%;
    max-width: none;
    margin: 0;
    padding: 14px 18px;
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

  /* ── 1. الهيدر الموحد ثلاثي الأعمدة (كامل العرض، متوازن وراقي، متوافق 100% مع الطباعة و html2canvas) ── */
  .alnadary-header-grid {
    display: table !important;
    width: 100% !important;
    table-layout: fixed !important;
    padding: 4px 0 8px 0;
    box-sizing: border-box;
    border-collapse: collapse;
  }

  .alnadary-header-right {
    display: table-cell !important;
    vertical-align: middle !important;
    width: 39% !important;
    text-align: center;
    padding-inline-end: 6px;
    box-sizing: border-box;
  }

  .alnadary-company-title {
    font-size: 22px;
    font-weight: 900;
    color: #000000 !important;
    letter-spacing: normal !important;
    line-height: 1.25;
    margin: 0 0 3px 0;
    word-break: keep-all;
  }

  .alnadary-tagline {
    margin: 0;
    font-size: 11.5px;
    font-weight: 800;
    color: #b91c1c !important;
    line-height: 1.45;
  }

  .alnadary-tagline-line {
    display: block;
    color: #b91c1c !important;
  }

  .alnadary-header-center {
    display: table-cell !important;
    vertical-align: middle !important;
    width: 22% !important;
    text-align: center;
    padding: 0 4px;
    box-sizing: border-box;
  }

  .alnadary-logo-img {
    height: 84px;
    width: auto;
    max-width: 110px;
    object-fit: contain;
    display: block;
    margin: 0 auto;
  }

  .alnadary-header-left {
    display: table-cell !important;
    vertical-align: middle !important;
    width: 39% !important;
    text-align: center;
    padding-inline-start: 6px;
    box-sizing: border-box;
  }

  .alnadary-address-block {
    font-size: 11.5px;
    font-weight: 700;
    color: #000000 !important;
    line-height: 1.55;
    margin-bottom: 4px;
  }

  .alnadary-date-row {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 800;
    padding: 2px 10px;
    border: 1px solid #000000;
    background-color: #f9fafb !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
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
    display: table !important;
    width: 100% !important;
    table-layout: fixed !important;
    margin: 6px 0 4px 0;
    font-size: 12px;
    box-sizing: border-box;
    border-collapse: collapse;
  }

  .alnadary-meta-col-right,
  .alnadary-meta-grid > div:first-child {
    display: table-cell !important;
    width: 58% !important;
    vertical-align: top !important;
    text-align: right;
  }

  .alnadary-meta-col-left,
  .alnadary-meta-grid > div:last-child {
    display: table-cell !important;
    width: 42% !important;
    vertical-align: top !important;
    text-align: right;
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
    display: table !important;
    width: 100% !important;
    table-layout: fixed !important;
    border: 1px solid #000000;
    min-height: 28px;
    box-sizing: border-box;
    border-collapse: collapse;
  }

  .alnadary-total-bar-label {
    display: table-cell !important;
    vertical-align: middle !important;
    width: 115px !important;
    font-weight: 800;
    background-color: #f3f4f6 !important;
    border-left: 1px solid #000000;
    padding: 4px 8px;
    text-align: center;
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .alnadary-total-bar-words {
    display: table-cell !important;
    vertical-align: middle !important;
    font-weight: 700;
    padding: 4px 10px;
    text-align: center;
    border-left: 1px solid #000000;
    box-sizing: border-box;
  }

  .alnadary-total-bar-amount {
    display: table-cell !important;
    vertical-align: middle !important;
    width: 130px !important;
    font-weight: 900;
    font-size: 13px;
    padding: 4px 8px;
    text-align: center;
    direction: ltr;
    box-sizing: border-box;
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
    display: table !important;
    width: 100% !important;
    table-layout: fixed !important;
    box-sizing: border-box;
    border-collapse: collapse;
  }

  .alnadary-remaining-row > div:nth-child(1) {
    display: table-cell !important;
    width: 135px !important;
    vertical-align: middle !important;
    padding-inline-end: 6px;
  }

  .alnadary-remaining-row > div:nth-child(2) {
    display: table-cell !important;
    width: 95px !important;
    vertical-align: middle !important;
    padding-inline-end: 6px;
  }

  .alnadary-remaining-row > div:nth-child(3) {
    display: table-cell !important;
    vertical-align: middle !important;
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
    display: table !important;
    width: 100% !important;
    table-layout: fixed !important;
    text-align: center;
    margin-top: 10px;
    font-size: 11.5px;
    font-weight: 800;
    box-sizing: border-box;
    border-collapse: collapse;
  }

  .alnadary-signatures-row > div {
    display: table-cell !important;
    width: 33.333% !important;
    vertical-align: top !important;
    padding: 0 8px;
    box-sizing: border-box;
  }

  .alnadary-sig-line {
    margin-top: 22px;
    border-top: 1px dotted #000000;
    padding-top: 3px;
  }

  /* ── تكيّف معاينة الطباعة على شاشات الهواتف فقط (لا يؤثر إطلاقاً على الطباعة الفعلية A4 ولا على تصدير PDF) ── */
  @media screen and (max-width: 767px) {
    .alnadary-print-sheet {
      padding: 8px 10px;
      line-height: 1.35;
      overflow-x: hidden;
    }

    .alnadary-print-sheet main {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .alnadary-header-grid {
      padding: 2px 0 6px 0;
    }

    .alnadary-header-right {
      width: 41% !important;
      padding-inline-end: 3px;
    }

    .alnadary-header-center {
      width: 18% !important;
      padding: 0 2px;
    }

    .alnadary-header-left {
      width: 41% !important;
      padding-inline-start: 3px;
    }

    .alnadary-company-title {
      font-size: 13px;
      line-height: 1.2;
      margin-bottom: 2px;
    }

    .alnadary-tagline {
      font-size: 9px;
      line-height: 1.3;
    }

    .alnadary-logo-img {
      height: 46px;
      max-width: 56px;
    }

    .alnadary-address-block {
      font-size: 9px;
      line-height: 1.35;
      margin-bottom: 3px;
    }

    .alnadary-date-row {
      font-size: 9.5px;
      gap: 3px;
      padding: 1px 5px;
    }

    .alnadary-doc-title {
      font-size: 12px;
      margin-bottom: 4px;
    }

    .alnadary-meta-grid {
      font-size: 10px;
      margin: 4px 0 2px 0;
    }

    .alnadary-meta-col-right,
    .alnadary-meta-grid > div:first-child {
      width: 54% !important;
      padding-inline-end: 4px;
    }

    .alnadary-meta-col-left,
    .alnadary-meta-grid > div:last-child {
      width: 46% !important;
      padding-inline-start: 4px;
    }

    .alnadary-meta-item {
      gap: 4px;
    }

    .alnadary-table {
      table-layout: auto;
      margin-bottom: 8px;
    }

    .alnadary-table th,
    .alnadary-table td {
      padding: 3px 4px;
      font-size: 10px;
    }

    .alnadary-totals-section {
      font-size: 10.5px;
      gap: 5px;
      display: flex !important;
      flex-direction: column !important;
      grid-template-columns: 1fr !important;
    }

    .alnadary-total-bar {
      display: flex !important;
      flex-wrap: wrap;
      align-items: stretch;
    }

    .alnadary-total-bar-label {
      display: flex !important;
      align-items: center;
      justify-content: center;
      width: auto !important;
      flex: 0 0 auto;
      padding: 3px 8px;
      font-size: 10.5px;
    }

    .alnadary-total-bar-amount {
      display: flex !important;
      align-items: center;
      justify-content: center;
      width: auto !important;
      flex: 1 1 auto;
      padding: 3px 8px;
      font-size: 12px;
    }

    .alnadary-total-bar-words {
      display: block !important;
      flex: 1 0 100%;
      order: 3;
      border-left: none;
      border-top: 1px solid #000000;
      padding: 3px 6px;
      font-size: 10px;
    }

    .alnadary-inline-summary {
      gap: 8px 12px;
      font-size: 10.5px;
      padding: 2px 2px;
    }

    .alnadary-remaining-row {
      display: flex !important;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 8px;
    }

    .alnadary-remaining-row > div:nth-child(1),
    .alnadary-remaining-row > div:nth-child(2) {
      display: block !important;
      width: auto !important;
      padding-inline-end: 0;
    }

    .alnadary-remaining-row > div:nth-child(3) {
      display: block !important;
      flex: 1 0 100%;
    }

    .alnadary-remaining-words-box,
    .alnadary-notes-box {
      font-size: 10px;
      padding: 4px 6px;
    }

    .alnadary-footer {
      margin-top: 10px;
      padding-top: 6px;
      font-size: 10px;
    }

    .alnadary-terms-row {
      gap: 4px;
      margin-bottom: 8px;
    }

    .alnadary-signatures-row {
      font-size: 10px;
      margin-top: 6px;
    }

    .alnadary-signatures-row > div {
      padding: 0 3px;
    }

    .alnadary-sig-line {
      margin-top: 14px;
    }

    /* الحفاظ على مقاسات A4 الأصلية 100% داخل حاوية تصدير PDF المخفية حتى عند التصدير من الهاتف */
    .pdf-capture-host .alnadary-print-sheet {
      padding: 14px 18px;
      line-height: 1.45;
      overflow-x: visible;
    }
    .pdf-capture-host .alnadary-print-sheet main {
      overflow-x: visible;
    }
    .pdf-capture-host .alnadary-header-right,
    .pdf-capture-host .alnadary-header-left {
      width: 39% !important;
    }
    .pdf-capture-host .alnadary-header-center {
      width: 22% !important;
    }
    .pdf-capture-host .alnadary-company-title {
      font-size: 22px;
    }
    .pdf-capture-host .alnadary-tagline,
    .pdf-capture-host .alnadary-address-block,
    .pdf-capture-host .alnadary-date-row {
      font-size: 11.5px;
    }
    .pdf-capture-host .alnadary-logo-img {
      height: 84px;
      max-width: 110px;
    }
    .pdf-capture-host .alnadary-doc-title {
      font-size: 14px;
    }
    .pdf-capture-host .alnadary-meta-grid {
      font-size: 12px;
    }
    .pdf-capture-host .alnadary-meta-col-right,
    .pdf-capture-host .alnadary-meta-grid > div:first-child {
      width: 58% !important;
    }
    .pdf-capture-host .alnadary-meta-col-left,
    .pdf-capture-host .alnadary-meta-grid > div:last-child {
      width: 42% !important;
    }
    .pdf-capture-host .alnadary-table {
      table-layout: fixed;
    }
    .pdf-capture-host .alnadary-table th {
      font-size: 12px;
      padding: 5px 6px;
    }
    .pdf-capture-host .alnadary-table td {
      font-size: 11.5px;
      padding: 5px 6px;
    }
    .pdf-capture-host .alnadary-total-bar {
      display: table !important;
    }
    .pdf-capture-host .alnadary-total-bar-label {
      display: table-cell !important;
      width: 115px !important;
      font-size: 12px;
    }
    .pdf-capture-host .alnadary-total-bar-words {
      display: table-cell !important;
      border-top: none;
      border-left: 1px solid #000000;
      font-size: 12px;
    }
    .pdf-capture-host .alnadary-total-bar-amount {
      display: table-cell !important;
      width: 130px !important;
      font-size: 13px;
    }
    .pdf-capture-host .alnadary-remaining-row {
      display: table !important;
    }
    .pdf-capture-host .alnadary-remaining-row > div:nth-child(1) {
      display: table-cell !important;
      width: 135px !important;
    }
    .pdf-capture-host .alnadary-remaining-row > div:nth-child(2) {
      display: table-cell !important;
      width: 95px !important;
    }
    .pdf-capture-host .alnadary-remaining-row > div:nth-child(3) {
      display: table-cell !important;
    }
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
      background-color: #ffffff !important;
      color: #000000 !important;
    }

    .alnadary-print-sheet .alnadary-header-wrapper {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      background: transparent !important;
      color: #000000 !important;
    }

    .alnadary-print-sheet .alnadary-header-wrapper *:not(.alnadary-tagline):not(.alnadary-tagline-line) {
      color: #000000 !important;
    }

    .alnadary-print-sheet .alnadary-tagline,
    .alnadary-print-sheet .alnadary-tagline-line {
      color: #b91c1c !important;
    }

    .alnadary-print-sheet .alnadary-header-grid {
      display: table !important;
      visibility: visible !important;
      width: 100% !important;
      table-layout: fixed !important;
    }

    .alnadary-print-sheet .alnadary-header-right,
    .alnadary-print-sheet .alnadary-header-center,
    .alnadary-print-sheet .alnadary-header-left {
      display: table-cell !important;
      vertical-align: middle !important;
    }

    .alnadary-print-sheet .alnadary-logo-img {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
  }
`;
