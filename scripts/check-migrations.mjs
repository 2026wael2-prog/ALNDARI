#!/usr/bin/env node
/**
 * Migration Governance Guard (DB-07)
 * Ensures no new SQL migration ever reuses a 14-digit timestamp prefix,
 * preventing `supabase db push` / `supabase db reset` primary-key collisions.
 */
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase', 'migrations');

// Historical legacy duplicate timestamps already applied in production (frozen baseline).
// NEVER add new entries here — always give new migrations a unique timestamp!
const LEGACY_DUPLICATE_ALLOWLIST = new Set([
  '20260919000004',
  '20260919000005',
  '20260922000002',
  '20260924000001',
  '20261113000002',
  '20261115000001',
  '20261116000001',
  '20261116000002',
  '20261116000003',
]);

if (!fs.existsSync(MIGRATIONS_DIR)) {
  console.log('[check:migrations] No supabase/migrations directory found.');
  process.exit(0);
}

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

const byPrefix = new Map();
for (const file of files) {
  const match = /^(\d{14})_/.exec(file);
  if (!match) continue;
  const prefix = match[1];
  const list = byPrefix.get(prefix) || [];
  list.push(file);
  byPrefix.set(prefix, list);
}

const newDuplicates = [];
for (const [prefix, list] of byPrefix.entries()) {
  if (list.length > 1 && !LEGACY_DUPLICATE_ALLOWLIST.has(prefix)) {
    newDuplicates.push({ prefix, list });
  }
}

if (newDuplicates.length > 0) {
  console.error('❌ New duplicate migration timestamp prefixes detected:');
  for (const { prefix, list } of newDuplicates) {
    console.error(`  ${prefix}: ${list.join(', ')}`);
  }
  process.exit(1);
}

console.log(
  `✅ Migration timestamps clean (${files.length} SQL files; 0 new duplicate prefixes beyond ${LEGACY_DUPLICATE_ALLOWLIST.size} frozen legacy pairs).`
);
