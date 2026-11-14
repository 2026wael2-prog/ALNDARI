import { logger } from '../../../core/utils/logger';

/**
 * Party Cache Utility
 * Provides local storage persistence for parties to improve search performance.
 */

import type { Party, PartyType } from '../types';

const CACHE_KEY_PREFIX = 'alzahra_party_cache_';
const memoryCache = new Map<string, { data: Party[]; timestamp: number }>();

export const partyCache = {
  /**
   * Get cached parties for a specific company, type, and optional branch
   */
  get: (companyId: string, type: PartyType, branchId?: string | null): Party[] => {
    try {
      const branchKey = branchId ?? 'all';
      const key = `${CACHE_KEY_PREFIX}${companyId}_${branchKey}_${type}`;

      // ⚡ فحص الذاكرة أولاً لتجنب JSON.parse المتزامن على الـ Main Thread عند كل تبديل تبويب
      const memEntry = memoryCache.get(key);
      if (memEntry) {
        if (Date.now() - memEntry.timestamp <= 3600000) {
          return memEntry.data;
        }
        memoryCache.delete(key);
      }

      const stored = localStorage.getItem(key);
      if (!stored) return [];

      const parsed = JSON.parse(stored) as { data?: unknown; timestamp?: unknown };
      const data = parsed.data;
      const timestamp = parsed.timestamp;

      // Expire cache after 1 hour to ensure fresh data eventual consistency.
      if (typeof timestamp !== 'number' || Date.now() - timestamp > 3600000) {
        localStorage.removeItem(key);
        return [];
      }

      if (!Array.isArray(data)) {
        logger.warn('party-cache', 'Party cache entry malformed, discarding for', key);
        localStorage.removeItem(key);
        return [];
      }

      const typedData = data as Party[];
      memoryCache.set(key, { data: typedData, timestamp });
      return typedData;
    } catch (e) {
      logger.error('party-cache', 'Failed to read party cache:', e);
      return [];
    }
  },

  /**
   * Set cached parties
   */
  set: (companyId: string, type: PartyType, data: Party[], branchId?: string | null) => {
    const branchKey = branchId ?? 'all';
    const key = `${CACHE_KEY_PREFIX}${companyId}_${branchKey}_${type}`;
    const timestamp = Date.now();
    memoryCache.set(key, { data, timestamp });

    // ⚡ تأجيل الكتابة المتزامنة في localStorage (JSON.stringify لآلاف السجلات) إلى وقت خمول المتصفح
    const persistToStorage = () => {
      try {
        const serialized = JSON.stringify({ data, timestamp });
        try {
          localStorage.setItem(key, serialized);
        } catch {
          partyCache.clearAll();
          memoryCache.set(key, { data, timestamp });
          try {
            localStorage.setItem(key, serialized);
          } catch {
            logger.warn(
              'party-cache',
              'Party cache payload exceeded storage quota, skipped caching for',
              key
            );
          }
        }
      } catch (e) {
        logger.warn('party-cache', 'Failed to update party cache:', e);
      }
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(persistToStorage, { timeout: 2000 });
    } else {
      setTimeout(persistToStorage, 0);
    }
  },

  /**
   * Clear cache for a specific company/type/branch
   */
  clear: (companyId: string, type: PartyType, branchId?: string | null) => {
    try {
      const branchKey = branchId ?? 'all';
      const key = `${CACHE_KEY_PREFIX}${companyId}_${branchKey}_${type}`;
      memoryCache.delete(key);
      localStorage.removeItem(key);
    } catch (e) {
      logger.error('party-cache', 'Failed to clear party cache:', e);
    }
  },

  /**
   * Clear all party caches
   */
  clearAll: () => {
    try {
      memoryCache.clear();
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_KEY_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => {
        localStorage.removeItem(k);
      });
    } catch (e) {
      logger.error('party-cache', 'Failed to clear all party caches:', e);
    }
  },
};
