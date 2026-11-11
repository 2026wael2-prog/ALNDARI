import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logger } from '../../core/utils/logger';
import { showDesktopNotification } from './desktopNotificationService';
import type {
  NotificationType,
  NotificationCategory,
  NotificationPriority,
} from './components/notificationConfig';

export interface AppNotificationAction {
  label: string;
  link?: string;
  onClick?: () => void;
  isPrimary?: boolean;
}

export interface AppNotification {
  id: string;
  companyId: string;
  title: string;
  message: string;
  type: NotificationType;
  category?: NotificationCategory | undefined;
  priority?: NotificationPriority | undefined;
  tag?: string | undefined;
  timestamp: number;
  isRead: boolean;
  link?: string | undefined;
  actions?: AppNotificationAction[] | undefined;
}

/**
 * بصمة مختصرة للمحتوى (hash 32-bit مكتوب يدوياً — بلا اعتماد على crypto).
 * تُضاف إلى وسم إشعار النظام لأن نظام التشغيل يستبدل الإشعارات صامتاً عند
 * تكرار نفس الوسم؛ الوسم الثابت كان يجعل أي تحديث لاحق غير مرئي.
 */
const contentSignature = (title: string, message: string): string => {
  const input = `${title}|${message}`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
};

/** إظهار إشعار النظام مع وسم متغيّر بحسب المحتوى. */
const dispatchDesktopNotification = (
  notification: AppNotification,
  desktopEnabled: boolean
): void => {
  if (!desktopEnabled) return;
  showDesktopNotification({
    title: notification.title,
    body: notification.message,
    link: notification.link,
    tag:
      notification.tag !== undefined
        ? `${notification.tag}:${contentSignature(notification.title, notification.message)}`
        : undefined,
    requireInteraction: notification.priority === 'urgent',
  });
};

/** نغمة التنبيه بحسب الأولوية (تحترم إعداد الصوت). */
const playPrioritySound = (priority?: NotificationPriority): void => {
  const soundStore = useSoundStore.getState();
  if (!soundStore.isSoundEnabled) return;
  void soundStore.playNotificationSound(priority);
};

interface NotificationState {
  notifications: AppNotification[];
  desktopEnabled: boolean;
  setDesktopEnabled: (enabled: boolean) => void;
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'isRead'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: (companyId?: string) => void;
  clearAll: (companyId?: string) => void;
  deleteNotification: (id: string) => void;
  getCompanyNotifications: (companyId: string) => AppNotification[];
  getCompanyUnreadCount: (companyId: string) => number;
  unreadCount: number;
}

// Sound notification system
interface SoundState {
  isSoundEnabled: boolean;
  volume: number;
  hasUserInteracted: boolean;
  toggleSound: () => void;
  setVolume: (vol: number) => void;
  setUserInteracted: () => void;
  playNotificationSound: (priority?: NotificationPriority, force?: boolean) => Promise<void>;
}

// ─── Shared AudioContext (typed — no `any` casts) ────────────────────────
type AudioContextCtor = typeof AudioContext;
interface UserActivationShim {
  userActivation?: { hasBeenActive: boolean };
}
interface WindowWithWebkitAudio {
  AudioContext?: AudioContextCtor;
  webkitAudioContext?: AudioContextCtor;
}

/** Single shared context reused across notifications to avoid leaking audio device handles. */
let sharedAudioContext: AudioContext | null = null;
let lastSoundPlayedAt = 0;

const getAudioContextCtor = (): AudioContextCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as WindowWithWebkitAudio;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
};

/** Create (or reuse) the shared context and resume it if suspended. */
const ensureAudioContext = async (): Promise<AudioContext | null> => {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new Ctor();
  }

  if (sharedAudioContext.state === 'suspended') {
    try {
      await sharedAudioContext.resume();
    } catch {
      // Resume failure is almost certainly a user-gesture requirement.
      return null;
    }
  }

  return sharedAudioContext.state === 'running' ? sharedAudioContext : null;
};

const PREFS_STORAGE_KEY = 'alzhra:notification_prefs';
function isCategoryEnabled(category?: NotificationCategory): boolean {
  if (!category) return true;
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return true;
    const prefs = JSON.parse(raw);
    if (category === 'inventory' && prefs.stock === false) return false;
    if (category === 'debt' && prefs.debt === false) return false;
    if (category === 'sales' && prefs.sales === false) return false;
    if (category === 'system' && prefs.system === false) return false;
    return true;
  } catch {
    return true;
  }
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      desktopEnabled: true,
      unreadCount: 0,

      setDesktopEnabled: desktopEnabled => set({ desktopEnabled }),

      addNotification: notification => {
        if (!notification.companyId) {
          logger.warn('Notifications', 'addNotification called without companyId — skipping');
          return;
        }

        // Gate by user preferences if category is set
        if (notification.category && !isCategoryEnabled(notification.category)) {
          logger.debug(
            'Notifications',
            `Skipping notification of muted category: ${notification.category}`
          );
          return;
        }

        // ── التكرار في القائمة لا يعني كتم الإشعار ──────────────────────
        // [FIX] كان هذا الفرع يُرجع قبل الوصول إلى showDesktopNotification،
        // والوسوم ثابتة (debt_critical_summary / promise_broken_summary) ⇒ أول
        // تنبيه يظهر ثم يصمت النظام للأبد ما دام غير مقروء، فتضيع التحديثات
        // الحقيقية (ارتفاع عدد العملاء المتأخرين) تماماً.
        // الآن: نحدّث الصف، ونرسل إشعار نظام فقط إذا تغيّر المحتوى فعلياً.
        if (notification.tag) {
          const previous = get().notifications.find(
            n => n.companyId === notification.companyId && n.tag === notification.tag && !n.isRead
          );
          if (previous !== undefined) {
            const contentChanged =
              previous.title !== notification.title || previous.message !== notification.message;

            // تحديث بـ map بدل فهرسة مصفوفة: يمنع الوصول بالفهرس (security) ويبقي
            // الترتيب كما هو، ويطابق الصف بمعرّفه لا بموضعه.
            set(state => ({
              notifications: state.notifications.map(existing =>
                existing.id === previous.id
                  ? {
                      ...existing,
                      title: notification.title,
                      message: notification.message,
                      timestamp: Date.now(),
                      actions: notification.actions ?? existing.actions,
                      link: notification.link ?? existing.link,
                      type: notification.type,
                      priority: notification.priority ?? existing.priority,
                    }
                  : existing
              ),
            }));

            if (contentChanged) {
              const merged: AppNotification = {
                ...previous,
                title: notification.title,
                message: notification.message,
                timestamp: Date.now(),
                type: notification.type,
                priority: notification.priority ?? previous.priority,
                link: notification.link ?? previous.link,
                actions: notification.actions ?? previous.actions,
              };
              dispatchDesktopNotification(merged, get().desktopEnabled);
              playPrioritySound(merged.priority);
            }
            return;
          }
        }

        const newNotif: AppNotification = {
          ...notification,
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          isRead: false,
        };

        set(state => {
          const updatedNotifs = [newNotif, ...state.notifications].slice(0, 100);
          return {
            notifications: updatedNotifs,
            unreadCount: updatedNotifs.filter(n => !n.isRead).length,
          };
        });

        // Show native Desktop / Windows Toast Notification above all apps
        dispatchDesktopNotification(newNotif, get().desktopEnabled);
        playPrioritySound(newNotif.priority);
      },

      getCompanyNotifications: (companyId: string) => {
        return get().notifications.filter(n => n.companyId === companyId);
      },

      getCompanyUnreadCount: (companyId: string) => {
        return get().notifications.filter(n => n.companyId === companyId && !n.isRead).length;
      },

      markAsRead: id => {
        set(state => {
          const newNotifs = state.notifications.map(n =>
            n.id === id ? { ...n, isRead: true } : n
          );
          return {
            notifications: newNotifs,
            unreadCount: newNotifs.filter(n => !n.isRead).length,
          };
        });
      },

      markAllAsRead: (companyId?: string) => {
        set(state => {
          const updated = state.notifications.map(n =>
            !companyId || n.companyId === companyId ? { ...n, isRead: true } : n
          );
          return {
            notifications: updated,
            unreadCount: companyId
              ? updated.filter(n => n.companyId !== companyId && !n.isRead).length
              : 0,
          };
        });
      },

      deleteNotification: id => {
        set(state => {
          const newNotifs = state.notifications.filter(n => n.id !== id);
          return {
            notifications: newNotifs,
            unreadCount: newNotifs.filter(n => !n.isRead).length,
          };
        });
      },

      clearAll: (companyId?: string) =>
        set(state => {
          const filtered = companyId
            ? state.notifications.filter(n => n.companyId !== companyId)
            : [];
          return {
            notifications: filtered,
            unreadCount: filtered.filter(n => !n.isRead).length,
          };
        }),
    }),
    { name: 'al-zahra-notifications' }
  )
);

export const useSoundStore = create<SoundState>()(
  persist(
    (set, get) => ({
      isSoundEnabled: true,
      volume: 0.6,
      hasUserInteracted: false,

      toggleSound: () => {
        set(state => {
          const newValue = !state.isSoundEnabled;
          if (!state.hasUserInteracted) {
            return { isSoundEnabled: newValue, hasUserInteracted: true };
          }
          return { isSoundEnabled: newValue };
        });
      },

      setVolume: (volume: number) => {
        set({ volume: Math.max(0, Math.min(1, volume)) });
      },

      setUserInteracted: () => set({ hasUserInteracted: true }),

      playNotificationSound: async (priority = 'normal', force = false) => {
        const state = get();
        if (!state.isSoundEnabled) return;

        // Sound throttling: avoid overlapping chimes within 2 seconds unless forced
        const nowMs = Date.now();
        if (!force && nowMs - lastSoundPlayedAt < 2000) {
          return;
        }
        lastSoundPlayedAt = nowMs;

        // Auto-mark user interaction when explicit sound test is called
        if (force && !state.hasUserInteracted) {
          set({ hasUserInteracted: true });
        } else if (!state.hasUserInteracted) {
          return;
        }

        // Modern browsers explicit gesture check
        if (typeof navigator !== 'undefined' && 'userActivation' in navigator) {
          const nav = navigator as unknown as UserActivationShim;
          if (!nav.userActivation?.hasBeenActive && !force) return;
        }

        try {
          const audioContext = await ensureAudioContext();
          if (!audioContext) return;

          const vol = state.volume ?? 0.6;
          const now = audioContext.currentTime;

          const isUrgent = priority === 'urgent' || priority === 'high';

          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);

          // Tone configuration based on priority
          const primaryFreq = isUrgent ? 1046.5 : 987.77; // C6 or B5
          const dropFreq = isUrgent ? 880.0 : 880.0;
          const peakGain = 0.08 * vol;

          oscillator.frequency.setValueAtTime(primaryFreq, now);
          oscillator.frequency.exponentialRampToValueAtTime(dropFreq, now + 0.08);

          gainNode.gain.setValueAtTime(0, now);
          gainNode.gain.linearRampToValueAtTime(peakGain, now + 0.02);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

          oscillator.start(now);
          oscillator.stop(now + 0.15);

          oscillator.onended = () => {
            try {
              oscillator.disconnect();
              gainNode.disconnect();
            } catch {
              /* noop */
            }
          };

          // Second harmonic chime
          setTimeout(() => {
            try {
              const osc2 = audioContext.createOscillator();
              const gain2 = audioContext.createGain();
              osc2.connect(gain2);
              gain2.connect(audioContext.destination);

              const secondFreq = isUrgent ? 1318.51 : 783.99; // E6 or G5
              osc2.frequency.setValueAtTime(secondFreq, audioContext.currentTime);
              gain2.gain.setValueAtTime(0, audioContext.currentTime);
              gain2.gain.linearRampToValueAtTime(0.06 * vol, audioContext.currentTime + 0.02);
              gain2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);

              osc2.start(audioContext.currentTime);
              osc2.stop(audioContext.currentTime + 0.12);
              osc2.onended = () => {
                try {
                  osc2.disconnect();
                  gain2.disconnect();
                } catch {
                  /* noop */
                }
              };
            } catch {
              /* ignore */
            }
          }, 65);
        } catch {
          logger.warn('Notifications', 'Audio playback prevented by browser policy');
        }
      },
    }),
    { name: 'al-zahra-sound-settings' }
  )
);
