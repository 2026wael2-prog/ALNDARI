import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook, cleanup } from '@testing-library/react';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ── عميل realtime وهمي يُحاكي سلوك supabase-js الحقيقي بدقة ──────────────────
// القناة المسجَّلة بنفس الـtopic تُعاد كما هي، وإضافة معالج presence عليها بعد
// subscribe() ترمي نفس استثناء المكتبة — وهو أصل الإنهيار الذي نحميه هنا.
const { realtime } = vi.hoisted(() => {
  interface Listener {
    type: string;
    filter: unknown;
    cb: (payload: unknown) => void;
  }

  class FakeChannel {
    readonly topic: string;
    state: 'closed' | 'joining' | 'joined' | 'leaving' | 'errored' = 'closed';
    listeners: Listener[] = [];
    sent: Array<{ type: string; event: string; payload: unknown }> = [];
    tracked: unknown[] = [];

    constructor(topic: string) {
      this.topic = topic;
    }

    on(type: string, filter: unknown, cb: (payload: unknown) => void): this {
      const subscribed = this.state === 'joined' || this.state === 'joining';
      if (subscribed && (type === 'presence' || type === 'postgres_changes')) {
        throw new Error(
          `cannot add \`${type}\` callbacks for ${this.topic} after \`subscribe()\`.`
        );
      }
      this.listeners.push({ type, filter, cb });
      return this;
    }

    subscribe(cb?: (status: string) => void): this {
      this.state = 'joined';
      if (cb) cb('SUBSCRIBED');
      return this;
    }

    presenceState<T>(): Record<string, T[]> {
      return {};
    }

    track(payload: unknown): Promise<'ok'> {
      this.tracked.push(payload);
      return Promise.resolve('ok');
    }

    send(message: { type: string; event: string; payload: unknown }): Promise<'ok'> {
      this.sent.push(message);
      return Promise.resolve('ok');
    }
  }

  const registry: FakeChannel[] = [];
  const createdTopics: string[] = [];

  const supabaseLike = {
    channel: (topic: string): RealtimeChannel => {
      const realtimeTopic = `realtime:${topic}`;
      const existing = registry.find(entry => entry.topic === realtimeTopic);
      if (existing) return existing as unknown as RealtimeChannel;
      const created = new FakeChannel(realtimeTopic);
      registry.push(created);
      createdTopics.push(realtimeTopic);
      return created as unknown as RealtimeChannel;
    },
    removeChannel: (channel: RealtimeChannel): Promise<'ok'> => {
      const target = registry.find(entry => entry === (channel as unknown as FakeChannel));
      if (target) {
        target.state = 'closed';
        registry.splice(registry.indexOf(target), 1);
      }
      return Promise.resolve('ok');
    },
    getChannels: (): RealtimeChannel[] => registry as unknown as RealtimeChannel[],
  };

  return { realtime: { FakeChannel, registry, createdTopics, supabaseLike } };
});

const { authState } = vi.hoisted(() => ({
  authState: { user: null as null | Record<string, unknown> },
}));

vi.mock('../../../lib/supabaseClient', () => ({ supabase: realtime.supabaseLike }));
vi.mock('../../auth/store', () => ({ useAuthStore: () => ({ user: authState.user }) }));

import { useChatPresence } from './useChatPresence';

const TOPIC = 'realtime:chat-presence-comp-1';

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
};

describe('useChatPresence — قناة حضور واحدة مشتركة', () => {
  beforeEach(() => {
    realtime.registry.length = 0;
    realtime.createdTopics.length = 0;
    authState.user = {
      id: 'user-1',
      company_id: 'comp-1',
      full_name: 'أحمد اليماني',
      email: 'ahmed@alzahra.test',
      branch_id: 'br-1',
      branch_name: 'الفرع الرئيسي',
      avatar_url: null,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('لا يرمي استثناءً عند إعادة التركيب الفوري (StrictMode / إعادة محاولة ErrorBoundary)', async () => {
    const first = renderHook(() => useChatPresence('ch-1'));
    await flush();
    first.unmount();

    // إعادة التركيب تحدث قبل اكتمال إزالة القناة السابقة من سجل العميل
    expect(() => renderHook(() => useChatPresence('ch-1'))).not.toThrow();
    await flush();

    expect(realtime.registry.filter(entry => entry.topic === TOPIC)).toHaveLength(1);
  });

  it('يتشارك قناة واحدة بين مكوّنين مركَّبين معاً ولا يضاعف الاشتراك', async () => {
    const first = renderHook(() => useChatPresence('ch-1'));
    await flush();
    const second = renderHook(() => useChatPresence('ch-2'));
    await flush();

    expect(realtime.createdTopics.filter(topic => topic === TOPIC)).toHaveLength(1);

    const channel = realtime.registry.find(entry => entry.topic === TOPIC);
    expect(channel).toBeDefined();

    act(() => {
      first.result.current.broadcastTyping(true);
      second.result.current.broadcastTyping(false);
    });

    expect(channel?.sent).toEqual([
      {
        type: 'broadcast',
        event: 'typing',
        payload: {
          channel_id: 'ch-1',
          user_id: 'user-1',
          user_name: 'أحمد اليماني',
          is_typing: true,
        },
      },
      {
        type: 'broadcast',
        event: 'typing',
        payload: {
          channel_id: 'ch-2',
          user_id: 'user-1',
          user_name: 'أحمد اليماني',
          is_typing: false,
        },
      },
    ]);
  });

  it('يزيل قناة يتيمة مشتركة مسبقاً بدل إضافة معالج presence عليها', async () => {
    const orphan = new realtime.FakeChannel(TOPIC);
    orphan.subscribe();
    realtime.registry.push(orphan);

    expect(() => renderHook(() => useChatPresence('ch-1'))).not.toThrow();
    await flush();

    const live = realtime.registry.filter(entry => entry.topic === TOPIC);
    expect(live).toHaveLength(1);
    expect(live[0]).not.toBe(orphan);
    expect(orphan.state).toBe('closed');
  });

  it('يبثّ حمولة الحضور بعد نجاح الاشتراك فقط', async () => {
    renderHook(() => useChatPresence('ch-1'));
    await flush();

    const channel = realtime.registry.find(entry => entry.topic === TOPIC);
    const tracked = channel?.tracked ?? [];

    expect(tracked).toHaveLength(1);
    expect(tracked[0]).toMatchObject({
      user_id: 'user-1',
      full_name: 'أحمد اليماني',
      avatar_url: null,
      status: 'online',
      branch_id: 'br-1',
      branch_name: 'الفرع الرئيسي',
    });
    expect(tracked[0]).toHaveProperty('last_seen_at');
  });
});
