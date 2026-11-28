/**
 * Configuration loader for the Branch Local Edge Server.
 * Reads `.env.edge` (if present) and process.env without any external dotenv dependency.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EDGE_ROOT_DIR = path.resolve(__dirname, '..');

function parseDotEnvFile(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

export function loadConfig(overrides = {}) {
  const envFile =
    overrides.envFile ??
    process.env.EDGE_ENV_FILE ??
    path.join(EDGE_ROOT_DIR, '.env.edge');
  const fileEnv = parseDotEnvFile(envFile);
  const env = { ...fileEnv, ...process.env, ...overrides };

  const branchCode = (overrides.branchCode || env.BRANCH_CODE || 'B1').trim().toUpperCase();
  const dataDir = path.resolve(
    EDGE_ROOT_DIR,
    overrides.dataDir || env.DATA_DIR || `C:\\AlNadary_Edge\\${branchCode}\\data`
  );
  const backupDir = path.resolve(
    EDGE_ROOT_DIR,
    overrides.backupDir || env.BACKUP_DIR || 'C:\\AlNadary_Backups'
  );
  const distDir = path.resolve(EDGE_ROOT_DIR, overrides.distDir || env.DIST_DIR || '..\\dist');

  return {
    edgeVersion: '1.0.0',
    hostname: os.hostname(),
    port: Number(overrides.port ?? env.EDGE_PORT ?? 8787),
    host: overrides.host || env.EDGE_HOST || '0.0.0.0',
    companyId: overrides.companyId || env.COMPANY_ID || '7f3a9c21-5b4e-4d8a-9e12-6c0d3b8a5f47',
    branchId: overrides.branchId || env.BRANCH_ID || 'd8771318-20f8-4260-9ac6-e40c3378a5e1',
    branchCode,
    branchName: overrides.branchName || env.BRANCH_NAME || 'فرع وائل النظاري',
    supabaseUrl: (overrides.supabaseUrl || env.SUPABASE_URL || 'https://dagfjncoullstrhbjssr.supabase.co').replace(/\/+$/, ''),
    supabaseAnonKey: overrides.supabaseAnonKey ?? env.SUPABASE_ANON_KEY ?? '',
    supabaseServiceRoleKey: overrides.supabaseServiceRoleKey ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    dataDir,
    sqlitePath: overrides.sqlitePath || env.SQLITE_PATH || path.join(dataDir, `mirror_${branchCode.toLowerCase()}.sqlite`),
    backupDir,
    distDir,
    syncIntervalMs: Math.max(15_000, Number(env.SYNC_INTERVAL_MS || 120_000)),
    backupCronHour: Math.min(23, Math.max(0, Number(env.BACKUP_CRON_HOUR ?? 23))),
    backupCronMinute: Math.min(59, Math.max(0, Number(env.BACKUP_CRON_MINUTE ?? 30))),
    backupRetentionDays: Math.max(1, Number(env.BACKUP_RETENTION_DAYS || 30)),
    gdriveClientId: env.GDRIVE_CLIENT_ID || '',
    gdriveClientSecret: env.GDRIVE_CLIENT_SECRET || '',
    gdriveRefreshToken: env.GDRIVE_REFRESH_TOKEN || '',
    gdriveFolderName: env.GDRIVE_FOLDER_NAME || 'AlNadary_ERP_Backups',
  };
}
