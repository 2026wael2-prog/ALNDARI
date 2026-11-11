import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook, cleanup } from '@testing-library/react';

/**
 * Regression guard for the "رسائل تضيع + حمل مضاعف على الـ websocket" defect.
 *
 * السبب: `notifyIncomingMessage` تُنشأ جديدة مع كل رسم، وكانت ضمن اعتماديات
 * effect الاشتراك في `useChatRealtime` ⇒ كل تحديث للمخزن (رسالة/كتابة/حضور)
 * يهدم قناة الـ realtime ويعيد إنشاءها. الحل: اعتماديات مستقرة + قناة مفردة
 * على مستوى الموديول مع عدّاد مرجعي.
 */
const { realtime, chatState, authState, notifySpy } = vi.hoisted(() => {
  interface Handler {
    type: string;
    filter: Record<string, unknown>;
    cb: (payload: unknown) => void;
  }

  class FakeChannel {
    readonly topic: string;
    handlers: Handler[] = [];
    statusCb: ((status: string) => void) | null = null;

    constructor(topic: string) {
      this.topic = topic;
    }

    on(type: string, filter: Record<string, unknown>, cb: (payload: unknown) => void): this {
      this.handlers.push({ type, filter, cb });
      return this;
    }

    subscribe(cb?: (status: string) => void): this {
      this.statusCb = cb ?? null;
      if (cb) cb('SUBSCRIBED');
      return this;
    }
  }

  const created: FakeChannel[] = [];

  const supabaseLike = {
    channel: vi.fn((topic: string) => {
      const channel = new FakeChannel(topic);
      created.push(channel);
      return channel;
    }),
    removeChannel: vi.fn(() => Promise.resolve('ok')),
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { full_name: 'سالم اليماني', avatar_url: null } }),
        }),
      }),
    })),
  };

  const authUser = { id: 'user-1', company_id: 'comp-1' };
  const authState: { user: typeof authUser | null } = { user: authUser };

  return {
    realtime: { created, supabaseLike },
    authState,
    chatState: {
      channels: [] as Array<{ id: string }>,
      activeChannelId: null as string | null,
      addIncomingMessage: vi.fn(),
      updateMessageInState: vi.fn(),
      fetchChannels: vi.fn(),
      fetchMessages: vi.fn(),
      applyPeerReadReceipt: vi.fn(),
    },
    notifySpy: vi.fn(),
  };
});

vi.mock('../../../lib/supabaseClient', () => ({ supabase: realtime.supabaseLike }));
vi.mock('../../auth/store', () => ({ useAuthStore: () => ({ user: authState.user }) }));

// دالة إشعار بهوية جديدة مع كل رسم — إعادة إنتاج دقيقة للسلوك الأصلي
vi.mock('./useChatNotifications', () => ({
  useChatNotifications: () => ({
    playIncomingBeep: () => undefined,
    notifyIncomingMessage: (...args: unknown[]) => {
      notifySpy(...args);
    },
  }),
}));

vi.mock('../stores/chatStore', () => ({
  useChatStore: { getState: () => chatState },
}));

import { useChatRealtime } from './useChatRealtime';

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
};

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'm-1',
  channel_id: 'ch-1',
  sender_id: 'user-2',
  message_type: 'text',
  content: 'مرحباً',
  metadata: {},
  reply_to_id: null,
  client_message_id: 'cid-1',
  created_at: '2026-11-05T08:00:00.000Z',
  edited_at: null,
  deleted_at: null,
  ...overrides,
});

type EmitHandler = (payload: { new: Record<string, unknown> }) => void | Promise<void>;

const findHandler = (table: string, event: string): EmitHandler => {
  const handler = realtime.created[0]?.handlers.find(
    h => h.filter.table === table && h.filter.event === event
  );
  if (!handler) throw new Error(`Missing realtime handler for ${table}.${event}`);
  return handler.cb;
};

const emit = async (
  handler: EmitHandler,
  payload: { new: Record<string, unknown> }
): Promise<void> => {
  await act(async () => {
    await Promise.resolve(handler(payload));
  });
};

describe('useChatRealtime — استقرار الاشتراك وسلامة الأحداث', () => {
  beforeEach(() => {
    realtime.created.length = 0;
    realtime.supabaseLike.channel.mockClear();
    realtime.supabaseLike.removeChannel.mockClear();
    chatState.channels = [];
    chatState.activeChannelId = null;
    chatState.addIncomingMessage.mockClear();
    chatState.updateMessageInState.mockClear();
    chatState.fetchChannels.mockClear();
    chatState.fetchMessages.mockClear();
    chatState.applyPeerReadReceipt.mockClear();
    notifySpy.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('لا يعيد إنشاء قناة الـ realtime عند كل رسم (السبب الأصلي لفقدان الرسائل)', async () => {
    const { rerender } = renderHook(() => {
      useChatRealtime();
    });
    await flush();

    for (let i = 0; i < 6; i += 1) {
      rerender();
      await flush();
    }

    expect(realtime.created).toHaveLength(1);
    expect(realtime.supabaseLike.removeChannel).not.toHaveBeenCalled();
  });

  it('يتشارك اشتراكاً واحداً بين مكوّنين مركَّبين معاً ويحرّره بعد آخر إزالة', async () => {
    const first = renderHook(() => {
      useChatRealtime();
    });
    await flush();
    const second = renderHook(() => {
      useChatRealtime();
    });
    await flush();

    expect(realtime.created).toHaveLength(1);

    first.unmount();
    await flush();
    expect(realtime.supabaseLike.removeChannel).not.toHaveBeenCalled();

    second.unmount();
    await flush();
    expect(realtime.supabaseLike.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('يمرّر رسائل القنوات المعروفة ويُهمل رسائل القنوات الأخرى', async () => {
    chatState.channels = [{ id: 'ch-1' }];
    renderHook(() => {
      useChatRealtime();
    });
    await flush();

    const onInsert = findHandler('chat_messages', 'INSERT');
    await emit(onInsert, { new: row() });

    expect(chatState.addIncomingMessage).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith('سالم اليماني', 'مرحباً', 'ch-1');

    await emit(onInsert, { new: row({ id: 'm-2', channel_id: 'ch-unknown' }) });

    expect(chatState.addIncomingMessage).toHaveBeenCalledTimes(1);
  });

  it('يحدّث إيصالات القراءة للطرف الآخر ويتجاهل تحديثات المستخدم نفسه', async () => {
    renderHook(() => {
      useChatRealtime();
    });
    await flush();

    const onMemberUpdate = findHandler('chat_channel_members', 'UPDATE');

    await emit(onMemberUpdate, {
      new: { channel_id: 'ch-1', user_id: 'user-2', last_read_message_id: 'm-9' },
    });
    expect(chatState.applyPeerReadReceipt).toHaveBeenCalledWith('user-2', 'm-9');

    await emit(onMemberUpdate, {
      new: { channel_id: 'ch-1', user_id: 'user-1', last_read_message_id: 'm-9' },
    });
    expect(chatState.applyPeerReadReceipt).toHaveBeenCalledTimes(1);
  });

  it('يعيد مزامنة القنوات والرسائل بعد انقطاع الاتصال وإعادة الاشتراك', async () => {
    chatState.activeChannelId = 'ch-1';
    renderHook(() => {
      useChatRealtime();
    });
    await flush();

    const statusCb = realtime.created[0].statusCb;
    if (!statusCb) throw new Error('Missing realtime status callback');

    act(() => {
      statusCb('CHANNEL_ERROR');
    });
    act(() => {
      statusCb('SUBSCRIBED');
    });

    expect(chatState.fetchChannels).toHaveBeenCalledWith('comp-1', 'user-1');
    expect(chatState.fetchMessages).toHaveBeenCalledWith('ch-1');
  });
});
