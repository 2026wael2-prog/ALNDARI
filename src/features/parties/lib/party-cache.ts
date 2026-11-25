import { logger } from '../../../core/utils/logger';

/**
 * Party Cache Utility (In-Memory Only — Security Hardened)
 *
 * SECURITY: Customer/supplier records contain PII (names, phones, emails, balances).
 * They MUST NEVER be persisted in plaintext in `localStorage` alongside auth tokens.
 * This cache stays strictly in volatile RAM and actively purges any legacy
 * `alzahra_party_cache_*` keys left behind in `localStorage`.
 */

import type { Party, PartyType } from '../types';

const LEGACY_CACHE_KEY_PREFIX = 'alzahra_party_cache_';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes in volatile memory
const memoryCache = new Map<string, { data: Party[]; timestamp: number }>();

let legacyPurged = false;

const purgeLegacyLocalStorageCache = (): void => {
  if (legacyPurged || typeof window === 'undefined') return;
  legacyPurged = true;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(LEGACY_CACHE_KEY_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }
  } catch (e) {
    logger.warn('party-cache', 'Failed to purge legacy party cache:', e);
  }
};

export const partyCache = {
  /**
   * Get cached parties from volatile memory for a specific company, type, and optional branch
   */
  get: (companyId: string, type: PartyType, branchId?: string | null): Party[] => {
    purgeLegacyLocalStorageCache();
    const branchKey = branchId ?? 'all';
    const key = `${LEGACY_CACHE_KEY_PREFIX}${companyId}_${branchKey}_${type}`;

    const memEntry = memoryCache.get(key);
    if (!memEntry) return [];

    if (Date.now() - memEntry.timestamp <= CACHE_TTL_MS) {
      return memEntry.data;
    }

    memoryCache.delete(key);
    return [];
  },

  /**
   * Store cached parties in volatile memory only (never in localStorage)
   */
  set: (companyId: string, type: PartyType, data: Party[], branchId?: string | null) => {
    purgeLegacyLocalStorageCache();
    const branchKey = branchId ?? 'all';
    const key = `${LEGACY_CACHE_KEY_PREFIX}${companyId}_${branchKey}_${type}`;
    memoryCache.set(key, { data, timestamp: Date.now() });
  },

  /**
   * Clear cache for a specific company/type/branch
   */
  clear: (companyId: string, type: PartyType, branchId?: string | null) => {
    const branchKey = branchId ?? 'all';
    const key = `${LEGACY_CACHE_KEY_PREFIX}${companyId}_${branchKey}_${type}`;
    memoryCache.delete(key);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
    } catch {
      // ignore storage errors
    }
  },

  /**
   * Clear all party caches (both volatile memory and any legacy localStorage keys)
   */
  clearAll: () => {
    memoryCache.clear();
    legacyPurged = false;
    purgeLegacyLocalStorageCache();
  },
};
