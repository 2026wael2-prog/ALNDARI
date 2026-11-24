/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../../../lib/supabaseClient';
import { formatCurrency, formatNumberDisplay } from '../../../core/utils';
import { productMovementsService } from '../../inventory/services/productMovementsService';
import type { Product } from '../../inventory/types';
import type {
  InspectedEntityData,
  InspectorFieldRow,
  InspectorHistoryRow,
  InspectorKpi,
  InspectorTabSheet,
} from '../types';
import {
  dash,
  formatDateShort,
  translateInvoiceType,
  translateMovementType,
  translateStatus,
  type InspectContext,
} from './shared';

export async function inspectProduct(id: string, ctx: InspectContext): Promise<InspectedEntityData> {
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

  const invoiceHistoryRows: InspectorHistoryRow[] = invoiceLines.map((line: any) => {
    const inv = line.invoice;
    const isSale = inv.type === 'sale' || inv.type === 'sale_return';
    const canReturnLine = inv.type === 'sale' || inv.type === 'purchase';
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
      ...(canReturnLine
        ? {
            returnAction: {
              returnType: inv.type === 'purchase' ? ('purchase' as const) : ('sale' as const),
              invoiceId: inv.id,
              productId: p.id,
              partyId: inv.party?.id,
              partyName: inv.party?.name,
            },
          }
        : {}),
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
  const latestReturnableLine = invoiceLines.find(
    (line: any) => line.invoice?.type === 'sale' || line.invoice?.type === 'purchase'
  );
  const editableProduct: Product = {
    id: String(p.id),
    company_id: String(p.company_id || ctx.companyId || ''),
    name: String(p.name_ar || p.name || ''),
    name_ar: String(p.name_ar || p.name || ''),
    name_en: p.name_en ?? null,
    sku: String(p.sku || ''),
    part_number: p.part_number ?? null,
    alternative_numbers: Array.isArray(p.alternative_numbers)
      ? p.alternative_numbers.filter(Boolean).join(', ')
      : (p.alternative_numbers ?? null),
    brand: p.brand ?? null,
    category: p.category?.name ?? p.category_id ?? null,
    category_id: p.category_id ?? p.category?.id ?? null,
    item_type: p.item_type === 'service' ? 'service' : 'stock',
    size: p.size ?? null,
    specifications: p.description ?? p.specifications ?? null,
    cost_price: purchasePrice,
    purchase_price: purchasePrice,
    sale_price: salePrice,
    selling_price: salePrice,
    stock_quantity: totalQty,
    min_stock_level: minLevel,
    unit: String(p.unit || 'piece'),
    barcode: p.barcode ?? null,
    image_url: p.image_url ?? null,
    is_core: Boolean(p.is_core),
    ...(p.location ? { location: String(p.location) } : {}),
    created_at: String(p.created_at || ''),
    ...(p.updated_at ? { updated_at: String(p.updated_at) } : {}),
  };

  return {
    type: 'product',
    title: dash(p.name_ar || p.name),
    subtitle:
      [p.brand, p.category?.name, p.part_number ? `رقم القطعة: ${p.part_number}` : null]
        .filter(Boolean)
        .join(' • ') || 'بطاقة منتج تفصيلية',
    code: p.sku || p.part_number || undefined,
    badge: {
      label: totalQty > 0 ? st.label : 'نفد المخزون',
      tone: totalQty > 0 ? st.tone : 'rose',
    },
    returnContext: {
      returnType: latestReturnableLine?.invoice?.type === 'purchase' ? 'purchase' : 'sale',
      ...(latestReturnableLine?.invoice?.id ? { invoiceId: latestReturnableLine.invoice.id } : {}),
      productId: p.id,
      ...(latestReturnableLine?.invoice?.party?.id
        ? { partyId: latestReturnableLine.invoice.party.id }
        : {}),
      ...(latestReturnableLine?.invoice?.party?.name
        ? { partyName: latestReturnableLine.invoice.party.name }
        : {}),
    },
    kpis,
    fields,
    sheets,
    product: editableProduct,
  };
}
