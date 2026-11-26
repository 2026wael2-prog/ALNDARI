import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';
import type { AuthUser } from './types';
import { supabase, PASSWORD_RECOVERY_INTENT } from '../../lib/supabaseClient';
import { authApi } from './api';
import { queryClient } from '../../lib/queryClient';
import { persister } from '../../lib/persister';
import { logger } from '../../core/utils/logger';
import { useBranchFilterStore } from '../branches/store';
import { teardownAllRealtimeSync } from '../../lib/hooks/useRealtimeSync';
import { syncStore } from '../../core/lib/sync-store';
import { useWorkspaceTabStore } from '../../core/store/workspaceTabStore';
import { partyCache } from '../parties/lib/party-cache';

function clearSessionClientState(): void {
  teardownAllRealtimeSync();
  partyCache.clearAll();
  queryClient.clear();
  useBranchFilterStore.getState().ensureCompany(null);
  useWorkspaceTabStore.getState().closeAllTabs();
  // [AUDIT FIX 16] Clear persisted invoice/purchase/POS drafts & dead-letter queue so the next user/company on this device never sees stale PII
  try {
    const draftKeys = [
      'sales-invoice-storage',
      'sales_drafts_v1',
      'purchase-invoice-storage',
      'purchases_drafts_v1',
      'pos-storage',
      'pos_cart_v1',
      'al-zahra-pos-cache',
      'alzahra_sales_draft',
      'alzahra_purchase_draft',
      'alnadary_sync_dead_letter_v1',
    ];
    for (const key of draftKeys) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors in restricted environments
  }
  Promise.resolve(syncStore.clear()).catch(() => undefined);
  Promise.resolve(persister.removeClient()).catch(() => undefined);
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isReady: boolean;
  login: (user: AuthUser) => void;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

// Timeout for session & profile checks (tightened from 45s to 15s for fast fail-closed recovery)
const SESSION_CHECK_TIMEOUT = 15000;
const PROFILE_FETCH_TIMEOUT = 20000;

/**
 * Checks whether a persisted Supabase auth token exists locally and has either
 * a non-expired access token or a valid refresh token, preventing stale
 * localStorage user profiles from optimistically appearing logged in on shared devices.
 */
function hasValidLocalSupabaseSession(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as {
        access_token?: string;
        refresh_token?: string;
        expires_at?: number;
      };
      if (typeof parsed.access_token === 'string' && parsed.access_token.length > 0) {
        const nowSec = Math.floor(Date.now() / 1000);
        if (typeof parsed.expires_at === 'number' && parsed.expires_at > nowSec) {
          return true;
        }
        if (typeof parsed.refresh_token === 'string' && parsed.refresh_token.length > 0) {
          return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

// Module-level state (not persisted — runtime-only)
let isInitializingGlobal = false;
let _authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      isReady: false,

      login: user => set({ user, isAuthenticated: true, isLoading: false, isReady: true }),

      loginWithGoogle: async () => {
        try {
          set({ isLoading: true });
          const { error } = await authApi.signInWithGoogle();
          if (error) throw error;
          // The page will redirect to Google, so we don't need to do anything else here.
        } catch (err) {
          logger.error('Auth', 'Google login error', err);
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          await queryClient.cancelQueries();
          await Promise.race([
            supabase.auth.signOut(),
            new Promise<void>(resolve => setTimeout(resolve, 2500)),
          ]);
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        } catch (err) {
          logger.error('Auth', 'Sign out error', err);
        } finally {
          // Clear all realtime channels, React Query cache, sync queue, workspace tabs, IndexedDB persisted data & branch filter on logout
          clearSessionClientState();
          set({ user: null, isAuthenticated: false, isLoading: false, isReady: true });
        }
      },

      initialize: async () => {
        // Prevent concurrent initialization
        if (isInitializingGlobal) return;
        isInitializingGlobal = true;

        // ⚡ Trust Persisted Data First (Optimistic UI)
        // NOTE: `isAuthenticated` is intentionally NOT persisted (QA-2026-003),
        // so we rely on `persistedUser` existence (which IS persisted) to decide
        // whether to show the app optimistically during background validation.
        const persistedUser = get().user;
        const hasLocalToken = hasValidLocalSupabaseSession();

        if (persistedUser && hasLocalToken) {
          set({ isAuthenticated: true, isLoading: false, isReady: true });
        }

        try {
          if (!persistedUser || !hasLocalToken) {
            set({ isLoading: true });
          }

          // 1. Create a timeout promise
          const timeoutPromise = new Promise<{ timeout: boolean }>(resolve =>
            setTimeout(() => {
              resolve({ timeout: true });
            }, SESSION_CHECK_TIMEOUT)
          );

          // 2. Try to get session with timeout
          let session = null;
          let sessionError = null;

          const sessionPromise = supabase.auth
            .getSession()
            .catch(() => ({ data: { session: null }, error: null }));
          const result = await Promise.race([sessionPromise, timeoutPromise]);

          if (result && 'timeout' in result) {
            if (!persistedUser || !hasLocalToken) {
              logger.warn('Auth', 'Session check timed out without valid local token');
              clearSessionClientState();
              set({ user: null, isAuthenticated: false, isLoading: false, isReady: true });
              isInitializingGlobal = false;
              return;
            } else {
              logger.debug('Auth', 'Session check timed out, using verified local token session');
              isInitializingGlobal = false;
              return;
            }
          } else if ('data' in result) {
            session = result.data.session;
            sessionError = result.error;
          }

          // ⚡ If Refresh Token fails, clear session immediately
          if (sessionError) {
            logger.warn('Auth', 'Stale session detected, clearing token', {
              message: sessionError.message,
            });
            await supabase.auth.signOut({ scope: 'local' });
            queryClient.clear();
            Promise.resolve(persister.removeClient()).catch(() => undefined);
            set({ user: null, isAuthenticated: false, isLoading: false, isReady: true });
          } else if (session?.user) {
            // 2. Fetch full profile with timeout
            let profile: Record<string, unknown> | null = null;

            const profilePromise = authApi
              .getProfile(session.user.id)
              .catch(() => ({ data: null, error: null, isAborted: false }));
            const profileTimeout = new Promise<{ timeout: boolean }>(resolve =>
              setTimeout(() => {
                resolve({ timeout: true });
              }, PROFILE_FETCH_TIMEOUT)
            );

            const profileResult = await Promise.race([profilePromise, profileTimeout]);

            if (profileResult && 'timeout' in profileResult) {
              logger.warn('Auth', 'Profile fetch timed out');
              if (persistedUser && persistedUser.id === session.user.id) {
                profile = persistedUser as unknown as Record<string, unknown>;
                set({ isLoading: false, isReady: true });
              }
            } else {
              const resolved = profileResult as
                { data?: Record<string, unknown>; isAborted?: boolean } | Record<string, unknown>;
              profile = ('data' in resolved && resolved.data ? resolved.data : resolved) as Record<
                string,
                unknown
              >;
            }

            if (profile && typeof profile === 'object' && profile.id) {
              const nextUser = profile as unknown as AuthUser;
              const identityChanged =
                !persistedUser ||
                persistedUser.id !== nextUser.id ||
                persistedUser.company_id !== nextUser.company_id ||
                persistedUser.role !== nextUser.role ||
                persistedUser.branch_id !== nextUser.branch_id;

              set({
                user: nextUser,
                isAuthenticated: true,
                isLoading: false,
                isReady: true,
              });
              // Only invalidate active queries if the user identity/company/role/branch
              // actually changed — avoids firing a duplicate request storm on every boot.
              if (identityChanged) {
                queryClient.invalidateQueries({ type: 'active' });
              }
            } else if (!persistedUser) {
              // ⚡ Profile RPC failed — try direct query to get company_id before giving up
              let recoveredCompanyId: string | undefined;
              let recoveredRole = 'viewer';
              let recoveredBranchId: string | null = null;
              try {
                const { data: roleRow } = await supabase
                  .from('user_company_roles')
                  .select('role, company_id, branch_id, companies(name_ar)')
                  .eq('user_id', session.user.id)
                  .limit(1)
                  .single();
                if (roleRow) {
                  const roleData = roleRow as {
                    role?: string | null;
                    company_id?: string | null;
                    branch_id?: string | null;
                  } | null;
                  recoveredCompanyId = roleData?.company_id ?? undefined;
                  recoveredRole = roleData?.role || 'viewer';
                  recoveredBranchId = roleData?.branch_id ?? null;
                }
              } catch {
                /* ignore — best effort */
              }

              set({
                user: {
                  id: session.user.id,
                  email: session.user.email || '',
                  full_name: session.user.user_metadata?.full_name || '',
                  role: recoveredRole,
                  ...(recoveredCompanyId ? { company_id: recoveredCompanyId } : {}),
                  branch_id: recoveredBranchId,
                },
                isAuthenticated: true,
                isLoading: false,
                isReady: true,
              });
              queryClient.invalidateQueries({ type: 'active' });
            }
          } else if (!persistedUser) {
            set({ user: null, isAuthenticated: false, isLoading: false, isReady: true });
          } else {
            queryClient.clear();
            Promise.resolve(persister.removeClient()).catch(() => undefined);
            set({ user: null, isAuthenticated: false, isLoading: false, isReady: true });
          }

          // 3. Unsubscribe from previous listener if exists
          if (_authSubscription) _authSubscription.unsubscribe();

          // 4. Listen for auth state changes
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange(
            async (event: AuthChangeEvent, session: Session | null) => {
              try {
                logger.debug('Auth', 'State change event', { event });

                // ⚡ تنظيف الـ Hash من الرابط بعد تسجيل الدخول عبر Google/OAuth
                // لمنع تحذير `@supabase/gotrue-js: Session as retrieved from URL was issued over 120s ago` عند إعادة تحميل الصفحة
                if (
                  typeof window !== 'undefined' &&
                  window.location.hash &&
                  (window.location.hash.includes('access_token=') ||
                    window.location.hash.includes('error_description='))
                ) {
                  window.history.replaceState(
                    null,
                    '',
                    window.location.pathname + window.location.search
                  );
                }

                if (event === 'SIGNED_OUT' || !session) {
                  clearSessionClientState();
                  set({ user: null, isAuthenticated: false, isLoading: false, isReady: true });
                  return;
                }

                // Keep Supabase Realtime WebSocket JWT synchronized on every token refresh / session recovery
                if (session.access_token && typeof supabase.realtime?.setAuth === 'function') {
                  void supabase.realtime.setAuth(session.access_token);
                }

                const currentUser = get().user;
                // ⚡ تخطّي TOKEN_REFRESHED و INITIAL_SESSION إذا تم التحقق من نفس المستخدم للتو
                // خلال initialize() لمنع جلب البروفايل مرتين متتاليتين وإبطال الكاش الشامل عند الإقلاع.
                if (
                  currentUser &&
                  currentUser.id === session.user.id &&
                  (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')
                ) {
                  return;
                }

                if (
                  event === 'INITIAL_SESSION' ||
                  event === 'TOKEN_REFRESHED' ||
                  event === 'SIGNED_IN' ||
                  event === 'PASSWORD_RECOVERY'
                ) {
                  if (!session.user?.id) return;

                  try {
                    const profileResult = await authApi.getProfile(session.user.id);
                    const resolved = profileResult as unknown as
                      { data?: Record<string, unknown> } | Record<string, unknown>;
                    const profile = (
                      'data' in resolved && resolved.data ? resolved.data : resolved
                    ) as Record<string, unknown>;

                    if (profile && typeof profile === 'object' && profile.id) {
                      const nextUser = profile as unknown as AuthUser;
                      const prevUser = get().user;
                      const identityChanged =
                        !prevUser ||
                        prevUser.id !== nextUser.id ||
                        prevUser.company_id !== nextUser.company_id ||
                        prevUser.role !== nextUser.role ||
                        prevUser.branch_id !== nextUser.branch_id;

                      set({
                        user: nextUser,
                        isAuthenticated: true,
                        isLoading: false,
                        isReady: true,
                      });
                      // ⚡ لا نبطل الاستعلامات النشطة إلا إذا تغيرت هوية المستخدم أو الشركة أو الفرع
                      if (identityChanged) {
                        queryClient.invalidateQueries({ type: 'active' });
                      }
                    }
                  } catch {
                    logger.warn('Auth', `Profile fetch after ${event} failed`);
                  }

                  // ⚡ رابط استعادة كلمة المرور يُنشئ جلسة لكنه لا يُنقّل المستخدم،
                  // فيهبط على لوحة التحكم ولا يرى نموذج كلمة المرور الجديدة أبداً.
                  // نعتمد أولاً على الالتقاط المُبكّر في supabaseClient لأن حدث
                  // PASSWORD_RECOVERY قد يُطلَق قبل اشتراك المخزن فيُفقد تماماً،
                  // ونُبقي معالجة الحدث كمسار ثانٍ.
                  if (
                    (event === 'PASSWORD_RECOVERY' || PASSWORD_RECOVERY_INTENT) &&
                    typeof window !== 'undefined' &&
                    !window.location.hash.startsWith('#/update-password')
                  ) {
                    window.location.hash = '#/update-password';
                    logger.info('Auth', 'Password recovery — routed to /update-password');
                  }
                }
              } catch (err) {
                logger.error('Auth', 'onAuthStateChange handler failed', err);
              }
            }
          );

          _authSubscription = subscription;
        } catch (err) {
          logger.error('Auth', 'Initialization error', err);
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {
            /* best effort */
          }
          queryClient.clear();
          Promise.resolve(persister.removeClient()).catch(() => undefined);
          set({ user: null, isAuthenticated: false, isLoading: false, isReady: true });
        } finally {
          isInitializingGlobal = false;
        }
      },
    }),
    {
      name: 'alzhra-auth',
      partialize: state => ({
        user: state.user,
        // isAuthenticated intentionally NOT persisted (QA-2026-003) — derived
        // from `user` presence during initialize(). Storing a bare boolean in
        // localStorage would let a user bypass auth by tampering the JSON.
        // The Optimistic UI now checks `persistedUser` directly instead.
      }),
    }
  )
);
