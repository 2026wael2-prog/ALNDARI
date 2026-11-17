import type {
  BranchInfo,
  InventoryIntelligenceSnapshot,
  ProductFitmentRow,
  RawBranchSalesRow,
  RawProductCustomerRow,
  RawStockMovementRow,
  RawSupplierConstraintRow,
  RawSupplierHistoryRow,
} from '../../types';

export interface SnapshotIndexes {
  salesMap: Map<string, RawBranchSalesRow>;
  fitmentMap: Map<string, ProductFitmentRow[]>;
  pendingInMap: Map<string, number>;
  pendingOutMap: Map<string, number>;
  incomingMap: Map<string, number>;
  supplierMap: Map<string, RawSupplierHistoryRow[]>;
  customerMap: Map<string, RawProductCustomerRow[]>;
  movementMap: Map<string, RawStockMovementRow>;
  constraintMap: Map<string, RawSupplierConstraintRow[]>;
}

export function buildSnapshotIndexes(
  snapshot: InventoryIntelligenceSnapshot,
  mainBranch: BranchInfo | undefined
): SnapshotIndexes {
  const salesMap = new Map<string, RawBranchSalesRow>();
  for (const row of snapshot.sales_history ?? []) {
    const resolvedBranchId = row.branch_id ?? mainBranch?.id ?? 'none';
    const key = `${row.product_id}::${resolvedBranchId}`;
    const existing = salesMap.get(key);
    if (!existing) {
      salesMap.set(key, { ...row, branch_id: resolvedBranchId === 'none' ? null : resolvedBranchId });
    } else {
      salesMap.set(key, {
        ...existing,
        net_qty_365: (Number(existing.net_qty_365) || 0) + (Number(row.net_qty_365) || 0),
        net_qty_180: (Number(existing.net_qty_180) || 0) + (Number(row.net_qty_180) || 0),
        net_qty_90: (Number(existing.net_qty_90) || 0) + (Number(row.net_qty_90) || 0),
        net_qty_30: (Number(existing.net_qty_30) || 0) + (Number(row.net_qty_30) || 0),
        net_qty_7: (Number(existing.net_qty_7) || 0) + (Number(row.net_qty_7) || 0),
        net_revenue_365: (Number(existing.net_revenue_365) || 0) + (Number(row.net_revenue_365) || 0),
        net_cogs_365: (Number(existing.net_cogs_365) || 0) + (Number(row.net_cogs_365) || 0),
        sale_tx_count: (Number(existing.sale_tx_count) || 0) + (Number(row.sale_tx_count) || 0),
        demand_days_count: Math.max(Number(existing.demand_days_count) || 0, Number(row.demand_days_count) || 0),
        returned_qty: (Number(existing.returned_qty) || 0) + (Number(row.returned_qty) || 0),
      });
    }
  }

  const fitmentMap = new Map<string, ProductFitmentRow[]>();
  for (const f of snapshot.fitments ?? []) {
    const list = fitmentMap.get(f.product_id) ?? [];
    list.push(f);
    fitmentMap.set(f.product_id, list);
  }

  const pendingInMap = new Map<string, number>();
  const pendingOutMap = new Map<string, number>();
  for (const tr of snapshot.pending_transfers ?? []) {
    const qty = Number(tr.quantity) || 0;
    if (tr.to_branch_id) {
      const k = `${tr.product_id}::${tr.to_branch_id}`;
      pendingInMap.set(k, (pendingInMap.get(k) ?? 0) + qty);
    }
    if (tr.from_branch_id) {
      const k = `${tr.product_id}::${tr.from_branch_id}`;
      pendingOutMap.set(k, (pendingOutMap.get(k) ?? 0) + qty);
    }
  }

  const incomingMap = new Map<string, number>();
  for (const po of snapshot.open_pos ?? []) {
    incomingMap.set(po.product_id, (incomingMap.get(po.product_id) ?? 0) + (Number(po.incoming_qty) || 0));
  }

  const supplierMap = new Map<string, RawSupplierHistoryRow[]>();
  for (const sup of snapshot.supplier_history ?? []) {
    const list = supplierMap.get(sup.product_id) ?? [];
    list.push(sup);
    supplierMap.set(sup.product_id, list);
  }

  const customerMap = new Map<string, RawProductCustomerRow[]>();
  for (const cust of snapshot.customer_demand ?? []) {
    const list = customerMap.get(cust.product_id) ?? [];
    list.push(cust);
    customerMap.set(cust.product_id, list);
  }

  const movementMap = new Map<string, RawStockMovementRow>();
  for (const mv of snapshot.stock_movements ?? []) {
    const bId = mv.branch_id ?? mainBranch?.id ?? 'none';
    movementMap.set(`${mv.product_id}::${bId}`, mv);
  }

  const constraintMap = new Map<string, RawSupplierConstraintRow[]>();
  for (const sc of snapshot.supplier_constraints ?? []) {
    const list = constraintMap.get(sc.product_id) ?? [];
    list.push(sc);
    constraintMap.set(sc.product_id, list);
  }

  return {
    salesMap,
    fitmentMap,
    pendingInMap,
    pendingOutMap,
    incomingMap,
    supplierMap,
    customerMap,
    movementMap,
    constraintMap,
  };
}
