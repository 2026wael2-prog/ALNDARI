import type { Product } from '../inventory/types';

export type InspectableEntityType = 'product' | 'party' | 'invoice' | 'bond' | 'account';

export interface InspectorTarget {
  type: InspectableEntityType;
  id: string;
  label?: string | undefined;
  subType?: string | undefined;
}

export type InspectorTone = 'default' | 'emerald' | 'rose' | 'amber' | 'blue' | 'indigo';

export interface InspectorKpi {
  label: string;
  value: string;
  subValue?: string | undefined;
  tone?: InspectorTone | undefined;
}

export interface InspectorFieldRow {
  section: string;
  label: string;
  value: string;
  copyValue?: string | undefined;
  mono?: boolean | undefined;
  tone?: InspectorTone | undefined;
  target?: InspectorTarget | undefined;
}

export interface InspectorTableColumn {
  key: string;
  label: string;
  align?: 'right' | 'center' | 'left' | undefined;
  mono?: boolean | undefined;
  width?: string | undefined;
}

export interface InspectorRowReturnAction {
  returnType: 'sale' | 'purchase';
  invoiceId: string;
  productId?: string | undefined;
  partyId?: string | undefined;
  partyName?: string | undefined;
}

export interface InspectorHistoryRow {
  id: string;
  cells: Record<string, string>;
  tone?: InspectorTone | undefined;
  target?: InspectorTarget | undefined;
  returnAction?: InspectorRowReturnAction | undefined;
}

export interface InspectorTabSheet {
  id: string;
  label: string;
  columns: InspectorTableColumn[];
  rows: InspectorHistoryRow[];
  emptyMessage?: string | undefined;
}

export interface InspectedEntityData {
  type: InspectableEntityType;
  title: string;
  subtitle: string;
  code?: string | undefined;
  badge?: {
    label: string;
    tone: InspectorTone;
  } | undefined;
  returnContext?: {
    returnType: 'sale' | 'purchase';
    invoiceId?: string | undefined;
    productId?: string | undefined;
    partyId?: string | undefined;
    partyName?: string | undefined;
  } | undefined;
  kpis: InspectorKpi[];
  fields: InspectorFieldRow[];
  sheets: InspectorTabSheet[];
  /** بيانات المنتج الخام لتمكين التعديل المباشر من نافذة الاستعلام */
  product?: Product | undefined;
}
