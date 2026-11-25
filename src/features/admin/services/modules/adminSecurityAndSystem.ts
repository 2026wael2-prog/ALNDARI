import { supabase } from '../../../../lib/supabaseClient';
import type { Json } from '../../../../core/database.types';
import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_MAINTENANCE_MODE,
  isMaintenanceModeConfig,
  type MaintenanceModeConfig,
} from '../../../../core/config/platformDefaults';
import { optArg } from '@/core/utils/rpcArgs';
import type {
  CspReportLog,
  PlatformMetrics,
  SecurityAlertLog,
  ServiceTelemetry,
  SystemPlatformConfigs,
} from '../../types';
import {
  collectPaginatedChunks,
  toCspReport,
  toHoneypotLog,
  type CspReportRow,
  type SecurityAlertRow,
} from './adminMappers';

export const adminSecurityAndSystemService = {
  async getMetrics(): Promise<PlatformMetrics> {
    const { data, error } = await supabase.rpc('get_platform_system_metrics');
    if (error) throw error;
    return (data ?? {}) as unknown as PlatformMetrics;
  },

  async getServiceTelemetry(): Promise<ServiceTelemetry> {
    const { data, error } = await supabase.rpc('get_platform_service_telemetry');
    if (error) throw error;
    return (data ?? {}) as unknown as ServiceTelemetry;
  },

  async pingDatabase(): Promise<number> {
    const start = performance.now();
    const { error } = await supabase.from('system_platform_configs').select('key').limit(1);
    if (error) throw error;
    return Math.round(performance.now() - start);
  },

  async getMaintenanceConfig(): Promise<MaintenanceModeConfig> {
    const { data, error } = await supabase
      .from('system_platform_configs')
      .select('value')
      .eq('key', 'maintenance_mode')
      .maybeSingle();

    if (error || !data) return DEFAULT_MAINTENANCE_MODE;
    return isMaintenanceModeConfig(data.value) ? data.value : DEFAULT_MAINTENANCE_MODE;
  },

  async getSystemConfigs(): Promise<SystemPlatformConfigs> {
    const { data, error } = await supabase.from('system_platform_configs').select('key, value');
    if (error) throw error;

    const configsMap = (data ?? []).reduce<Record<string, Json>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    const rawMaintenance = configsMap.maintenance_mode;
    const maintenanceMode: SystemPlatformConfigs['maintenance_mode'] =
      rawMaintenance && typeof rawMaintenance === 'object' && !Array.isArray(rawMaintenance)
        ? {
            ...DEFAULT_MAINTENANCE_MODE,
            ...(rawMaintenance as unknown as Partial<SystemPlatformConfigs['maintenance_mode']>),
          }
        : DEFAULT_MAINTENANCE_MODE;

    const rawFlags = configsMap.feature_flags;
    const featureFlags: SystemPlatformConfigs['feature_flags'] =
      rawFlags && typeof rawFlags === 'object' && !Array.isArray(rawFlags)
        ? {
            ...DEFAULT_FEATURE_FLAGS,
            ...(rawFlags as unknown as Partial<SystemPlatformConfigs['feature_flags']>),
          }
        : DEFAULT_FEATURE_FLAGS;

    return { maintenance_mode: maintenanceMode, feature_flags: featureFlags };
  },

  async updateSystemConfig(key: string, value: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.rpc('admin_update_system_config', {
      p_key: key,
      p_value: value as unknown as Json,
    });
    if (error) throw error;
  },

  async resolveSecurityAlert(alertId: number | string, notes?: string): Promise<boolean> {
    const numericId = typeof alertId === 'number' ? alertId : parseInt(alertId, 10);
    const { data, error } = await supabase.rpc('admin_resolve_security_alert', {
      p_alert_id: numericId,
      ...optArg('p_notes', notes),
    });
    if (error) throw error;
    return data;
  },

  async getSecurityAlerts(params?: {
    limit?: number | undefined;
    offset?: number | undefined;
    resolved?: boolean | undefined;
  }): Promise<SecurityAlertLog[]> {
    const { data, error } = await supabase.rpc('get_security_alerts_page', {
      p_limit: params?.limit ?? 50,
      p_offset: params?.offset ?? 0,
      ...optArg('p_resolved', params?.resolved),
    });
    if (error) throw error;
    return ((data ?? []) as unknown as SecurityAlertRow[]).map(toHoneypotLog);
  },

  async getSecurityAlertsCount(resolved?: boolean): Promise<number> {
    const { data, error } = await supabase.rpc('get_security_alerts_count', {
      ...optArg('p_resolved', resolved),
    });
    if (error) throw error;
    return data ?? 0;
  },

  async getCspReportsPage(params?: {
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<CspReportLog[]> {
    const { data, error } = await supabase.rpc('get_csp_reports_page', {
      p_limit: params?.limit ?? 50,
      p_offset: params?.offset ?? 0,
    });
    if (error) throw error;
    return ((data ?? []) as unknown as CspReportRow[]).map(toCspReport);
  },

  async getCspReportsCount(): Promise<number> {
    const { data, error } = await supabase.rpc('get_csp_reports_count');
    if (error) throw error;
    return data ?? 0;
  },

  async exportAllSecurityAlerts(
    chunkSize: number,
    resolved?: boolean
  ): Promise<SecurityAlertLog[]> {
    return collectPaginatedChunks(
      chunkSize,
      async (offset, limit) => {
        const { data, error } = await supabase.rpc('get_security_alerts_page', {
          p_limit: limit,
          p_offset: offset,
          ...optArg('p_resolved', resolved),
        });
        if (error) throw error;
        return (data ?? []) as unknown as SecurityAlertRow[];
      },
      toHoneypotLog
    );
  },

  async exportAllCspReports(chunkSize: number): Promise<CspReportLog[]> {
    return collectPaginatedChunks(
      chunkSize,
      async (offset, limit) => {
        const { data, error } = await supabase.rpc('get_csp_reports_page', {
          p_limit: limit,
          p_offset: offset,
        });
        if (error) throw error;
        return (data ?? []) as unknown as CspReportRow[];
      },
      toCspReport
    );
  },
};
