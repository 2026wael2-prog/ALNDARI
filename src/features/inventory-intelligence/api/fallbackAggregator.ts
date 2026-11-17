import type { BranchInfo, InventoryIntelligenceSnapshot } from '../types';

export interface FallbackRawInputs {
  branchesRaw: Array<{ id: string; name: string; code: string; is_main: boolean }>;
  warehousesRaw: Array<{ id: string; branch_id: string | null; name_ar: string; is_primary: boolean }>;
  productsRaw: Array<Record<string, unknown>>;
  stockRows: Array<Record<string, unknown>>;
  salesRows: Array<Record<string, unknown>>;
  suppliersRaw: Array<{ id: string; name: string }>;
  openPoRaw: Array<{
    product_id: string | null;
    quantity: number;
    received_quantity: number | null;
    po: { expected_delivery_date: string | null } | null;
  }>;
  crossRefsRaw: InventoryIntelligenceSnapshot['cross_references'];
}

export function aggregateFallbackSnapshot(inputs: FallbackRawInputs): InventoryIntelligenceSnapshot {
  const whBranchMap = new Map(inputs.warehousesRaw.map(w => [w.id, w.branch_id]));

  const branches: BranchInfo[] = inputs.branchesRaw.map(b => ({
    ...b,
    warehouses: inputs.warehousesRaw
      .filter(w => w.branch_id === b.id)
      .map(w => ({ id: w.id, name_ar: w.name_ar, is_primary: w.is_primary })),
  }));

  const stockByProd = new Map<
    string,
    Array<{ warehouse_id: string; branch_id: string | null; quantity: number; weighted_avg_cost: number }>
  >();

  for (const sr of inputs.stockRows) {
    const pid = sr.product_id as string;
    const wid = sr.warehouse_id as string;
    const list = stockByProd.get(pid) ?? [];
    list.push({
      warehouse_id: wid,
      branch_id: whBranchMap.get(wid) ?? null,
      quantity: Number(sr.quantity) || 0,
      weighted_avg_cost: Number(sr.weighted_avg_cost) || 0,
    });
    stockByProd.set(pid, list);
  }

  const mappedProducts = inputs.productsRaw.map(p => ({
    id: p.id as string,
    name_ar: p.name_ar as string,
    sku: (p.sku as string | null) ?? null,
    part_number: (p.part_number as string | null) ?? null,
    alternative_numbers: (p.alternative_numbers as string | null) ?? null,
    brand: (p.brand as string | null) ?? null,
    item_type: (p.item_type as string | null) ?? null,
    min_stock_level: Number(p.min_stock_level) || 0,
    cost_price: Number(p.cost_price) || 0,
    purchase_price: Number(p.purchase_price) || 0,
    sale_price: Number(p.sale_price) || 0,
    category_id: (p.category_id as string | null) ?? null,
    category_name: null,
    stock_by_warehouse: stockByProd.get(p.id as string) ?? [],
  }));

  const now = Date.now();
  const salesAgg = new Map<
    string,
    {
      product_id: string;
      branch_id: string | null;
      net_qty_365: number;
      net_qty_180: number;
      net_qty_90: number;
      net_qty_30: number;
      net_qty_7: number;
      net_revenue_365: number;
      net_cogs_365: number;
      sale_tx_count: number;
      demand_days_count: number;
      returned_qty: number;
      last_sale_date: string | null;
      first_sale_date: string | null;
      txIds: Set<string>;
      days: Set<string>;
    }
  >();
  const monthlyAgg = new Map<string, number>();
  const supplierNameMap = new Map(inputs.suppliersRaw.map(s => [s.id, s.name]));
  const supplierAgg = new Map<
    string,
    {
      product_id: string;
      supplier_id: string;
      supplier_name: string;
      txIds: Set<string>;
      total_qty_supplied: number;
      priceSum: number;
      priceCount: number;
      last_unit_price: number;
      last_qty: number;
      last_purchase_date: string;
    }
  >();

  for (const item of inputs.salesRows) {
    const pid = item.product_id as string | null;
    const inv = item.invoice as {
      id: string;
      branch_id: string | null;
      type: string;
      issue_date: string;
      party_id?: string | null;
    } | null;
    if (!pid || !inv) continue;

    if (inv.type === 'purchase' && inv.party_id) {
      const sKey = `${pid}::${inv.party_id}`;
      const qtyVal = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      let sRec = supplierAgg.get(sKey);
      if (!sRec) {
        sRec = {
          product_id: pid,
          supplier_id: inv.party_id,
          supplier_name: supplierNameMap.get(inv.party_id) ?? 'مورد غير محدد',
          txIds: new Set<string>(),
          total_qty_supplied: 0,
          priceSum: 0,
          priceCount: 0,
          last_unit_price: unitPrice,
          last_qty: qtyVal,
          last_purchase_date: inv.issue_date,
        };
        supplierAgg.set(sKey, sRec);
      }
      sRec.txIds.add(inv.id);
      sRec.total_qty_supplied += qtyVal;
      if (unitPrice > 0) {
        sRec.priceSum += unitPrice;
        sRec.priceCount += 1;
      }
      if (inv.issue_date >= sRec.last_purchase_date) {
        sRec.last_purchase_date = inv.issue_date;
        sRec.last_unit_price = unitPrice;
        sRec.last_qty = qtyVal;
      }
      continue;
    }

    if (!['sale', 'sale_return', 'sales_return'].includes(inv.type)) continue;

    const sign = inv.type === 'sale' ? 1 : -1;
    const qty = (Number(item.quantity) || 0) * sign;
    const rev = (Number(item.total) || 0) * sign;
    const cogs = (Number(item.quantity) || 0) * (Number(item.cost_price) || 0) * sign;
    const daysAgo = (now - new Date(inv.issue_date).getTime()) / 86400000;

    const key = `${pid}::${inv.branch_id ?? 'none'}`;
    let rec = salesAgg.get(key);
    if (!rec) {
      rec = {
        product_id: pid,
        branch_id: inv.branch_id,
        net_qty_365: 0,
        net_qty_180: 0,
        net_qty_90: 0,
        net_qty_30: 0,
        net_qty_7: 0,
        net_revenue_365: 0,
        net_cogs_365: 0,
        sale_tx_count: 0,
        demand_days_count: 0,
        returned_qty: 0,
        last_sale_date: null,
        first_sale_date: null,
        txIds: new Set<string>(),
        days: new Set<string>(),
      };
      salesAgg.set(key, rec);
    }

    rec.net_qty_365 += qty;
    if (daysAgo <= 180) rec.net_qty_180 += qty;
    if (daysAgo <= 90) rec.net_qty_90 += qty;
    if (daysAgo <= 30) rec.net_qty_30 += qty;
    if (daysAgo <= 7) rec.net_qty_7 += qty;
    rec.net_revenue_365 += rev;
    rec.net_cogs_365 += cogs;
    if (inv.type === 'sale') {
      rec.txIds.add(inv.id);
      rec.days.add(inv.issue_date);
      if (!rec.last_sale_date || inv.issue_date > rec.last_sale_date) rec.last_sale_date = inv.issue_date;
      if (!rec.first_sale_date || inv.issue_date < rec.first_sale_date) rec.first_sale_date = inv.issue_date;
    } else {
      rec.returned_qty += Number(item.quantity) || 0;
    }

    const monthKey = inv.issue_date.slice(0, 7);
    const mKey = `${pid}::${inv.branch_id ?? 'none'}::${monthKey}`;
    monthlyAgg.set(mKey, (monthlyAgg.get(mKey) ?? 0) + qty);
  }

  const sales_history = Array.from(salesAgg.values()).map(({ txIds, days, ...rest }) => ({
    ...rest,
    sale_tx_count: txIds.size,
    demand_days_count: days.size,
  }));

  const monthly_sales = Array.from(monthlyAgg.entries()).map(([k, net_qty]) => {
    const [product_id, branchRaw, month_key] = k.split('::');
    return {
      product_id,
      branch_id: branchRaw === 'none' ? null : branchRaw,
      month_key,
      net_qty,
    };
  });

  const supplier_history = Array.from(supplierAgg.values()).map(s => ({
    product_id: s.product_id,
    supplier_id: s.supplier_id,
    supplier_name: s.supplier_name,
    purchase_tx_count: s.txIds.size,
    total_qty_supplied: s.total_qty_supplied,
    avg_unit_price: s.priceCount > 0 ? s.priceSum / s.priceCount : s.last_unit_price,
    last_unit_price: s.last_unit_price,
    last_qty: s.last_qty,
    last_purchase_date: s.last_purchase_date,
  }));

  const poAgg = new Map<string, { incoming_qty: number; earliest_eta: string | null }>();
  for (const row of inputs.openPoRaw) {
    if (!row.product_id) continue;
    const rem = Math.max(0, (Number(row.quantity) || 0) - (Number(row.received_quantity) || 0));
    if (rem <= 0) continue;
    const existing = poAgg.get(row.product_id);
    const eta = row.po?.expected_delivery_date ?? null;
    if (!existing) {
      poAgg.set(row.product_id, { incoming_qty: rem, earliest_eta: eta });
    } else {
      existing.incoming_qty += rem;
      if (eta && (!existing.earliest_eta || eta < existing.earliest_eta)) {
        existing.earliest_eta = eta;
      }
    }
  }
  const open_pos = Array.from(poAgg.entries()).map(([product_id, v]) => ({
    product_id,
    incoming_qty: v.incoming_qty,
    earliest_eta: v.earliest_eta,
  }));

  return {
    branches,
    products: mappedProducts,
    sales_history,
    monthly_sales,
    supplier_history,
    open_pos,
    cross_references: inputs.crossRefsRaw,
    generated_at: new Date().toISOString(),
  };
}
