import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * اختبارات سلامة منطق المحادثة في المخزن — أخطر ملف في الميزة (كان بلا تغطية).
 * تغطي: الإرسال المتفائل وإزالة التكرار والتراجع، مؤشّر الترقيم المركّب،
 * إيصالات القراءة، وتحديث الرسالة دون إعادة بناء بقية القنوات.
 */
const { service } = vi.hoisted(() => ({
  service: {
    getChannels: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    uploadAttachment: vi.fn(),
    markAsRead: vi.fn(),
    toggleReaction: vi.fn(),
    pinMessage: vi.fn(),
    deleteMessage: vi.fn(),
    executeAction: vi.fn(),
  },
}));

vi.mock('../services/chatService', () => ({ chatService: service }));
vi.mock('../../../core/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() },
}));

import { useChatStore } from './chatStore';
import type { ChatChannel, ChatMessage } from '../types';

const message = (id: string, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  channel_id: 'ch-1',
  sender_id: 'user-1',
  message_type: 'text',
  content: `نص ${id}`,
  metadata: {},
  reply_to_id: null,
  created_at: '2026-11-05T08:00:00.000Z',
  ...overrides,
});

const directChannel = (id: string, peerId: string): ChatChannel => ({
  id,
  company_id: 'comp-1',
  type: 'direct',
  name: 'محادثة مباشرة',
  is_private: true,
  created_at: '2026-11-05T08:00:00.000Z',
  updated_at: '2026-11-05T08:00:00.000Z',
  unread_count: 0,
  direct_user: { id: peerId, full_name: 'طرف مقابل' },
  peer_last_read_message_id: null,
});

const groupChannel = (id: string): ChatChannel => ({
  id,
  company_id: 'comp-1',
  type: 'branch',
  name: 'قناة الفرع',
  is_private: false,
  created_at: '2026-11-05T08:00:00.000Z',
  updated_at: '2026-11-05T08:00:00.000Z',
  unread_count: 0,
});

const resetStore = () => {
  useChatStore.setState({
    activeChannelId: null,
    channels: [],
    messagesByChannel: {},
    hasMoreMessages: {},
    isLoadingChannels: false,
    isLoadingMessages: false,
    isLoadingMoreMessages: false,
    replyingTo: null,
    activeEntityAttachment: null,
    presences: {},
    typingUsers: {},
  });
};

describe('chatStore — سلامة الإرسال والترقيم وإيصالات القراءة', () => {
  beforeEach(() => {
    resetStore();
    Object.values(service).forEach(fn => fn.mockReset());
  });

  it('يستخدم مؤشّر ترقيم مركّباً بالمعرّف فقط عند تحميل رسائل أقدم', async () => {
    useChatStore.setState({
      activeChannelId: 'ch-1',
      messagesByChannel: { 'ch-1': [message('m-oldest')] },
      hasMoreMessages: { 'ch-1': true },
    });
    service.getMessages.mockResolvedValue([message('m-older')]);

    await useChatStore.getState().fetchMessages('ch-1', true);

    expect(service.getMessages).toHaveBeenCalledWith('ch-1', 30, undefined, 'm-oldest');
    expect(useChatStore.getState().messagesByChannel['ch-1'].map(m => m.id)).toEqual([
      'm-older',
      'm-oldest',
    ]);
  });

  it('يعرض الرسالة فوراً (متفائلة) ثم يستبدلها بالمؤكَّدة من الخادم', async () => {
    service.sendMessage.mockResolvedValue(message('srv-1', { client_message_id: 'cid-1' }));

    const pending = useChatStore
      .getState()
      .sendMessage({ channel_id: 'ch-1', content: 'مرحباً', client_message_id: 'cid-1' }, 'user-1');

    const optimistic = useChatStore.getState().messagesByChannel['ch-1'];
    expect(optimistic).toHaveLength(1);
    expect(optimistic[0].is_optimistic).toBe(true);

    await pending;

    const confirmed = useChatStore.getState().messagesByChannel['ch-1'];
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].id).toBe('srv-1');
    expect(confirmed[0].is_optimistic).toBe(false);
  });

  it('يتراجع عن الرسالة المتفائلة ويعيد رمي الخطأ عند فشل الإرسال', async () => {
    service.sendMessage.mockRejectedValue(new Error('عذراً، لا تمتلك صلاحية الإرسال'));

    await expect(
      useChatStore.getState().sendMessage({ channel_id: 'ch-1', content: 'مرحباً' }, 'user-1')
    ).rejects.toThrow('عذراً، لا تمتلك صلاحية الإرسال');

    expect(useChatStore.getState().messagesByChannel['ch-1']).toHaveLength(0);
  });

  it('لا يكرّر الرسالة عند وصول صدى الـ realtime بعد التأكيد', async () => {
    service.sendMessage.mockResolvedValue(message('srv-1', { client_message_id: 'cid-1' }));
    await useChatStore
      .getState()
      .sendMessage({ channel_id: 'ch-1', content: 'مرحباً', client_message_id: 'cid-1' }, 'user-1');

    useChatStore
      .getState()
      .addIncomingMessage(message('srv-1', { client_message_id: 'cid-1' }), 'user-1');

    expect(useChatStore.getState().messagesByChannel['ch-1']).toHaveLength(1);
  });

  it('يزيل الفقاعة المتفائلة عند وصول الصدى قبل تأكيد الخادم', async () => {
    let resolveSend: (value: ChatMessage) => void = () => undefined;
    service.sendMessage.mockReturnValue(
      new Promise<ChatMessage>(resolve => {
        resolveSend = resolve;
      })
    );

    const pending = useChatStore
      .getState()
      .sendMessage({ channel_id: 'ch-1', content: 'مرحباً', client_message_id: 'cid-1' }, 'user-1');

    useChatStore
      .getState()
      .addIncomingMessage(message('srv-1', { client_message_id: 'cid-1' }), 'user-1');
    expect(useChatStore.getState().messagesByChannel['ch-1'].map(m => m.id)).toEqual(['srv-1']);

    resolveSend(message('srv-1', { client_message_id: 'cid-1' }));
    await pending;

    expect(useChatStore.getState().messagesByChannel['ch-1'].map(m => m.id)).toEqual(['srv-1']);
  });

  it('يحدّث إيصال قراءة الطرف المقابل في القناة المباشرة فقط', () => {
    useChatStore.setState({ channels: [directChannel('ch-d', 'peer-1'), groupChannel('ch-g')] });

    useChatStore.getState().applyPeerReadReceipt('peer-1', 'm-5');

    const channels = useChatStore.getState().channels;
    expect(channels[0].peer_last_read_message_id).toBe('m-5');
    expect(channels[1].peer_last_read_message_id).toBeUndefined();
  });

  it('لا يعيد بناء مصفوفة القنوات عند وصول إيصال قراءة مكرّر', () => {
    useChatStore.setState({ channels: [directChannel('ch-d', 'peer-1')] });
    useChatStore.getState().applyPeerReadReceipt('peer-1', 'm-5');

    const before = useChatStore.getState().channels;
    useChatStore.getState().applyPeerReadReceipt('peer-1', 'm-5');

    expect(useChatStore.getState().channels).toBe(before);
  });

  it('يحدّث الرسالة في قناتها فقط دون إعادة بناء بقية القنوات', () => {
    useChatStore.setState({
      messagesByChannel: {
        'ch-1': [message('m-a')],
        'ch-2': [message('m-b', { channel_id: 'ch-2' })],
      },
    });
    const otherChannelBefore = useChatStore.getState().messagesByChannel['ch-2'];

    useChatStore.getState().updateMessageInState('m-a', { content: 'نص معدّل' });

    const messages = useChatStore.getState().messagesByChannel;
    expect(messages['ch-1'][0].content).toBe('نص معدّل');
    expect(messages['ch-2']).toBe(otherChannelBefore);
  });

  it('يتجاهل تحديث رسالة غير موجودة دون تغيير الحالة', () => {
    useChatStore.setState({ messagesByChannel: { 'ch-1': [message('m-a')] } });
    const before = useChatStore.getState().messagesByChannel;

    useChatStore.getState().updateMessageInState('missing', { content: 'x' });

    expect(useChatStore.getState().messagesByChannel).toBe(before);
  });
});
