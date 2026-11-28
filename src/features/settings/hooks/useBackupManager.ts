import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackupActions } from '../hooks';
import { settingsService } from '../service';
import type { AutoBackupConfig } from '../types.ts';
import { useFeedbackStore } from '../../feedback/store';
import { GoogleDriveService } from '../services/googleDriveService';
import { formatLocalDate } from '../../../core/utils/dateUtils';
import { useAuthStore } from '../../auth/store';
import { useConnectionStore } from '@/core/store/connectionStore';
import { edgeClient } from '@/core/offline/edgeClient';
import { supabase } from '@/lib/supabaseClient';

export interface SystemBackupRunRow {
  id: string;
  company_id: string;
  branch_id: string | null;
  trigger_type: 'scheduled' | 'manual' | 'edge_auto';
  destination: 'google_drive' | 'local_disk' | 'both';
  status: 'running' | 'success' | 'failed';
  file_name: string | null;
  compressed_bytes: number;
  total_rows: number;
  sha256: string | null;
  drive_file_id: string | null;
  drive_web_link: string | null;
  local_path: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface BranchEdgeNodeRow {
  id: string;
  company_id: string;
  branch_id: string;
  branch_code: string;
  hostname: string | null;
  edge_version: string | null;
  status: 'online' | 'offline' | 'syncing' | 'degraded';
  pending_outbox_count: number;
  failed_outbox_count: number;
  mirror_products_count: number;
  mirror_parties_count: number;
  last_mirror_sync_at: string | null;
  last_heartbeat_at: string;
  memory_rss_mb: number | null;
}

const isMissingRelationError = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) return false;
  const obj = err as { code?: unknown; message?: unknown };
  const code = typeof obj.code === 'string' ? obj.code : '';
  const msg = typeof obj.message === 'string' ? obj.message.toLowerCase() : '';
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist')
  );
};

interface BackupRunsQueryResult {
  rows: SystemBackupRunRow[];
  missing: boolean;
}
interface EdgeNodesQueryResult {
  rows: BranchEdgeNodeRow[];
  missing: boolean;
}

async function queryBackupRuns(companyId: string): Promise<BackupRunsQueryResult> {
  const { data, error } = await (supabase.from as unknown as (t: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        order: (col: string, opts: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: SystemBackupRunRow[] | null; error: unknown }>;
        };
      };
    };
  })('system_backup_runs')
    .select('*')
    .eq('company_id', companyId)
    .order('started_at', { ascending: false })
    .limit(20);

  if (error !== null && error !== undefined) {
    if (isMissingRelationError(error)) return { rows: [], missing: true };
    throw new Error(error instanceof Error ? error.message : 'تعذر تحميل سجل النسخ الاحتياطية');
  }
  return { rows: data ?? [], missing: false };
}

async function queryEdgeNodes(companyId: string): Promise<EdgeNodesQueryResult> {
  const { data, error } = await (supabase.from as unknown as (t: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        order: (col: string, opts: { ascending: boolean }) => Promise<{
          data: BranchEdgeNodeRow[] | null;
          error: unknown;
        }>;
      };
    };
  })('branch_edge_nodes')
    .select('*')
    .eq('company_id', companyId)
    .order('last_heartbeat_at', { ascending: false });

  if (error !== null && error !== undefined) {
    if (isMissingRelationError(error)) return { rows: [], missing: true };
    throw new Error(error instanceof Error ? error.message : 'تعذر تحميل حالة سيرفرات الفروع');
  }
  return { rows: data ?? [], missing: false };
}

async function gunzipJsonFile(file: File): Promise<File> {
  const decompressedStream = file.stream().pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(decompressedStream).text();
  return new File([text], file.name.replace(/\.gz$/i, ''), { type: 'application/json' });
}

// eslint-disable-next-line max-lines-per-function, @typescript-eslint/explicit-function-return-type
export const useBackupManager = () => {
  const { user } = useAuthStore();
  const companyId = user?.company_id ?? '';
  const queryClient = useQueryClient();
  const { exportData, importData } = useBackupActions();
  const { showToast } = useFeedbackStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    edgeAvailable,
    edgeUrl,
    edgeSecret,
    edgeBranchCode,
    pendingOutboxCount,
    failedOutboxCount,
    lastMirrorSyncAt,
    setEdgeUrl,
    setEdgeSecret,
  } = useConnectionStore();

  const [edgeUrlDraft, setEdgeUrlDraft] = useState(edgeUrl);
  const [edgeSecretDraft, setEdgeSecretDraft] = useState(edgeSecret);
  const [isTestingEdge, setIsTestingEdge] = useState(false);
  const [isRunningEdgeBackup, setIsRunningEdgeBackup] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingToDrive, setIsExportingToDrive] = useState(false);
  const [autoConfig, setAutoConfig] = useState<AutoBackupConfig>(
    settingsService.getAutoBackupConfig()
  );
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const stats = settingsService.getStorageStats();
  const localLogs = settingsService.getBackupLogs();

  useEffect(() => {
    if (!edgeAvailable) return;
    let active = true;
    void edgeClient
      .getBackupConfig()
      .then(remoteCfg => {
        if (!active) return;
        setAutoConfig(prev => ({
          ...prev,
          enabled: remoteCfg.enabled,
          frequency: remoteCfg.frequency,
          retentionDays: remoteCfg.retentionDays,
        }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [edgeAvailable]);

  const { data: backupRunsRes, isFetching: isFetchingRuns } = useQuery<BackupRunsQueryResult>({
    queryKey: ['system-backup-runs', companyId],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async () => await queryBackupRuns(companyId),
  });

  const { data: edgeNodesRes } = useQuery<EdgeNodesQueryResult>({
    queryKey: ['branch-edge-nodes', companyId],
    enabled: Boolean(companyId),
    staleTime: 30_000,
    queryFn: async () => await queryEdgeNodes(companyId),
  });

  const serverBackupRuns = backupRunsRes?.rows ?? [];
  const edgeNodes = edgeNodesRes?.rows ?? [];
  const migrationMissing = Boolean(backupRunsRes?.missing) || Boolean(edgeNodesRes?.missing);

  const handleSaveAndTestEdgeUrl = async (): Promise<void> => {
    setEdgeUrl(edgeUrlDraft);
    setEdgeSecret(edgeSecretDraft);
    setIsTestingEdge(true);
    try {
      const health = await edgeClient.checkHealth();
      if (health?.ok === true) {
        showToast(
          `تم الاتصال بخادم فرع ${health.branchCode} بنجاح (${health.productsCount.toLocaleString('en-US')} صنف بالمرآة)`,
          'success'
        );
      } else {
        showToast('تعذر الوصول إلى الخادم المحلي على هذا العنوان — تأكد من تشغيله', 'error');
      }
    } finally {
      setIsTestingEdge(false);
    }
  };

  const handleEdgeCompressedBackup = async (): Promise<void> => {
    setIsRunningEdgeBackup(true);
    try {
      const res = await edgeClient.triggerBackupNow();
      const mb = (res.compressed_bytes / 1024 / 1024).toFixed(2);
      showToast(
        res.drive_web_link !== null && res.drive_web_link !== ''
          ? `تم إنشاء نسخة مضغوطة (${mb} MB) ورفعها إلى Google Drive بنجاح`
          : `تم إنشاء نسخة مضغوطة محلية (${mb} MB) بنجاح`,
        'success'
      );
      void queryClient.invalidateQueries({ queryKey: ['system-backup-runs', companyId] });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'فشل تشغيل النسخة المضغوطة من الخادم المحلي',
        'error'
      );
    } finally {
      setIsRunningEdgeBackup(false);
    }
  };

  const handleExport = async (): Promise<void> => {
    setIsExporting(true);
    try {
      await exportData();
    } finally {
      setIsExporting(false);
    }
  };

  const handleDriveExport = async (): Promise<void> => {
    setIsExportingToDrive(true);
    try {
      const token = await GoogleDriveService.authenticateAndGetToken();
      showToast('جاري تجهيز بيانات النظام...', 'info');
      const data = await settingsService.exportSystemData(user?.company_id);
      showToast('جاري الرفع إلى Google Drive...', 'info');
      const fileName = `AlNadary_Backup_${formatLocalDate()}`;
      await GoogleDriveService.uploadJSONFile(fileName, data, token);
      showToast('تم الرفع إلى حسابك في جوجل درايف بنجاح', 'success');
    } catch (error: unknown) {
      const err = error as Error;
      showToast(err.message || 'حدث خطأ أثناء الرفع إلى جوجل', 'error');
    } finally {
      setIsExportingToDrive(false);
    }
  };

  const handleImportClick = (): void => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (
      !window.confirm(
        'تحذير حرج: استيراد البيانات سيقوم باستبدال السجلات الحالية التي تطابق المعرفات (ID) بمحتويات الملف وإضافة السجلات الجديدة. هذه العملية خاصة بمالك النظام (Owner) وقد تلمس بيانات مالية. هل تود الاستمرار؟'
      )
    ) {
      return;
    }

    if (file.name.toLowerCase().endsWith('.gz')) {
      if (typeof DecompressionStream === 'undefined') {
        showToast('المتصفح الحالي لا يدعم فك ضغط .gz تلقائياً — فك الضغط أولاً ثم اختر .json', 'error');
        return;
      }
      try {
        const jsonFile = await gunzipJsonFile(file);
        await importData(jsonFile);
      } catch {
        showToast('تعذر قراءة أو فك ضغط ملف النسخة الاحتياطية (.gz)', 'error');
      }
      return;
    }

    await importData(file);
  };

  const saveConfig = async (): Promise<void> => {
    setIsSavingConfig(true);
    try {
      settingsService.saveAutoBackupConfig(autoConfig);
      if (edgeAvailable) {
        await edgeClient.saveBackupConfig({
          enabled: autoConfig.enabled,
          frequency: autoConfig.frequency,
          retentionDays: autoConfig.retentionDays,
        });
        showToast('تم حفظ ومزامنة إعدادات الجدولة مع الخادم المحلي بنجاح', 'success');
      } else {
        showToast('تم حفظ إعدادات الجدولة محلياً بالمتصفح (الخادم المحلي غير متصل)', 'info');
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'تم الحفظ بالمتصفح لكن تعذرت المزامنة مع الخادم المحلي',
        'warning'
      );
    } finally {
      setIsSavingConfig(false);
    }
  };

  return {
    state: {
      isExporting,
      isExportingToDrive,
      isRunningEdgeBackup,
      isTestingEdge,
      isFetchingRuns,
      autoConfig,
      isSavingConfig,
      stats,
      logs: localLogs,
      serverBackupRuns,
      edgeNodes,
      edgeAvailable,
      edgeUrl,
      edgeUrlDraft,
      edgeSecretDraft,
      edgeBranchCode,
      pendingOutboxCount,
      failedOutboxCount,
      lastMirrorSyncAt,
      migrationMissing,
    },
    actions: {
      setAutoConfig,
      setEdgeUrlDraft,
      setEdgeSecretDraft,
      handleSaveAndTestEdgeUrl,
      handleEdgeCompressedBackup,
      handleExport,
      handleDriveExport,
      handleImportClick,
      handleFileChange,
      saveConfig,
    },
    refs: { fileInputRef },
  };
};
