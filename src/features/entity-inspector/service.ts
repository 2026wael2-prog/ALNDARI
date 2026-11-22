/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency, formatNumberDisplay } from '../../core/utils';
import { fetchPartyStatement } from '../parties/services/partyStatementService';
import { productMovementsService } from '../inventory/services/productMovementsService';
import type {
  InspectedEntityData,
  InspectorFieldRow,
  InspectorHistoryRow,
  InspectorKpi,
  InspectorTabSheet,
  InspectorTarget,
} from './types';

export interface InspectContext {
  companyId: string;
  branchId?: string | null | undefined;
  canViewCost?: boolean | undefined;
}

const dash = (val: unknown): string => {
  if (val === null || val === undefined) return '—';
  const s = String(val).trim();
  return s.length > 0 ? s : '—';
};

const formatDateShort = (val: unknown): string => {
  if (!val) return '—';
  const str = String(val);
  return str.length >= 10 ? str.slice(0, 10) : str;
};

const translateStatus = (status: unknown): { label: string; tone: 'emerald' | 'amber' | 'rose' | 'blue' | 'indigo' | 'default' } => {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'active':
      return { label: 'نشط', tone: 'emerald' };
    case 'paid':
      return { label: 'مدفوعة', tone: 'emerald' };
    case 'posted':
      return { label: 'مرحّلة', tone: 'blue' };
    case 'partially_paid':
      return { label: 'مدفوعة جزئياً', tone: 'amber' };
    case 'draft':
      return { label: 'مسودة', tone: 'default' };
    case 'void':
    case 'cancelled':
      return { label: 'ملغاة', tone: 'rose' };
    case 'blocked':
    case 'inactive':
      return { label: 'موقوف', tone: 'rose' };
    default:
      return { label: s || 'نشط', tone: 'blue' };
  }
};

const translateInvoiceType = (type: unknown): string => {
  switch (String(type || '')) {
    case 'sale':
      return 'فاتورة مبيعات';
    case 'sale_return':
      return 'مرتجع مبيعات';
    case 'purchase':
      return 'فاتورة مشتريات';
    case 'purchase_return':
      return 'مرتجع مشتريات';
    default:
      return String(type || 'فاتورة');
  }
};

const translatePaymentMethod = (method: unknown): string => {
  switch (String(method || '')) {
    case 'cash':
      return 'نقدي (كاش)';
    case 'credit':
      return 'آجل (ذمم)';
    case 'bank':
      return 'تحويل بنكي';
    case 'card':
      return 'شبكة / بطاقة';
    default:
      return dash(method);
  }
};

const translateBondType = (type: unknown): string => {
  switch (String(type || '')) {
    case 'receipt':
      return 'سند قبض';
    case 'disbursement':
    case 'payment':
      return 'سند صرف';
    case 'transfer':
      return 'سند تحويل';
    default:
      return 'سند مالي';
  }
};

const translateMovementType = (type: unknown): string => {
  switch (String(type || '').toLowerCase()) {
    case 'sale':
    case 'out':
      return 'صرف / مبيعات';
    case 'purchase':
    case 'in':
      return 'توريد / مشتريات';
    case 'sale_return':
      return 'مرتجع مبيعات';
    case 'purchase_return':
      return 'مرتجع مشتريات';
    case 'transfer':
    case 'transfer_in':
    case 'transfer_out':
      return 'تحويل مخزني';
    case 'adjustment':
    case 'audit':
      return 'تسوية / جرد';
    default:
      return dash(type);
  }
};

async function inspectProduct(id: string, ctx: InspectContext): Promise<InspectedEntityData> {
  const canViewCost = ctx.canViewCost !== false;

  const [productRes, invoiceItemsRes, movementsRes] = await Promise.all([
    supabase
      .from('products')
      .select(
        `
        *,
        category:product_categories(id, name),
        stock:product_stock(
          quantity,
          warehouse_id,
          warehouses(
            id,
            name_ar,
            location,
            branch_id,
            branches:branches(id, name, code)
          )
        )
      `
      )
      .eq('id', id)
      .single(),
    supabase
      .from('invoice_items')
      .select(
        `
        id,
        quantity,
        unit_price,
        total,
        invoice_id,
        invoice:invoices(
          id,
          invoice_number,
          type,
          issue_date,
          status,
          currency_code,
          payment_method,
          party:party_id(id, name)
        )
      `
      )
      .eq('product_id', id)
      .order('id', { ascending: false })
      .limit(60),
    ctx.companyId
      ? productMovementsService.getItemMovement(id, ctx.companyId, ctx.branchId).catch(() => [])
      : Promise.resolve([]),
  ]);

  if (productRes.error || !productRes.data) {
    throw new Error('تعذر تحميل بيانات المنتج المطلوب.');
  }

  const p = productRes.data as any;
  const stockRows: any[] = Array.isArray(p.stock) ? p.stock : [];
  const totalQty = stockRows.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);

  const purchasePrice = Number(p.purchase_price ?? p.cost_price ?? 0);
  const salePrice = Number(p.sale_price ?? p.selling_price ?? 0);
  const marginPct = purchasePrice > 0 ? ((salePrice - purchasePrice) / purchasePrice) * 100 : 0;
  const stockValue = totalQty * (canViewCost ? purchasePrice : salePrice);
  const minLevel = Number(p.min_stock_level ?? 0);

  const invoiceLines: any[] = Array.isArray(invoiceItemsRes.data)
    ? invoiceItemsRes.data.filter((line: any) => line.invoice && line.invoice.status !== 'void')
    : [];

  let totalSoldQty = 0;
  let totalPurchasedQty = 0;
  let lastSalePrice: number | null = null;
  let lastPurchasePrice: number | null = null;

  for (const line of invoiceLines) {
    const invType = line.invoice?.type;
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unit_price) || 0;
    if (invType === 'sale') {
      totalSoldQty += qty;
      if (lastSalePrice === null) lastSalePrice = price;
    } else if (invType === 'purchase') {
      totalPurchasedQty += qty;
      if (lastPurchasePrice === null) lastPurchasePrice = price;
    }
  }

  const kpis: InspectorKpi[] = [
    {
      label: 'الرصيد المتوفر حالياً',
      value: `${formatNumberDisplay(totalQty)} ${p.unit || 'قطعة'}`,
      subValue: minLevel > 0 ? `الحد الأدنى: ${minLevel}` : undefined,
      tone: totalQty <= 0 ? 'rose' : totalQty <= minLevel ? 'amber' : 'emerald',
    },
    {
      label: 'سعر البيع',
      value: formatCurrency(salePrice, 'SAR'),
      subValue: lastSalePrice !== null ? `آخر بيع: ${formatCurrency(lastSalePrice, 'SAR')}` : undefined,
      tone: 'blue',
    },
    ...(canViewCost
      ? [
          {
            label: 'سعر الشراء / التكلفة',
            value: formatCurrency(purchasePrice, 'SAR'),
            subValue:
              purchasePrice > 0
                ? `هامش الربح: ${marginPct.toFixed(1)}%`
                : lastPurchasePrice !== null
                  ? `آخر شراء: ${formatCurrency(lastPurchasePrice, 'SAR')}`
                  : undefined,
            tone: 'indigo' as const,
          },
        ]
      : []),
    {
      label: canViewCost ? 'قيمة المخزون بالتكلفة' : 'قيمة المخزون بالبيع',
      value: formatCurrency(stockValue, 'SAR'),
      subValue: `مباع: ${formatNumberDisplay(totalSoldQty)} | مشترى: ${formatNumberDisplay(totalPurchasedQty)}`,
      tone: 'default',
    },
  ];

  const altNumbers = Array.isArray(p.alternative_numbers)
    ? p.alternative_numbers.filter(Boolean).join(' ، ')
    : dash(p.alternative_numbers);

  const fields: InspectorFieldRow[] = [
    { section: 'الهوية والتعريف', label: 'اسم الصنف', value: dash(p.name_ar || p.name), copyValue: p.name_ar || p.name },
    { section: 'الهوية والتعريف', label: 'رمز الصنف (SKU)', value: dash(p.sku), copyValue: p.sku || undefined, mono: true },
    { section: 'الهوية والتعريف', label: 'رقم القطعة (Part No.)', value: dash(p.part_number), copyValue: p.part_number || undefined, mono: true, tone: 'indigo' },
    { section: 'الهوية والتعريف', label: 'الباركود', value: dash(p.barcode), copyValue: p.barcode || undefined, mono: true },
    { section: 'الهوية والتعريف', label: 'الشركة الصانعة / الماركة', value: dash(p.brand) },
    { section: 'الهوية والتعريف', label: 'التصنيف', value: dash(p.category?.name) },
    { section: 'الهوية والتعريف', label: 'المقاس / المواصفة', value: dash(p.size) },
    { section: 'الهوية والتعريف', label: 'الأرقام البديلة (OEM)', value: dash(altNumbers), mono: true },
    { section: 'التسعير والمخزون', label: 'وحدة القياس', value: dash(p.unit || 'قطعة') },
    { section: 'التسعير والمخزون', label: 'سعر البيع', value: formatCurrency(salePrice, 'SAR'), mono: true, tone: 'blue' },
    ...(canViewCost
      ? [
          {
            section: 'التسعير والمخزون',
            label: 'سعر الشراء / التكلفة',
            value: formatCurrency(purchasePrice, 'SAR'),
            mono: true,
            tone: 'indigo' as const,
          },
          {
            section: 'التسعير والمخزون',
            label: 'هامش الربح المتوقع',
            value: purchasePrice > 0 ? `${marginPct.toFixed(1)}% (${formatCurrency(salePrice - purchasePrice, 'SAR')})` : '—',
            mono: true,
            tone: marginPct > 0 ? ('emerald' as const) : ('rose' as const),
          },
        ]
      : []),
    { section: 'التسعير والمخزون', label: 'الحد الأدنى للمخزون', value: formatNumberDisplay(minLevel), mono: true },
    { section: 'التسعير والمخزون', label: 'صنف استراتيجي (Core)', value: p.is_core ? 'نعم ⭐' : 'لا' },
    { section: 'معلومات السجل', label: 'تاريخ الإضافة', value: formatDateShort(p.created_at), mono: true },
    { section: 'معلومات السجل', label: 'آخر تحديث', value: formatDateShort(p.updated_at), mono: true },
    ...(p.description ? [{ section: 'معلومات السجل', label: 'الوصف والملاحظات', value: String(p.description) }] : []),
  ];

  // Sheet 1: Stock per Warehouse/Branch
  const stockSheetRows: InspectorHistoryRow[] = stockRows.map((s: any, i: number) => {
    const qty = Number(s.quantity) || 0;
    const wh = s.warehouses;
    const branchName = wh?.branches?.name || 'الفرع الرئيسي';
    return {
      id: s.warehouse_id || `wh-${i}`,
      tone: qty <= 0 ? 'rose' : qty <= minLevel ? 'amber' : 'emerald',
      cells: {
        branch: branchName,
        warehouse: dash(wh?.name_ar),
        location: dash(wh?.location),
        quantity: formatNumberDisplay(qty),
        value: formatCurrency(qty * (canViewCost ? purchasePrice : salePrice), 'SAR'),
      },
    };
  });

  // Sheet 2: Recent Invoice Transactions (Sales & Purchases)
  const invoiceHistoryRows: InspectorHistoryRow[] = invoiceLines.map((line: any) => {
    const inv = line.invoice;
    const isSale = inv.type === 'sale' || inv.type === 'sale_return';
    const curr = inv.currency_code || 'SAR';
    return {
      id: line.id,
      tone: inv.type === 'sale' ? 'emerald' : inv.type === 'purchase' ? 'blue' : 'amber',
      target: {
        type: 'invoice',
        id: inv.id,
        label: `#${inv.invoice_number}`,
        subType: inv.type,
      },
      cells: {
        date: formatDateShort(inv.issue_date),
        type: translateInvoiceType(inv.type),
        number: `#${inv.invoice_number || '—'}`,
        party: dash(inv.party?.name || (isSale ? 'عميل نقدي' : 'مورد عام')),
        qty: formatNumberDisplay(Number(line.quantity) || 0),
        unitPrice: formatCurrency(Number(line.unit_price) || 0, curr),
        total: formatCurrency(Number(line.total) || 0, curr),
      },
    };
  });

  // Sheet 3: Stock Ledger Movements
  const movementRows: InspectorHistoryRow[] = (Array.isArray(movementsRes) ? movementsRes : [])
    .slice(0, 80)
    .map((m: any, idx: number) => {
      const qtyDelta = Number(m.quantity_change ?? m.quantity ?? 0);
      return {
        id: String(m.id || m.transaction_id || idx),
        tone: qtyDelta > 0 ? 'emerald' : qtyDelta < 0 ? 'rose' : 'default',
        cells: {
          date: formatDateShort(m.transaction_date || m.created_at || m.date),
          type: translateMovementType(m.transaction_type || m.type),
          ref: dash(m.reference_number || m.invoice_number || m.ref),
          warehouse: dash(m.warehouse_name),
          qty: qtyDelta > 0 ? `+${formatNumberDisplay(qtyDelta)}` : formatNumberDisplay(qtyDelta),
          balance:
            m.running_balance !== undefined && m.running_balance !== null
              ? formatNumberDisplay(Number(m.running_balance))
              : '—',
          notes: dash(m.notes || m.description),
        },
      };
    });

  const sheets: InspectorTabSheet[] = [
    {
      id: 'invoices',
      label: 'فواتير البيع والشراء',
      emptyMessage: 'لا توجد فواتير مسجلة لهذا الصنف حتى الآن.',
      columns: [
        { key: 'date', label: 'التاريخ', align: 'center', mono: true },
        { key: 'type', label: 'العملية', align: 'center' },
        { key: 'number', label: 'رقم المستند', align: 'center', mono: true },
        { key: 'party', label: 'العميل / المورد', align: 'right' },
        { key: 'qty', label: 'الكمية', align: 'center', mono: true },
        { key: 'unitPrice', label: 'السعر', align: 'left', mono: true },
        { key: 'total', label: 'الإجمالي', align: 'left', mono: true },
      ],
      rows: invoiceHistoryRows,
    },
    {
      id: 'movements',
      label: 'سجل حركة المخزون',
      emptyMessage: 'لا توجد حركات مخزنية مسجلة لهذا الصنف.',
      columns: [
        { key: 'date', label: 'التاريخ', align: 'center', mono: true },
        { key: 'type', label: 'نوع الحركة', align: 'center' },
        { key: 'ref', label: 'المرجع', align: 'center', mono: true },
        { key: 'warehouse', label: 'المستودع', align: 'right' },
        { key: 'qty', label: 'التغير', align: 'center', mono: true },
        { key: 'balance', label: 'الرصيد', align: 'center', mono: true },
        { key: 'notes', label: 'البيان', align: 'right' },
      ],
      rows: movementRows,
    },
    {
      id: 'stock',
      label: 'التوزيع بالمستودعات',
      emptyMessage: 'لا توجد أرصدة مسجلة بالمستودعات لهذا الصنف.',
      columns: [
        { key: 'branch', label: 'الفرع', align: 'right' },
        { key: 'warehouse', label: 'المستودع', align: 'right' },
        { key: 'location', label: 'الموقع / الرف', align: 'center' },
        { key: 'quantity', label: 'الكمية المتوفرة', align: 'center', mono: true },
        { key: 'value', label: 'القيمة التقديرية', align: 'left', mono: true },
      ],
      rows: stockSheetRows,
    },
  ];

  const st = translateStatus(p.status || 'active');
  return {
    type: 'product',
    title: dash(p.name_ar || p.name),
    subtitle: [p.brand, p.category?.name, p.part_number ? `رقم القطعة: ${p.part_number}` : null]
      .filter(Boolean)
      .join(' • ') || 'بطاقة منتج تفصيلية',
    code: p.sku || p.part_number || undefined,
    badge: { label: totalQty > 0 ? st.label : 'نفد المخزون', tone: totalQty > 0 ? st.tone : 'rose' },
    kpis,
    fields,
    sheets,
  };
}

async function inspectParty(id: string, ctx: InspectContext, subType?: string): Promise<InspectedEntityData> {
  const [partyRes, invoicesRes, paymentsRes] = await Promise.all([
    supabase
      .from('parties')
      .select('*, party_categories(id, name)')
      .eq('id', id)
      .single(),
    supabase
      .from('invoices')
      .select('id, invoice_number, type, issue_date, total_amount, total_document_amount, currency_code, payment_method, status')
      .eq('party_id', id)
      .neq('status', 'void')
      .is('deleted_at', null)
      .order('issue_date', { ascending: false })
      .limit(50),
    supabase
      .from('payments')
      .select('id, payment_number, payment_date, amount, currency_code, payment_method, type, notes, status')
      .eq('party_id', id)
      .neq('status', 'void')
      .is('deleted_at', null)
      .order('payment_date', { ascending: false })
      .limit(50),
  ]);

  if (partyRes.error || !partyRes.data) {
    throw new Error('تعذر تحميل بيانات الطرف المطلوب.');
  }

  const party = partyRes.data as any;
  const partyType: 'customer' | 'supplier' =
    party.type === 'supplier' || subType === 'supplier' ? 'supplier' : 'customer';

  const statementMovements = await fetchPartyStatement(
    id,
    partyType,
    { companyId: ctx.companyId, branchId: ctx.branchId ?? null },
    ctx.companyId
  ).catch(() => []);

  const invoices: any[] = Array.isArray(invoicesRes.data) ? invoicesRes.data : [];
  const payments: any[] = Array.isArray(paymentsRes.data) ? paymentsRes.data : [];

  // Aggregate balances by currency from statement (fallback to party.balance)
  const balanceByCurrency = new Map<string, number>();
  let totalDebit = 0;
  let totalCredit = 0;
  for (const m of statementMovements) {
    const curr = m.currency || 'SAR';
    balanceByCurrency.set(curr, Number(m.balance) || 0);
    totalDebit += Number(m.debit_base ?? m.debit ?? 0);
    totalCredit += Number(m.credit_base ?? m.credit ?? 0);
  }
  const primaryBalance =
    balanceByCurrency.get('SAR') ??
    (balanceByCurrency.size > 0 ? Array.from(balanceByCurrency.values())[0] : Number(party.balance) || 0);
  const primaryCurrency =
    balanceByCurrency.has('SAR')
      ? 'SAR'
      : balanceByCurrency.size > 0
        ? Array.from(balanceByCurrency.keys())[0]
        : 'SAR';

  const multiCurrencySummary =
    balanceByCurrency.size > 1
      ? Array.from(balanceByCurrency.entries())
          .map(([curr, bal]) => formatCurrency(bal, curr))
          .join(' | ')
      : undefined;

  const kpis: InspectorKpi[] = [
    {
      label: 'الرصيد الحالي',
      value: formatCurrency(primaryBalance, primaryCurrency),
      subValue: multiCurrencySummary,
      tone: primaryBalance > 0 ? 'rose' : primaryBalance < 0 ? 'emerald' : 'default',
    },
    {
      label: 'إجمالي الحركات (مدين / دائن)',
      value: `${statementMovements.length} حركة`,
      subValue: `مدين: ${formatNumberDisplay(totalDebit)} | دائن: ${formatNumberDisplay(totalCredit)}`,
      tone: 'blue',
    },
    {
      label: 'الفواتير المسجلة',
      value: `${invoices.length} فاتورة`,
      subValue: invoices[0]?.issue_date ? `آخر فاتورة: ${formatDateShort(invoices[0].issue_date)}` : undefined,
      tone: 'indigo',
    },
    {
      label: 'السندات المالية',
      value: `${payments.length} سند`,
      subValue: payments[0]?.payment_date ? `آخر سند: ${formatDateShort(payments[0].payment_date)}` : undefined,
      tone: 'emerald',
    },
  ];

  const fields: InspectorFieldRow[] = [
    { section: 'بيانات الهوية', label: 'الاسم الكامل', value: dash(party.name), copyValue: party.name },
    { section: 'بيانات الهوية', label: 'نوع الحساب', value: partyType === 'supplier' ? 'مورد' : 'عميل' },
    { section: 'بيانات الهوية', label: 'التصنيف', value: dash(party.party_categories?.name || party.category) },
    { section: 'بيانات الهوية', label: 'الحالة', value: translateStatus(party.status || 'active').label },
    { section: 'بيانات التواصل', label: 'رقم الهاتف / الجوال', value: dash(party.phone), copyValue: party.phone || undefined, mono: true },
    { section: 'بيانات التواصل', label: 'البريد الإلكتروني', value: dash(party.email), copyValue: party.email || undefined, mono: true },
    { section: 'بيانات التواصل', label: 'العنوان', value: dash(party.address) },
    { section: 'البيانات المالية والضريبية', label: 'الرقم الضريبي', value: dash(party.tax_number), copyValue: party.tax_number || undefined, mono: true },
    {
      section: 'البيانات المالية والضريبية',
      label: 'الحد الائتماني',
      value: party.credit_limit ? formatCurrency(Number(party.credit_limit), 'SAR') : 'غير محدد',
      mono: true,
    },
    {
      section: 'البيانات المالية والضريبية',
      label: 'الرصيد الحالي',
      value: formatCurrency(primaryBalance, primaryCurrency),
      mono: true,
      tone: primaryBalance > 0 ? 'rose' : primaryBalance < 0 ? 'emerald' : 'default',
    },
    { section: 'معلومات السجل', label: 'تاريخ التسجيل', value: formatDateShort(party.created_at), mono: true },
    ...(party.notes ? [{ section: 'معلومات السجل', label: 'ملاحظات', value: String(party.notes) }] : []),
  ];

  // Sheet 1: Statement Movements
  const statementRows: InspectorHistoryRow[] = [...statementMovements].reverse().slice(0, 120).map(m => {
    const refType = String(m.reference_type || m.type || '').toLowerCase();
    let drillTarget: InspectorTarget | undefined;
    if (m.reference_id) {
      if (refType.includes('invoice') || refType === 'sale' || refType === 'purchase' || refType.includes('return')) {
        drillTarget = { type: 'invoice', id: m.reference_id, label: m.ref || 'فاتورة' };
      } else if (refType.includes('payment') || refType.includes('bond') || refType === 'receipt' || refType === 'disbursement') {
        drillTarget = { type: 'bond', id: m.reference_id, label: m.ref || 'سند' };
      }
    }
    const curr = m.currency || 'SAR';
    return {
      id: m.id,
      tone: Number(m.debit) > 0 ? 'rose' : Number(m.credit) > 0 ? 'emerald' : 'default',
      target: drillTarget,
      cells: {
        date: formatDateShort(m.date),
        ref: dash(m.ref),
        type: dash(m.operation_type || m.type),
        desc: dash(m.desc),
        debit: Number(m.debit) > 0 ? formatCurrency(Number(m.debit), curr) : '—',
        credit: Number(m.credit) > 0 ? formatCurrency(Number(m.credit), curr) : '—',
        balance: formatCurrency(Number(m.balance) || 0, curr),
      },
    };
  });

  // Sheet 2: Invoices
  const invoiceRows: InspectorHistoryRow[] = invoices.map((inv: any) => {
    const curr = inv.currency_code || 'SAR';
    const docAmt =
      inv.total_document_amount != null && Number(inv.total_document_amount) > 0
        ? Number(inv.total_document_amount)
        : Number(inv.total_amount) || 0;
    return {
      id: inv.id,
      tone: inv.type?.includes('return') ? 'amber' : 'blue',
      target: { type: 'invoice', id: inv.id, label: `#${inv.invoice_number}`, subType: inv.type },
      cells: {
        date: formatDateShort(inv.issue_date),
        number: `#${inv.invoice_number || '—'}`,
        type: translateInvoiceType(inv.type),
        method: translatePaymentMethod(inv.payment_method),
        status: translateStatus(inv.status).label,
        total: formatCurrency(docAmt, curr),
      },
    };
  });

  // Sheet 3: Bonds / Payments
  const bondRows: InspectorHistoryRow[] = payments.map((b: any) => {
    const curr = b.currency_code || 'SAR';
    return {
      id: b.id,
      tone: b.type === 'receipt' ? 'emerald' : 'rose',
      target: { type: 'bond', id: b.id, label: b.payment_number || 'سند' },
      cells: {
        date: formatDateShort(b.payment_date),
        number: dash(b.payment_number),
        type: translateBondType(b.type),
        method: translatePaymentMethod(b.payment_method),
        amount: formatCurrency(Number(b.amount) || 0, curr),
        notes: dash(b.notes),
      },
    };
  });

  const st = translateStatus(party.status || 'active');
  return {
    type: 'party',
    title: dash(party.name),
    subtitle: `${partyType === 'supplier' ? 'بطاقة مورد وكشف حساب' : 'بطاقة عميل وكشف حساب'}${party.phone ? ` • ${party.phone}` : ''}`,
    code: party.tax_number || undefined,
    badge: st,
    kpis,
    fields,
    sheets: [
      {
        id: 'statement',
        label: 'كشف الحساب والحركات',
        emptyMessage: 'لا توجد حركات مالية مسجلة لهذا الطرف.',
        columns: [
          { key: 'date', label: 'التاريخ', align: 'center', mono: true },
          { key: 'ref', label: 'المرجع', align: 'center', mono: true },
          { key: 'type', label: 'العملية', align: 'center' },
          { key: 'desc', label: 'البيان', align: 'right' },
          { key: 'debit', label: 'مدين', align: 'left', mono: true },
          { key: 'credit', label: 'دائن', align: 'left', mono: true },
          { key: 'balance', label: 'الرصيد', align: 'left', mono: true },
        ],
        rows: statementRows,
      },
      {
        id: 'invoices',
        label: 'الفواتير',
        emptyMessage: 'لا توجد فواتير مسجلة لهذا الطرف.',
        columns: [
          { key: 'date', label: 'التاريخ', align: 'center', mono: true },
          { key: 'number', label: 'رقم الفاتورة', align: 'center', mono: true },
          { key: 'type', label: 'النوع', align: 'center' },
          { key: 'method', label: 'الدفع', align: 'center' },
          { key: 'status', label: 'الحالة', align: 'center' },
          { key: 'total', label: 'الإجمالي', align: 'left', mono: true },
        ],
        rows: invoiceRows,
      },
      {
        id: 'bonds',
        label: 'السندات المالية',
        emptyMessage: 'لا توجد سندات قبض أو صرف لهذا الطرف.',
        columns: [
          { key: 'date', label: 'التاريخ', align: 'center', mono: true },
          { key: 'number', label: 'رقم السند', align: 'center', mono: true },
          { key: 'type', label: 'النوع', align: 'center' },
          { key: 'method', label: 'الطريقة', align: 'center' },
          { key: 'amount', label: 'المبلغ', align: 'left', mono: true },
          { key: 'notes', label: 'البيان', align: 'right' },
        ],
        rows: bondRows,
      },
    ],
  };
}

async function inspectInvoice(id: string): Promise<InspectedEntityData> {
  const [invRes, journalsRes] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        `
        *,
        party:party_id(id, name, phone, type),
        invoice_items(
          id,
          product_id,
          description,
          quantity,
          unit_price,
          discount_amount,
          tax_amount,
          total,
          product:products!fk_invoice_items_company_product(id, name_ar, sku, part_number, brand)
        )
      `
      )
      .eq('id', id)
      .single(),
    supabase
      .from('journal_entries')
      .select(
        `
        id,
        entry_number,
        entry_date,
        description,
        journal_entry_lines(
          id,
          debit_amount,
          credit_amount,
          description,
          account_id,
          account:accounts(id, name_ar, code)
        )
      `
      )
      .eq('reference_id', id)
      .is('deleted_at', null)
      .limit(10),
  ]);

  if (invRes.error || !invRes.data) {
    throw new Error('تعذر تحميل بيانات الفاتورة المطلوبة.');
  }

  const inv = invRes.data as any;
  const curr = inv.currency_code || 'SAR';
  const items: any[] = Array.isArray(inv.invoice_items) ? inv.invoice_items : [];
  const docTotal =
    inv.total_document_amount != null && Number(inv.total_document_amount) > 0
      ? Number(inv.total_document_amount)
      : Number(inv.total_amount) || 0;
  const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  const kpis: InspectorKpi[] = [
    {
      label: 'إجمالي الفاتورة',
      value: formatCurrency(docTotal, curr),
      subValue: curr !== 'SAR' ? `الأساسي: ${formatCurrency(Number(inv.total_amount) || 0, 'SAR')}` : undefined,
      tone: 'emerald',
    },
    {
      label: 'عدد الأصناف / القطع',
      value: `${items.length} صنف`,
      subValue: `إجمالي الكمية: ${formatNumberDisplay(totalQty)}`,
      tone: 'blue',
    },
    {
      label: 'طريقة الدفع',
      value: translatePaymentMethod(inv.payment_method),
      subValue: inv.due_date ? `الاستحقاق: ${formatDateShort(inv.due_date)}` : undefined,
      tone: inv.payment_method === 'credit' ? 'amber' : 'emerald',
    },
    {
      label: 'تاريخ الإصدار',
      value: formatDateShort(inv.issue_date),
      subValue: `العملة: ${curr}`,
      tone: 'default',
    },
  ];

  const fields: InspectorFieldRow[] = [
    { section: 'بيانات المستند', label: 'رقم الفاتورة', value: `#${dash(inv.invoice_number)}`, copyValue: inv.invoice_number, mono: true, tone: 'blue' },
    { section: 'بيانات المستند', label: 'نوع الفاتورة', value: translateInvoiceType(inv.type) },
    { section: 'بيانات المستند', label: 'الحالة', value: translateStatus(inv.status).label },
    {
      section: 'بيانات المستند',
      label: inv.type?.startsWith('purchase') ? 'المورد' : 'العميل',
      value: dash(inv.party?.name || (inv.type?.startsWith('purchase') ? 'مورد عام' : 'عميل نقدي')),
      target: inv.party?.id
        ? { type: 'party', id: inv.party.id, label: inv.party.name, subType: inv.party.type }
        : undefined,
    },
    { section: 'بيانات المستند', label: 'تاريخ الإصدار', value: formatDateShort(inv.issue_date), mono: true },
    { section: 'بيانات المستند', label: 'تاريخ الاستحقاق', value: formatDateShort(inv.due_date), mono: true },
    { section: 'البيانات المالية', label: 'طريقة الدفع', value: translatePaymentMethod(inv.payment_method) },
    { section: 'البيانات المالية', label: 'العملة وسعر الصرف', value: `${curr} (سعر الصرف: ${inv.exchange_rate ?? 1})`, mono: true },
    { section: 'البيانات المالية', label: 'الخصم', value: formatCurrency(Number(inv.discount_amount) || 0, curr), mono: true },
    { section: 'البيانات المالية', label: 'الضريبة', value: formatCurrency(Number(inv.tax_amount) || 0, curr), mono: true },
    { section: 'البيانات المالية', label: 'الإجمالي النهائي', value: formatCurrency(docTotal, curr), mono: true, tone: 'emerald' },
    ...(inv.notes ? [{ section: 'ملاحظات', label: 'ملاحظات الفاتورة', value: String(inv.notes) }] : []),
  ];

  const itemRows: InspectorHistoryRow[] = items.map((it: any) => ({
    id: it.id,
    target: it.product_id
      ? { type: 'product', id: it.product_id, label: it.product?.name_ar || it.description || 'صنف' }
      : undefined,
    cells: {
      name: dash(it.product?.name_ar || it.description),
      sku: dash(it.product?.part_number || it.product?.sku),
      brand: dash(it.product?.brand),
      qty: formatNumberDisplay(Number(it.quantity) || 0),
      unitPrice: formatCurrency(Number(it.unit_price) || 0, curr),
      discount: Number(it.discount_amount) > 0 ? formatCurrency(Number(it.discount_amount), curr) : '—',
      total: formatCurrency(Number(it.total) || 0, curr),
    },
  }));

  const journalEntries: any[] = Array.isArray(journalsRes.data) ? journalsRes.data : [];
  const journalRows: InspectorHistoryRow[] = journalEntries.flatMap((je: any) =>
    (Array.isArray(je.journal_entry_lines) ? je.journal_entry_lines : []).map((ln: any) => ({
      id: ln.id,
      tone: Number(ln.debit_amount) > 0 ? 'blue' : 'emerald',
      target: ln.account?.id
        ? { type: 'account', id: ln.account.id, label: ln.account.name_ar }
        : undefined,
      cells: {
        entry: `#${je.entry_number || '—'}`,
        date: formatDateShort(je.entry_date),
        code: dash(ln.account?.code),
        account: dash(ln.account?.name_ar),
        debit: Number(ln.debit_amount) > 0 ? formatCurrency(Number(ln.debit_amount), 'SAR') : '—',
        credit: Number(ln.credit_amount) > 0 ? formatCurrency(Number(ln.credit_amount), 'SAR') : '—',
        desc: dash(ln.description || je.description),
      },
    }))
  );

  return {
    type: 'invoice',
    title: `${translateInvoiceType(inv.type)} #${dash(inv.invoice_number)}`,
    subtitle: `${dash(inv.party?.name || 'عميل نقدي')} • ${formatDateShort(inv.issue_date)}`,
    code: inv.invoice_number || undefined,
    badge: translateStatus(inv.status),
    kpis,
    fields,
    sheets: [
      {
        id: 'items',
        label: 'أصناف الفاتورة',
        emptyMessage: 'لا توجد أصناف مسجلة في هذه الفاتورة.',
        columns: [
          { key: 'name', label: 'الصنف', align: 'right' },
          { key: 'sku', label: 'رقم القطعة / SKU', align: 'center', mono: true },
          { key: 'brand', label: 'الماركة', align: 'center' },
          { key: 'qty', label: 'الكمية', align: 'center', mono: true },
          { key: 'unitPrice', label: 'السعر', align: 'left', mono: true },
          { key: 'discount', label: 'الخصم', align: 'left', mono: true },
          { key: 'total', label: 'الإجمالي', align: 'left', mono: true },
        ],
        rows: itemRows,
      },
      {
        id: 'journal',
        label: 'القيود المحاسبية المرتبطة',
        emptyMessage: 'لا توجد قيود يومية مرتبطة بهذه الفاتورة.',
        columns: [
          { key: 'entry', label: 'رقم القيد', align: 'center', mono: true },
          { key: 'date', label: 'التاريخ', align: 'center', mono: true },
          { key: 'code', label: 'رمز الحساب', align: 'center', mono: true },
          { key: 'account', label: 'الحساب المحاسبي', align: 'right' },
          { key: 'debit', label: 'مدين', align: 'left', mono: true },
          { key: 'credit', label: 'دائن', align: 'left', mono: true },
          { key: 'desc', label: 'البيان', align: 'right' },
        ],
        rows: journalRows,
      },
    ],
  };
}

async function inspectBond(id: string): Promise<InspectedEntityData> {
  const [bondRes, journalsRes] = await Promise.all([
    supabase
      .from('payments')
      .select(
        `
        *,
        party:parties!fk_payments_company_party(id, name, phone, type),
        account:accounts!fk_payments_company_account(id, name_ar, code)
      `
      )
      .eq('id', id)
      .single(),
    supabase
      .from('journal_entries')
      .select(
        `
        id,
        entry_number,
        entry_date,
        description,
        journal_entry_lines(
          id,
          debit_amount,
          credit_amount,
          description,
          account_id,
          account:accounts(id, name_ar, code)
        )
      `
      )
      .eq('reference_id', id)
      .is('deleted_at', null)
      .limit(10),
  ]);

  if (bondRes.error || !bondRes.data) {
    throw new Error('تعذر تحميل بيانات السند المطلوب.');
  }

  const b = bondRes.data as any;
  const curr = b.currency_code || 'SAR';
  const amount = Number(b.amount) || 0;

  const kpis: InspectorKpi[] = [
    {
      label: 'مبلغ السند',
      value: formatCurrency(amount, curr),
      tone: b.type === 'receipt' ? 'emerald' : 'rose',
    },
    {
      label: 'نوع السند',
      value: translateBondType(b.type),
      tone: 'blue',
    },
    {
      label: 'طريقة الدفع',
      value: translatePaymentMethod(b.payment_method),
      tone: 'default',
    },
    {
      label: 'التاريخ',
      value: formatDateShort(b.payment_date),
      tone: 'default',
    },
  ];

  const fields: InspectorFieldRow[] = [
    { section: 'بيانات السند', label: 'رقم السند', value: dash(b.payment_number), copyValue: b.payment_number, mono: true, tone: 'blue' },
    { section: 'بيانات السند', label: 'نوع السند', value: translateBondType(b.type) },
    { section: 'بيانات السند', label: 'تاريخ السند', value: formatDateShort(b.payment_date), mono: true },
    { section: 'بيانات السند', label: 'الحالة', value: translateStatus(b.status || 'posted').label },
    {
      section: 'الأطراف والحسابات',
      label: 'الطرف / الجهة',
      value: dash(b.party?.name),
      target: b.party?.id
        ? { type: 'party', id: b.party.id, label: b.party.name, subType: b.party.type }
        : undefined,
    },
    {
      section: 'الأطراف والحسابات',
      label: 'الصندوق / الحساب',
      value: b.account ? `${b.account.code ? `[${b.account.code}] ` : ''}${b.account.name_ar}` : '—',
      target: b.account?.id ? { type: 'account', id: b.account.id, label: b.account.name_ar } : undefined,
    },
    { section: 'القيمة المالية', label: 'المبلغ', value: formatCurrency(amount, curr), mono: true, tone: b.type === 'receipt' ? 'emerald' : 'rose' },
    { section: 'القيمة المالية', label: 'العملة وسعر الصرف', value: `${curr} (${b.exchange_rate ?? 1})`, mono: true },
    { section: 'القيمة المالية', label: 'طريقة الدفع', value: translatePaymentMethod(b.payment_method) },
    ...(b.notes ? [{ section: 'البيان', label: 'البيان / الملاحظات', value: String(b.notes) }] : []),
  ];

  const journalEntries: any[] = Array.isArray(journalsRes.data) ? journalsRes.data : [];
  const journalRows: InspectorHistoryRow[] = journalEntries.flatMap((je: any) =>
    (Array.isArray(je.journal_entry_lines) ? je.journal_entry_lines : []).map((ln: any) => ({
      id: ln.id,
      tone: Number(ln.debit_amount) > 0 ? 'blue' : 'emerald',
      target: ln.account?.id
        ? { type: 'account', id: ln.account.id, label: ln.account.name_ar }
        : undefined,
      cells: {
        entry: `#${je.entry_number || '—'}`,
        date: formatDateShort(je.entry_date),
        code: dash(ln.account?.code),
        account: dash(ln.account?.name_ar),
        debit: Number(ln.debit_amount) > 0 ? formatCurrency(Number(ln.debit_amount), 'SAR') : '—',
        credit: Number(ln.credit_amount) > 0 ? formatCurrency(Number(ln.credit_amount), 'SAR') : '—',
        desc: dash(ln.description || je.description),
      },
    }))
  );

  return {
    type: 'bond',
    title: `${translateBondType(b.type)} #${dash(b.payment_number)}`,
    subtitle: `${dash(b.party?.name || b.account?.name_ar)} • ${formatDateShort(b.payment_date)}`,
    code: b.payment_number || undefined,
    badge: translateStatus(b.status || 'posted'),
    kpis,
    fields,
    sheets: [
      {
        id: 'journal',
        label: 'القيد المحاسبي المرتبط',
        emptyMessage: 'لا توجد قيود يومية مرتبطة بهذا السند.',
        columns: [
          { key: 'entry', label: 'رقم القيد', align: 'center', mono: true },
          { key: 'date', label: 'التاريخ', align: 'center', mono: true },
          { key: 'code', label: 'رمز الحساب', align: 'center', mono: true },
          { key: 'account', label: 'الحساب المحاسبي', align: 'right' },
          { key: 'debit', label: 'مدين', align: 'left', mono: true },
          { key: 'credit', label: 'دائن', align: 'left', mono: true },
          { key: 'desc', label: 'البيان', align: 'right' },
        ],
        rows: journalRows,
      },
    ],
  };
}

async function inspectAccount(id: string): Promise<InspectedEntityData> {
  const [accRes, linesRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('id', id).single(),
    supabase
      .from('journal_entry_lines')
      .select(
        `
        id,
        debit_amount,
        credit_amount,
        description,
        journal_entry:journal_entries(id, entry_number, entry_date, description, reference_id, reference_type)
      `
      )
      .eq('account_id', id)
      .order('id', { ascending: false })
      .limit(80),
  ]);

  if (accRes.error || !accRes.data) {
    throw new Error('تعذر تحميل بيانات الحساب المحاسبي.');
  }

  const acc = accRes.data as any;
  const lines: any[] = Array.isArray(linesRes.data) ? linesRes.data : [];
  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit_amount) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit_amount) || 0), 0);
  const curr = acc.currency_code || 'SAR';

  const kpis: InspectorKpi[] = [
    {
      label: 'رصيد الحساب',
      value: formatCurrency(Number(acc.balance) || totalDebit - totalCredit, curr),
      tone: 'blue',
    },
    {
      label: 'إجمالي المدين (آخر الحركات)',
      value: formatCurrency(totalDebit, curr),
      tone: 'emerald',
    },
    {
      label: 'إجمالي الدائن (آخر الحركات)',
      value: formatCurrency(totalCredit, curr),
      tone: 'rose',
    },
    {
      label: 'عدد القيود',
      value: `${lines.length} قيد`,
      tone: 'default',
    },
  ];

  const fields: InspectorFieldRow[] = [
    { section: 'بطاقة الحساب', label: 'رمز الحساب', value: dash(acc.code), copyValue: acc.code, mono: true, tone: 'indigo' },
    { section: 'بطاقة الحساب', label: 'اسم الحساب (عربي)', value: dash(acc.name_ar), copyValue: acc.name_ar },
    { section: 'بطاقة الحساب', label: 'اسم الحساب (إنجليزي)', value: dash(acc.name_en) },
    { section: 'بطاقة الحساب', label: 'تصنيف الحساب', value: dash(acc.type) },
    { section: 'بطاقة الحساب', label: 'العملة', value: curr, mono: true },
    { section: 'بطاقة الحساب', label: 'الحالة', value: acc.is_active === false ? 'موقوف' : 'نشط' },
    ...(acc.description ? [{ section: 'بطاقة الحساب', label: 'الوصف', value: String(acc.description) }] : []),
  ];

  const movementRows: InspectorHistoryRow[] = lines.map((ln: any) => {
    const je = ln.journal_entry;
    return {
      id: ln.id,
      tone: Number(ln.debit_amount) > 0 ? 'blue' : 'emerald',
      cells: {
        date: formatDateShort(je?.entry_date),
        entry: `#${je?.entry_number || '—'}`,
        desc: dash(ln.description || je?.description),
        debit: Number(ln.debit_amount) > 0 ? formatCurrency(Number(ln.debit_amount), curr) : '—',
        credit: Number(ln.credit_amount) > 0 ? formatCurrency(Number(ln.credit_amount), curr) : '—',
      },
    };
  });

  return {
    type: 'account',
    title: dash(acc.name_ar || acc.name_en),
    subtitle: `حساب محاسبي • الرمز: ${dash(acc.code)}`,
    code: acc.code || undefined,
    badge: { label: acc.is_active === false ? 'موقوف' : 'نشط', tone: acc.is_active === false ? 'rose' : 'emerald' },
    kpis,
    fields,
    sheets: [
      {
        id: 'ledger',
        label: 'حركات دفتر الأستاذ',
        emptyMessage: 'لا توجد قيود مسجلة على هذا الحساب.',
        columns: [
          { key: 'date', label: 'التاريخ', align: 'center', mono: true },
          { key: 'entry', label: 'رقم القيد', align: 'center', mono: true },
          { key: 'desc', label: 'البيان', align: 'right' },
          { key: 'debit', label: 'مدين', align: 'left', mono: true },
          { key: 'credit', label: 'دائن', align: 'left', mono: true },
        ],
        rows: movementRows,
      },
    ],
  };
}

export async function fetchInspectedEntity(
  target: InspectorTarget,
  ctx: InspectContext
): Promise<InspectedEntityData> {
  switch (target.type) {
    case 'product':
      return inspectProduct(target.id, ctx);
    case 'party':
      return inspectParty(target.id, ctx, target.subType);
    case 'invoice':
      return inspectInvoice(target.id);
    case 'bond':
      return inspectBond(target.id);
    case 'account':
      return inspectAccount(target.id);
  }
}
