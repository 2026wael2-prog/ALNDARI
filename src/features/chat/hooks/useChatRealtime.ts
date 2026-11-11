import { useEffect } from 'react';
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabaseClient';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../../auth/store';
import { useChatNotifications } from './useChatNotifications';
import { logger } from '../../../core/utils/logger';
import type { ChatMessage } from '../types';

interface ChatMessageRow {
  id: string;
  channel_id: string;
  sender_id: string;
  message_type: ChatMessage['message_type'];
  content: string;
  metadata: ChatMessage['metadata'];
  reply_to_id: string | null;
  client_message_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

interface ChannelMemberRow {
  channel_id: string;
  user_id: string;
  last_read_message_id: string | null;
}

const getInsertRow = (payload: any) => payload.new as ChatMessageRow | null;
const getUpdateRow = (payload: any) => payload.new as Partial<ChatMessageRow> & { id: string };

// In-memory profile cache for fast realtime rendering
const senderProfileCache = new Map<string, { full_name: string; avatar_url: string | null }>();
const SENDER_CACHE_LIMIT = 500;

/**
 * أحدث دالة إشعار متاحة للاشتراك القائم.
 *
 * القاعدة الحرجة: `notifyIncomingMessage` تُنشأ جديدة مع كل رسم (تعتمد على
 * `isSoundEnabled`) — وإدراجها في اعتماديات الـ effect كان يجعل **كل** تحديث
 * للمخزن (رسالة جديدة، مؤشر كتابة، تغيّر حضور) يهدم قناة الـ websocket ويعيد
 * إنشاءها ⇒ نافذة زمنية تضيع فيها الرسائل + حمل مضاعف على سوكت واحد.
 * الحل: نمرّر الدالة عبر متغيّر على مستوى الموديول، فيقرأه الاشتراك القائم
 * لحظة الحدث دون أن يُعاد بناؤه أبداً.
 */
let notifyIncoming: (
  senderName: string,
  messageText: string,
  channelId: string
) => void = (): void => {
  /* مُهيّأة عند تركيب أول مكوّن */
};

interface RealtimeSubscription {
  key: string;
  channel: ReturnType<typeof supabase.channel>;
  refCount: number;
}

/**
 * اشتراك مفرد على مستوى الموديول.
 * `useChatRealtime` يُركَّب من الودجت العائم (دائماً في MainLayout) ومن صفحة
 * المحادثات معاً؛ بلا هذا الحارس نُشترك مرتين ⇒ رسائل مكرّرة وصفير مزدوج.
 */
let activeSubscription: RealtimeSubscription | null = null;

const releaseSubscription = (key: string): void => {
  if (activeSubscription?.key !== key) return;
  activeSubscription.refCount -= 1;
  if (activeSubscription.refCount > 0) return;

  const { channel } = activeSubscription;
  activeSubscription = null;
  void supabase.removeChannel(channel);
};

const resolveSenderProfile = async (
  senderId: string
): Promise<{ full_name: string; avatar_url: string | null }> => {
  const cached = senderProfileCache.get(senderId);
  if (cached) return cached;

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', senderId)
      .single();

    const resolved = {
      full_name: profile?.full_name || 'موظف',
      avatar_url: profile?.avatar_url ?? null,
    };
    if (senderProfileCache.size >= SENDER_CACHE_LIMIT) senderProfileCache.clear();
    senderProfileCache.set(senderId, resolved);
    return resolved;
  } catch {
    return { full_name: 'موظف', avatar_url: null };
  }
};

export const useChatRealtime = () => {
  const { user } = useAuthStore();
  const { notifyIncomingMessage } = useChatNotifications();

  const companyId = user?.company_id ?? null;
  const userId = user?.id ?? null;

  // تحديث الإشعار المُشار إليه من الاشتراك القائم — بلا أي تغيير في الاعتماديات.
  useEffect(() => {
    notifyIncoming = notifyIncomingMessage;
  }, [notifyIncomingMessage]);

  useEffect(() => {
    if (!companyId || !userId) return;

    const key = `${companyId}:${userId}`;
    const getState = () => useChatStore.getState();

    // إعادة استخدام اشتراك قائم لنفس (المنشأة + المستخدم)
    if (activeSubscription?.key === key) {
      activeSubscription.refCount += 1;
      return () => {
        releaseSubscription(key);
      };
    }

    let hasSubscribedBefore = false;
    const channelName = `chat-realtime-${companyId}`;

    // لو تغيّرت المنشأة/المستخدم مع بقاء وسم قديم (تسجيل خروج/تبديل منشأة)
    // نزيل الوسم القديم قبل إنشاء الجديد لتفادي تسريب قناة معلّقة.
    if (activeSubscription && activeSubscription.key !== key) {
      const staleChannel = activeSubscription.channel;
      activeSubscription = null;
      void supabase.removeChannel(staleChannel);
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        async payload => {
          const row = getInsertRow(payload);
          if (!row) return;

          const state = getState();
          // تجاهل رسائل القنوات غير المعروفة لهذا المستخدم (بلا قناة معروضة
          // لا يوجد مكان تُعرض فيه، وتركها يضخّم الذاكرة بلا فائدة).
          const isKnownChannel = state.channels.some(ch => ch.id === row.channel_id);
          if (!isKnownChannel && state.activeChannelId !== row.channel_id) return;

          const sender = await resolveSenderProfile(row.sender_id);

          const message: ChatMessage = {
            id: row.id,
            channel_id: row.channel_id,
            sender_id: row.sender_id,
            message_type: row.message_type,
            content: row.content,
            metadata: row.metadata ?? {},
            reply_to_id: row.reply_to_id,
            client_message_id: row.client_message_id,
            created_at: row.created_at,
            edited_at: row.edited_at,
            deleted_at: row.deleted_at,
            sender_name: sender.full_name,
            sender_avatar: sender.avatar_url,
            reactions: [],
            attachments: [],
          };

          getState().addIncomingMessage(message, userId);

          // Unified beep + background desktop notification (with cooldown)
          if (row.sender_id !== userId) {
            notifyIncoming(sender.full_name, row.content || '', row.channel_id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
        },
        payload => {
          const row = getUpdateRow(payload);
          if (!row) return;
          const update: Partial<ChatMessage> = {};
          if (row.content !== undefined) update.content = row.content;
          if (row.metadata !== undefined) update.metadata = row.metadata;
          if (row.edited_at !== undefined) update.edited_at = row.edited_at;
          if (row.deleted_at !== undefined) update.deleted_at = row.deleted_at;
          getState().updateMessageInState(row.id, update);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_channels',
        },
        () => {
          // Refresh channels list when new channels are created or updated.
          getState().fetchChannels(companyId, userId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_channel_members',
        },
        payload => {
          // إيصالات القراءة: بدون هذا الاشتراك تبقى علامات (تم القراءة)
          // معلّقة حتى إعادة جلب القنوات يدوياً.
          const row = payload.new as ChannelMemberRow | null;
          if (row === null || row.user_id === userId) return;
          getState().applyPeerReadReceipt(row.user_id, row.last_read_message_id ?? null);
        }
      )
      .subscribe(status => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          logger.debug('ChatRealtime', `Connected to chat realtime channel [${channelName}]`);
          // If reconnected after initial connection, resync channels & messages
          if (hasSubscribedBefore) {
            const state = getState();
            state.fetchChannels(companyId, userId);
            if (state.activeChannelId) {
              state.fetchMessages(state.activeChannelId);
            }
          }
          hasSubscribedBefore = true;
          return;
        }

        if (
          status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
          status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
        ) {
          logger.error(
            'ChatRealtime',
            `Realtime channel unavailable (${status}); awaiting automatic reconnect`
          );
        }
      });

    activeSubscription = { key, channel, refCount: 1 };

    return () => {
      releaseSubscription(key);
    };
  }, [companyId, userId]);
};
