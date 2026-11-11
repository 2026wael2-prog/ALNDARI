import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ChatChannel,
  ChatMessage,
  SendMessagePayload,
  EntityCardMetadata,
  UserPresence,
} from '../types';
import { chatService } from '../services/chatService';
import { logger } from '../../../core/utils/logger';

interface ChatState {
  // Navigation & Active selection
  activeChannelId: string | null;
  activeFilter: 'all' | 'branch' | 'direct' | 'topic' | 'contextual';
  searchQuery: string;

  // Channels state
  channels: ChatChannel[];
  isLoadingChannels: boolean;

  // Messages state: Record<channelId, ChatMessage[]>
  messagesByChannel: Record<string, ChatMessage[]>;
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;
  hasMoreMessages: Record<string, boolean>;

  // Composer & UI state
  replyingTo: ChatMessage | null;
  activeEntityAttachment: EntityCardMetadata | null;
  isFloatingOpen: boolean;
  isFloatingMinimized: boolean;

  // Presence & Typing state
  presences: Record<string, UserPresence>;
  typingUsers: Record<string, string[]>; // channelId -> array of full_names

  // Actions
  setActiveChannel: (channelId: string | null) => void;
  setActiveFilter: (filter: 'all' | 'branch' | 'direct' | 'topic' | 'contextual') => void;
  setSearchQuery: (query: string) => void;
  setReplyingTo: (message: ChatMessage | null) => void;
  setActiveEntityAttachment: (entity: EntityCardMetadata | null) => void;
  setFloatingOpen: (open: boolean) => void;
  toggleFloatingMinimized: () => void;

  // Data Actions
  fetchChannels: (companyId: string, userId: string) => Promise<void>;
  fetchMessages: (channelId: string, loadMore?: boolean) => Promise<void>;
  sendMessage: (
    payload: SendMessagePayload,
    currentUserId: string,
    currentUserName?: string,
    file?: File | null,
    companyId?: string
  ) => Promise<void>;
  addIncomingMessage: (message: ChatMessage, currentUserId: string) => void;
  updateMessageInState: (messageId: string, updates: Partial<ChatMessage>) => void;
  applyPeerReadReceipt: (peerUserId: string, lastReadMessageId: string | null) => void;
  markChannelAsRead: (channelId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string, userId: string) => Promise<void>;
  pinMessage: (messageId: string, userId: string, isPinned: boolean) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  executeAction: (
    messageId: string,
    action: 'approve' | 'reject' | 'cancel',
    notes?: string
  ) => Promise<void>;

  // Presence actions
  setUserPresence: (presence: UserPresence) => void;
  setTyping: (channelId: string, userName: string, isTyping: boolean) => void;

  // Total computed unread count
  getTotalUnreadCount: () => number;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      activeChannelId: null,
      activeFilter: 'all',
      searchQuery: '',

      channels: [],
      isLoadingChannels: false,

      messagesByChannel: {},
      isLoadingMessages: false,
      isLoadingMoreMessages: false,
      hasMoreMessages: {},

      replyingTo: null,
      activeEntityAttachment: null,
      isFloatingOpen: false,
      isFloatingMinimized: false,

      presences: {},
      typingUsers: {},

      setActiveChannel: channelId => {
        set({ activeChannelId: channelId, replyingTo: null });
        if (channelId) {
          get().fetchMessages(channelId);
          get().markChannelAsRead(channelId);
        }
      },

      setActiveFilter: filter => set({ activeFilter: filter }),
      setSearchQuery: query => set({ searchQuery: query }),
      setReplyingTo: message => set({ replyingTo: message }),
      setActiveEntityAttachment: entity => set({ activeEntityAttachment: entity }),
      setFloatingOpen: open => set({ isFloatingOpen: open }),
      toggleFloatingMinimized: () => set(s => ({ isFloatingMinimized: !s.isFloatingMinimized })),

      fetchChannels: async (companyId, userId) => {
        if (!companyId || !userId) return;
        set({ isLoadingChannels: true });
        try {
          const channels = await chatService.getChannels(companyId, userId);
          set({ channels, isLoadingChannels: false });
        } catch (err) {
          logger.error('ChatStore', 'Failed to fetch channels', err);
          set({ isLoadingChannels: false });
        }
      },

      fetchMessages: async (channelId, loadMore = false) => {
        if (!channelId) return;

        const currentMessages = get().messagesByChannel[channelId] || [];
        try {
          if (loadMore) {
            if (get().isLoadingMoreMessages || !get().hasMoreMessages[channelId]) return;
            set({ isLoadingMoreMessages: true });
            const oldestMessage = currentMessages[0];
            // مؤشّر مركّب: نعتمد المعرّف فقط (الخدمة تجلب طابع الرسالة المرجعية
            // وتبني شرط (created_at, id) معاً). تمرير الطابع الزمني وحده كان
            // يُلغي فرع المؤشّر المركّب داخل الخدمة ⇒ فقدان صامت للرسائل التي
            // تتشارك نفس الطابع الزمني (بذر بيانات أو إرسال دفعة واحدة).
            const older = await chatService.getMessages(
              channelId,
              30,
              undefined,
              oldestMessage?.id
            );
            set(state => ({
              messagesByChannel: {
                ...state.messagesByChannel,
                [channelId]: [...older, ...(state.messagesByChannel[channelId] || [])],
              },
              hasMoreMessages: {
                ...state.hasMoreMessages,
                [channelId]: older.length >= 30,
              },
              isLoadingMoreMessages: false,
            }));
          } else {
            set({ isLoadingMessages: true });
            const messages = await chatService.getMessages(channelId, 40);
            set(state => ({
              messagesByChannel: {
                ...state.messagesByChannel,
                [channelId]: messages,
              },
              hasMoreMessages: {
                ...state.hasMoreMessages,
                [channelId]: messages.length >= 40,
              },
              isLoadingMessages: false,
            }));
          }
        } catch (err) {
          // سلامة الرفض: الخدمة تعيد رمي الرفض المُفسَّر — نسجّله هنا لمنع unhandled rejection
          logger.error('ChatStore', 'Failed to fetch messages', err);
          set({ isLoadingMessages: false, isLoadingMoreMessages: false });
        }
      },

      sendMessage: async (payload, currentUserId, currentUserName, file, companyId) => {
        const tempId = `temp_${Date.now()}`;
        // مفتاح عدم التكرار يُنشأ هنا (مصدر واحد) ويُمرَّر للخدمة ليعيد استخدامه،
        // وبذلك تحمله الرسالة المتفائلة أيضاً. بلا ذلك كان صدى الـ realtime يصِل
        // بمعرّف عميل لا تعرفه الفقاعة المتفائلة ⇒ فقاعتان مكرّرتان لنفس الرسالة.
        const clientMessageId =
          payload.client_message_id ??
          `msg_${String(Date.now())}_${Math.random().toString(36).slice(2, 9)}`;
        const outgoingPayload: SendMessagePayload = {
          ...payload,
          client_message_id: clientMessageId,
        };

        const optimisticMessage: ChatMessage = {
          id: tempId,
          channel_id: outgoingPayload.channel_id,
          sender_id: currentUserId,
          message_type: outgoingPayload.message_type || 'text',
          content: outgoingPayload.content,
          metadata: outgoingPayload.metadata || {},
          reply_to_id: outgoingPayload.reply_to_id || null,
          client_message_id: clientMessageId,
          created_at: new Date().toISOString(),
          sender_name: currentUserName || 'أنت',
          is_optimistic: true,
          attachments: file
            ? [
                {
                  id: `temp_att_${Date.now()}`,
                  message_id: tempId,
                  company_id: companyId || '',
                  storage_path: '',
                  file_name: file.name,
                  mime_type: file.type,
                  file_size: file.size,
                  uploaded_by: currentUserId,
                  created_at: new Date().toISOString(),
                },
              ]
            : [],
        };

        // 1. Optimistic Update
        set(state => ({
          messagesByChannel: {
            ...state.messagesByChannel,
            [outgoingPayload.channel_id]: [
              ...(state.messagesByChannel[outgoingPayload.channel_id] || []),
              optimisticMessage,
            ],
          },
          replyingTo: null,
          activeEntityAttachment: null,
        }));

        try {
          // 2. Network Send
          const confirmed = await chatService.sendMessage(outgoingPayload);
          if (confirmed) {
            let uploadedAttachment = null;
            if (file && companyId) {
              try {
                uploadedAttachment = await chatService.uploadAttachment(
                  companyId,
                  confirmed.id,
                  file
                );
              } catch (uploadErr) {
                logger.error('ChatStore', 'Attachment upload failed', uploadErr);
              }
            }

            set(state => {
              const currentList = state.messagesByChannel[outgoingPayload.channel_id] || [];
              const updatedList: ChatMessage[] = currentList.map(m =>
                m.id === tempId
                  ? {
                      ...confirmed,
                      is_optimistic: false,
                      sender_name: currentUserName || 'أنت',
                      attachments: uploadedAttachment
                        ? [uploadedAttachment]
                        : confirmed.attachments || [],
                    }
                  : m
              );
              return {
                messagesByChannel: {
                  ...state.messagesByChannel,
                  [outgoingPayload.channel_id]: updatedList,
                },
              };
            });
          }
        } catch (err) {
          logger.error('ChatStore', 'Error sending message', err);
          // Revert optimistic on error
          set(state => ({
            messagesByChannel: {
              ...state.messagesByChannel,
              [outgoingPayload.channel_id]: (
                state.messagesByChannel[outgoingPayload.channel_id] || []
              ).filter(m => m.id !== tempId),
            },
          }));
          throw err;
        }
      },

      addIncomingMessage: (message, currentUserId) => {
        // Idempotency: realtime duplicates (multi-mount) or echo of own optimistic send
        const existing = get().messagesByChannel[message.channel_id] || [];
        if (existing.some(m => m.id === message.id)) return;
        const withoutOptimistic = existing.filter(
          m =>
            !(
              m.is_optimistic &&
              m.sender_id === message.sender_id &&
              (m.client_message_id === message.client_message_id ||
                (!m.client_message_id &&
                  !message.client_message_id &&
                  m.content === message.content))
            )
        );
        set(state => {
          const channelList = withoutOptimistic;
          // Avoid duplicate insertion
          if (
            channelList.some(
              m =>
                m.id === message.id ||
                (m.client_message_id && m.client_message_id === message.client_message_id)
            )
          ) {
            return state;
          }

          const isCurrentActive = state.activeChannelId === message.channel_id;

          // Update channels list last message and unread count
          const updatedChannels = state.channels.map(ch => {
            if (ch.id === message.channel_id) {
              const newUnread =
                !isCurrentActive && message.sender_id !== currentUserId
                  ? (ch.unread_count || 0) + 1
                  : ch.unread_count || 0;
              return {
                ...ch,
                last_message: message,
                unread_count: newUnread,
                updated_at: message.created_at,
              };
            }
            return ch;
          });

          // Sort channels so the most recently updated appears on top
          updatedChannels.sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );

          return {
            channels: updatedChannels,
            messagesByChannel: {
              ...state.messagesByChannel,
              [message.channel_id]: [...channelList, message],
            },
          };
        });

        // Automatically mark as read if currently open
        if (get().activeChannelId === message.channel_id && message.sender_id !== currentUserId) {
          get().markChannelAsRead(message.channel_id);
        }
      },

      updateMessageInState: (messageId, updates) => {
        set(state => {
          // حدِّد القناة التي تحتوي الرسالة أولاً، ثم حدِّث قناتها وحدها.
          // المرور على كل القنوات (بنسخ كل مصفوفة) كان O(كل الرسائل المحمّلة)
          // لكل حدث واقعي عبر الـ realtime، أي إهدار واضح في المحادثات الطويلة.
          const targetChannelId = Object.keys(state.messagesByChannel).find(channelId =>
            state.messagesByChannel[channelId].some(m => m.id === messageId)
          );
          if (targetChannelId === undefined) return state;

          const channelMessages = state.messagesByChannel[targetChannelId];
          const updatedMessages = channelMessages.map(m =>
            m.id === messageId ? { ...m, ...updates } : m
          );

          return {
            messagesByChannel: {
              ...state.messagesByChannel,
              [targetChannelId]: updatedMessages,
            },
          };
        });
      },

      applyPeerReadReceipt: (peerUserId, lastReadMessageId) => {
        set(state => {
          // القناة المباشرة فريدة لكل زوج مستخدمين (محمية بـ pg_advisory_lock
          // داخل RPC)، لذا يكفي مطابقة الطرف المقابل لتحديد القناة المستهدفة.
          let changed = false;
          const channels = state.channels.map(ch => {
            if (ch.type !== 'direct' || ch.direct_user?.id !== peerUserId) return ch;
            if (ch.peer_last_read_message_id === lastReadMessageId) return ch;
            changed = true;
            return { ...ch, peer_last_read_message_id: lastReadMessageId };
          });

          // إرجاع `state` نفسها عند عدم التغيير يمنع إعادة رسم بلا داعٍ.
          return changed ? { channels } : state;
        });
      },

      markChannelAsRead: async channelId => {
        set(state => ({
          channels: state.channels.map(ch =>
            ch.id === channelId ? { ...ch, unread_count: 0 } : ch
          ),
        }));
        await chatService.markAsRead(channelId);
      },

      toggleReaction: async (messageId, emoji, userId) => {
        const activeChannel = get().activeChannelId;
        if (!activeChannel) return;
        const currentMessages = get().messagesByChannel[activeChannel] || [];
        const msg = currentMessages.find(m => m.id === messageId);
        if (!msg) return;

        await chatService.toggleReaction(messageId, emoji, msg.reactions || [], userId);
      },

      pinMessage: async (messageId, userId, isPinned) => {
        await chatService.pinMessage(messageId, userId, isPinned);
        get().updateMessageInState(messageId, {
          pinned_at: isPinned ? new Date().toISOString() : null,
          pinned_by: isPinned ? userId : null,
        });
      },

      deleteMessage: async messageId => {
        await chatService.deleteMessage(messageId);
        const activeChannel = get().activeChannelId;
        if (activeChannel) {
          set(state => ({
            messagesByChannel: {
              ...state.messagesByChannel,
              [activeChannel]: (state.messagesByChannel[activeChannel] || []).filter(
                m => m.id !== messageId
              ),
            },
          }));
        }
      },

      executeAction: async (messageId, action, notes) => {
        const res = await chatService.executeAction(messageId, action, notes);
        if (res.success) {
          get().updateMessageInState(messageId, {
            metadata: {
              ...(get().messagesByChannel[get().activeChannelId || '']?.find(
                m => m.id === messageId
              )?.metadata || {}),
              action_status: res.status,
              action_notes: notes,
            },
          });
        }
      },

      setUserPresence: presence => {
        set(state => ({
          presences: {
            ...state.presences,
            [presence.user_id]: presence,
          },
        }));
      },

      setTyping: (channelId, userName, isTyping) => {
        set(state => {
          const currentTyping = state.typingUsers[channelId] || [];
          const updated = isTyping
            ? Array.from(new Set([...currentTyping, userName]))
            : currentTyping.filter(name => name !== userName);
          return {
            typingUsers: {
              ...state.typingUsers,
              [channelId]: updated,
            },
          };
        });
      },

      getTotalUnreadCount: () => {
        return get().channels.reduce((sum, ch) => sum + (ch.unread_count || 0), 0);
      },
    }),
    {
      name: 'alzhra-chat-preferences',
      partialize: state => ({
        isFloatingMinimized: state.isFloatingMinimized,
        activeFilter: state.activeFilter,
      }),
    }
  )
);
