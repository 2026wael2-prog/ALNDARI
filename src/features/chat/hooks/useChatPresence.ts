import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabaseClient';
import { useChatStore } from '../stores/chatStore';
import type { UserPresence } from '../types';
import { useAuthStore } from '../../auth/store';
import { logger } from '../../../core/utils/logger';
import { parseError } from '../../../core/utils/errorUtils';

/**
 * نوع (type) لا واجهة (interface) عن قصد: `presenceState<T>()` و`on<T>('presence', …)`
 * يشترطان فهرساً ضمنياً `[key: string]: any` وهذا لا يتحقق إلا للأنواع الحرفية.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- needs implicit index signature
type PresencePayload = {
  user_id: string;
  full_name: string;
  avatar_url?: string | null;
  status?: 'online' | 'away' | 'busy' | 'offline';
  branch_id?: string | null;
  branch_name?: string | null;
  last_seen_at?: string;
  typing_in_channel_id?: string | null;
};

/** الحالة التي نُبثّها للآخرين — تُقرأ عند لحظة الاشتراك وعند أي تغيير في الملف الشخصي. */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- channel.track() needs implicit index signature
type PresenceTrackPayload = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  status: 'online';
  branch_id: string | null;
  branch_name: string | null;
  last_seen_at: string;
};

interface TypingBroadcast {
  channel_id: string;
  user_id: string;
  user_name: string;
  is_typing: boolean;
}

type PresenceChannel = ReturnType<typeof supabase.channel>;

interface PresenceSession {
  channelName: string;
  userId: string;
  channel: PresenceChannel;
  refCount: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toUserPresence = (p: PresencePayload, status: UserPresence['status']): UserPresence => ({
  user_id: p.user_id,
  full_name: p.full_name,
  avatar_url: p.avatar_url ?? null,
  status: p.status ?? status,
  branch_id: p.branch_id ?? null,
  branch_name: p.branch_name ?? null,
  last_seen_at: p.last_seen_at ?? new Date().toISOString(),
  typing_in_channel_id: p.typing_in_channel_id ?? null,
});

/** حمولة البثّ تصل مجهولة من مكتبة realtime — نُثبّتها قبل الاستخدام. */
const readTypingBroadcast = (payload: unknown): TypingBroadcast | null => {
  if (!isRecord(payload)) return null;
  const channelId = payload.channel_id;
  const senderId = payload.user_id;
  if (typeof channelId !== 'string' || typeof senderId !== 'string') return null;
  const senderName = payload.user_name;
  return {
    channel_id: channelId,
    user_id: senderId,
    user_name: typeof senderName === 'string' && senderName.length > 0 ? senderName : 'موظف',
    is_typing: payload.is_typing === true,
  };
};

/**
 * قناة حضور واحدة لكل منشأة، مشتركة بين كل من يركّب الخطاف.
 *
 * `supabase.channel(topic)` لا تُنشئ قناة جديدة إن وُجدت قناة مسجَّلة بنفس الـtopic،
 * بل تُعيد القائمة نفسها؛ وإضافة معالج `presence` عليها بعد `subscribe()` ترمي:
 * `cannot add presence callbacks for realtime:… after subscribe()`. هذا ما كان يُسقِط
 * شجرة المحادثة بالكامل عند إعادة التركيب (StrictMode / إعادة محاولة ErrorBoundary).
 *
 * الحل: قناة واحدة بعدّاد مراجع، وإنشاء مُسلسل (`enqueue`) لا يبدأ قبل أن تفرغ القناة
 * السابقة تماماً من سجل العميل، فلا تُضاف معالجات على قناة مشتركة أو قيد الإلغاء.
 */
let presenceSession: PresenceSession | null = null;
let presenceQueue: Promise<unknown> = Promise.resolve();
let currentTrackPayload: PresenceTrackPayload | null = null;

const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
  const run = presenceQueue.then(task, task);
  presenceQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};

/** بثّ الحضور — يُتجاهل قبل `joined` لأن realtime يتحوّل تلقائياً إلى REST حينها. */
const trackPresence = (channel: PresenceChannel): void => {
  if (!currentTrackPayload || channel.state !== 'joined') return;
  channel.track(currentTrackPayload).catch((error: unknown) => {
    logger.warn('ChatPresence', 'فشل بث حالة الحضور', { reason: parseError(error).message });
  });
};

const createPresenceChannel = (channelName: string, userId: string): PresenceChannel => {
  const channel = supabase.channel(channelName, { config: { presence: { key: userId } } });

  channel
    .on('presence', { event: 'sync' }, () => {
      for (const presences of Object.values(channel.presenceState<PresencePayload>())) {
        if (presences.length === 0) continue;
        useChatStore.getState().setUserPresence(toUserPresence(presences[0], 'online'));
      }
    })
    .on<PresencePayload>('presence', { event: 'join' }, ({ newPresences }) => {
      for (const presence of newPresences) {
        useChatStore.getState().setUserPresence(toUserPresence(presence, 'online'));
      }
    })
    .on<PresencePayload>('presence', { event: 'leave' }, ({ leftPresences }) => {
      for (const presence of leftPresences) {
        useChatStore.getState().setUserPresence(toUserPresence(presence, 'offline'));
      }
    })
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      const typing = readTypingBroadcast(payload);
      if (!typing || typing.user_id === userId) return;
      useChatStore.getState().setTyping(typing.channel_id, typing.user_name, typing.is_typing);
    })
    .subscribe(status => {
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) trackPresence(channel);
    });

  return channel;
};

/**
 * الحصول على القناة المشتركة. المعالجات تُضاف عند الإنشاء الفعلي فقط، وإعادة الاستخدام
 * تحدث لنفس (المنشأة + المستخدم) حتى لا يبقى مفتاح حضور يخص مستخدماً سابقاً.
 */
const acquireSession = (channelName: string, userId: string): Promise<PresenceSession> =>
  enqueue(async () => {
    const existing = presenceSession;
    if (existing?.channelName === channelName && existing.userId === userId) {
      existing.refCount += 1;
      return existing;
    }

    if (existing) {
      presenceSession = null;
      existing.refCount = 0;
      await supabase.removeChannel(existing.channel);
    }

    // قناة يتيمة بنفس الـtopic (من تركيب سابق أو مسار آخر) — تُزال قبل الإنشاء
    const orphan = supabase.getChannels().find(entry => entry.topic === `realtime:${channelName}`);
    if (orphan) await supabase.removeChannel(orphan);

    const session: PresenceSession = {
      channelName,
      userId,
      channel: createPresenceChannel(channelName, userId),
      refCount: 1,
    };
    presenceSession = session;
    return session;
  });

/** تحرير مرجع؛ الإزالة الفعلية تُنفَّذ في الطابور بعد أن يهبط العدّاد إلى صفر. */
const releaseSession = (session: PresenceSession): void => {
  session.refCount = Math.max(0, session.refCount - 1);
  if (session.refCount > 0) return;

  void enqueue(async () => {
    if (session.refCount > 0) return;
    if (presenceSession === session) presenceSession = null;
    await supabase.removeChannel(session.channel);
  }).catch((error: unknown) => {
    logger.warn('ChatPresence', 'فشل إزالة قناة الحضور', { reason: parseError(error).message });
  });
};

interface PresenceProfile {
  userId: string | undefined;
  userName: string;
  avatarUrl: string | null;
  branchId: string | null | undefined;
  branchName: string | null | undefined;
}

/** اسم العرض مع بديل عربي — بلا سلاسل `||` تخلط null بسلسلة فارغة. */
const readDisplayName = (
  fullName: string | null | undefined,
  email: string | null | undefined
): string => {
  if (typeof fullName === 'string' && fullName.trim().length > 0) return fullName;
  if (typeof email === 'string' && email.trim().length > 0) return email;
  return 'موظف';
};

/** يحدّث حمولة الحضور المبثوثة عند تغيّر الملف الشخصي دون إعادة اشتراك. */
const usePresenceTrackPayload = ({
  userId,
  userName,
  avatarUrl,
  branchId,
  branchName,
}: PresenceProfile): void => {
  useEffect(() => {
    if (userId === undefined) {
      currentTrackPayload = null;
      return;
    }

    currentTrackPayload = {
      user_id: userId,
      full_name: userName,
      avatar_url: avatarUrl,
      status: 'online',
      branch_id: branchId ?? null,
      branch_name: branchName ?? null,
      last_seen_at: new Date().toISOString(),
    };

    // تغيّر الاسم/الفرع/الصورة لا يستلزم إعادة اشتراك — تحديث الحالة يكفي
    if (presenceSession?.userId === userId) trackPresence(presenceSession.channel);
  }, [userId, userName, avatarUrl, branchId, branchName]);
};

/** دورة حياة قناة الحضور المشتركة: اشتراك واحد بعدّاد مراجع، بلا تكرار عند إعادة التركيب. */
const usePresenceChannelLifecycle = (
  companyId: string | undefined,
  userId: string | undefined,
  channelRef: RefObject<PresenceChannel | null>
): void => {
  useEffect(() => {
    if (companyId === undefined || userId === undefined) return;

    const channelName = `chat-presence-${companyId}`;
    let disposed = false;
    let acquired: PresenceSession | null = null;

    void acquireSession(channelName, userId)
      .then(session => {
        if (disposed) {
          releaseSession(session);
          return;
        }
        acquired = session;
        channelRef.current = session.channel;
      })
      .catch((error: unknown) => {
        logger.warn('ChatPresence', 'فشل تجهيز قناة الحضور', { reason: parseError(error).message });
      });

    return () => {
      disposed = true;
      channelRef.current = null;
      if (acquired !== null) releaseSession(acquired);
    };
  }, [companyId, userId, channelRef]);
};

/** إرسال إشارة الكتابة فقط على قناة مُشتركة فعلاً (قبل `joined` يتحوّل realtime إلى REST). */
const sendTypingSignal = (channel: PresenceChannel | null, payload: TypingBroadcast): void => {
  if (channel?.state !== 'joined') return;
  void channel.send({ type: 'broadcast', event: 'typing', payload });
};

/** تنظيف مؤقّت "توقّف الكتابة" عند مغادرة الشاشة. */
const useTypingTimerCleanup = (
  timerRef: RefObject<ReturnType<typeof setTimeout> | null>
): void => {
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [timerRef]
  );
};

export const useChatPresence = (
  activeChannelId?: string | null
): { broadcastTyping: (isTyping: boolean) => void } => {
  const { user } = useAuthStore();
  const presenceChannelRef = useRef<PresenceChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const companyId = user?.company_id;
  const userId = user?.id;
  const userName = readDisplayName(user?.full_name, user?.email);

  usePresenceTrackPayload({
    userId,
    userName,
    avatarUrl: user?.avatar_url ?? null,
    branchId: user?.branch_id,
    branchName: user?.branch_name,
  });

  usePresenceChannelLifecycle(companyId, userId, presenceChannelRef);
  useTypingTimerCleanup(typingTimeoutRef);

  const broadcastTyping = useCallback(
    (isTyping: boolean) => {
      if (activeChannelId === undefined || activeChannelId === null || userId === undefined) return;

      const payload: TypingBroadcast = {
        channel_id: activeChannelId,
        user_id: userId,
        user_name: userName,
        is_typing: isTyping,
      };

      if (typingTimeoutRef.current !== null) clearTimeout(typingTimeoutRef.current);
      sendTypingSignal(presenceChannelRef.current, payload);
      if (!isTyping) return;

      // إيقاف تلقائي بعد ٣ ثوانٍ من الصمت
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingSignal(presenceChannelRef.current, { ...payload, is_typing: false });
      }, 3000);
    },
    [activeChannelId, userId, userName]
  );

  return { broadcastTyping };
};
