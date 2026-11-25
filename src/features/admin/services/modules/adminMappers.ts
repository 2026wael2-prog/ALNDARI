import type { Database } from '../../../../core/database.types';
import type {
  AdminCompany,
  AdminUser,
  CspReportLog,
  SecurityAlertLog,
  SubscriptionPlan,
} from '../../types';

export type SubscriptionPlanRow = Database['public']['Tables']['subscription_plans']['Row'];
export type SecurityAlertRow = Database['public']['Tables']['security_alerts']['Row'];
export type CspReportRow = Database['public']['Tables']['csp_reports']['Row'];
export type AdminCompanyRow =
  Database['public']['Functions']['get_admin_companies_list']['Returns'][number];
export type AdminUserRow =
  Database['public']['Functions']['get_admin_users_list']['Returns'][number];

export const toSubscriptionPlan = (row: SubscriptionPlanRow): SubscriptionPlan => ({
  id: row.id,
  name_ar: row.name_ar,
  name_en: row.name_en ?? '',
  price_monthly: row.price_monthly ?? 0,
  price_yearly: row.price_yearly ?? 0,
  max_users: row.max_users ?? 0,
  max_products: row.max_products ?? 0,
  max_invoices_monthly: row.max_invoices_monthly ?? 0,
  ai_tokens_monthly: row.ai_tokens_monthly ?? 0,
  features: Array.isArray(row.features)
    ? row.features.filter((item): item is string => typeof item === 'string')
    : [],
  is_active: row.is_active ?? true,
  color: row.color ?? '#3B82F6',
  sort_order: row.sort_order ?? 0,
  created_at: row.created_at ?? undefined,
});

export const toAdminCompany = (row: AdminCompanyRow): AdminCompany => ({
  id: row.id,
  name_ar: row.name_ar,
  name_en: row.name_en,
  tax_number: row.tax_number,
  base_currency: row.base_currency,
  owner_id: row.owner_id,
  owner_email: row.owner_email,
  phone: row.phone,
  is_active: row.is_active,
  subscription_status: row.subscription_status as AdminCompany['subscription_status'],
  trial_ends_at: row.trial_ends_at,
  plan_id: row.plan_id,
  plan_name: row.plan_name,
  user_count: row.user_count,
  branch_count: row.branch_count,
  invoice_count: row.invoice_count,
  created_at: row.created_at,
});

export const toAdminUser = (row: AdminUserRow): AdminUser => ({
  user_id: row.user_id,
  email: row.email,
  created_at: row.created_at,
  is_super_admin: row.is_super_admin,
  companies_count: row.companies_count,
  company_names: row.company_names ?? [],
});

export const toHoneypotLog = (row: SecurityAlertRow): SecurityAlertLog => {
  const details: Record<string, unknown> =
    row.details !== null && typeof row.details === 'object' && !Array.isArray(row.details)
      ? row.details
      : {};

  return {
    id: row.id,
    severity: row.severity as SecurityAlertLog['severity'],
    alert_type: row.alert_type,
    source_ip: row.source_ip,
    user_agent: row.user_agent,
    user_id: row.user_id,
    company_id: row.company_id,
    details,
    detected_at: row.detected_at,
    resolved_at: row.resolved_at,
    resolved_by: row.resolved_by,
    resolution_notes: row.resolution_notes,
  };
};

export const toCspReport = (row: CspReportRow): CspReportLog => ({
  id: row.id,
  document_uri: row.document_uri,
  blocked_uri: row.blocked_uri,
  violated_directive: row.violated_directive,
  received_at: row.received_at,
});

/** Shared sequential chunked pagination helper for admin CSV exports. */
export async function collectPaginatedChunks<TRaw, TOut>(
  chunkSize: number,
  fetchPage: (offset: number, limit: number) => Promise<TRaw[]>,
  mapRow: (row: TRaw) => TOut
): Promise<TOut[]> {
  const out: TOut[] = [];
  let offset = 0;
  for (;;) {
    const rows = await fetchPage(offset, chunkSize);
    if (rows.length === 0) break;
    out.push(...rows.map(mapRow));
    if (rows.length < chunkSize) break;
    offset += chunkSize;
  }
  return out;
}
