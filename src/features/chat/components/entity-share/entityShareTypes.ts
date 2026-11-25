import type { EntityCardMetadata } from '../../types';
import { formatCurrency } from '../../../../core/utils';

export interface BranchItem {
  id: string;
  name: string;
}

export interface ChatProductResult {
  id: string;
  name: string;
  part_number: string;
  brand: string;
  sale_price: number;
  total_stock: number;
  stock: number;
  sku?: string;
}

export interface ChatVinResult {
  id: string;
  vin: string;
  vehicle_id?: string | null;
  decoded?: Record<string, string | undefined>;
}

export interface ChatInvoiceResult {
  id: string;
  invoice_number: string;
  total: number;
  customer_name: string;
  status: string;
  created_at: string;
}

export interface ChatTransferResult {
  id: string;
  transfer_number: string;
  status: string;
  from_warehouse: string;
  to_warehouse: string;
  created_at: string;
}

export type ChatSearchResult =
  | ChatProductResult
  | ChatVinResult
  | ChatInvoiceResult
  | ChatTransferResult;

export type EntityShareTab = 'product' | 'vin' | 'transfer' | 'invoice';

export function buildProductCardMetadata(product: ChatProductResult): EntityCardMetadata {
  return {
    entity_type: 'product',
    entity_id: product.id,
    title: product.part_number || product.name,
    subtitle: product.name,
    details: {
      part_number: product.part_number,
      brand: product.brand,
      price: product.sale_price,
      total_stock: product.total_stock ?? product.stock ?? 0,
    },
  };
}

export function buildVinCardMetadata(vinItem: ChatVinResult): EntityCardMetadata {
  const decoded = vinItem.decoded || {};
  return {
    entity_type: 'vin',
    entity_id: vinItem.id,
    title: vinItem.vin,
    subtitle: `${decoded.make || ''} ${decoded.model || ''} ${decoded.year || ''}`.trim() || 'مركبة',
    details: {
      vin: vinItem.vin,
      make: decoded.make || 'غير محدد',
      model: decoded.model || '',
      year: decoded.year || '',
      engine: decoded.engine || '',
    },
  };
}

export function buildInvoiceCardMetadata(inv: ChatInvoiceResult): EntityCardMetadata {
  return {
    entity_type: 'invoice',
    entity_id: inv.id,
    title: inv.invoice_number,
    subtitle: `فاتورة بمبلغ ${formatCurrency(inv.total)} • ${inv.customer_name}`,
    details: {
      invoice_number: inv.invoice_number,
      total: inv.total,
      customer_name: inv.customer_name,
      status: inv.status,
    },
  };
}

export function buildTransferCardMetadata(tr: ChatTransferResult): EntityCardMetadata {
  return {
    entity_type: 'transfer',
    entity_id: tr.id,
    title: tr.transfer_number,
    subtitle: `مناقلة من ${tr.from_warehouse} إلى ${tr.to_warehouse}`,
    details: {
      transfer_number: tr.transfer_number,
      from_branch: tr.from_warehouse,
      to_branch: tr.to_warehouse,
      status: tr.status,
      created_at: tr.created_at,
    },
  };
}

export function buildNewTransferRequestMetadata(params: {
  product: ChatProductResult;
  fromBranchName: string;
  targetBranchId: string;
  targetBranchName: string;
  quantity: number;
}): EntityCardMetadata {
  const trNumber = `TR-${Math.floor(1000 + Math.random() * 9000)}`;
  return {
    entity_type: 'transfer',
    entity_id: params.product.id,
    title: trNumber,
    subtitle: `طلب مناقلة ${params.product.name}`,
    action_type: 'stock_transfer_approval',
    action_status: 'pending',
    details: {
      transfer_number: trNumber,
      item_name: params.product.name || params.product.part_number,
      part_number: params.product.part_number,
      quantity: params.quantity,
      from_branch: params.fromBranchName,
      to_branch: params.targetBranchName,
      to_branch_id: params.targetBranchId,
    },
  };
}
