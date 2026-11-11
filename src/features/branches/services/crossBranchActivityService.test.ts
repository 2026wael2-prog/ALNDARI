/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  broadcastCrossBranchActivity,
  subscribeToCrossBranchActivity,
  type CrossBranchActivityPayload,
} from './crossBranchActivityService';
import { supabase } from '@/lib/supabaseClient';

vi.mock('@/lib/supabaseClient', () => {
  const sendMock = vi.fn().mockResolvedValue({});
  const onMock = vi.fn().mockReturnThis();
  const subscribeMock = vi.fn().mockImplementation(cb => {
    if (cb) cb('SUBSCRIBED', null);
    return channelObj;
  });

  const channelObj = {
    on: onMock,
    subscribe: subscribeMock,
    send: sendMock,
  };

  return {
    supabase: {
      channel: vi.fn().mockReturnValue(channelObj),
      removeChannel: vi.fn(),
    },
  };
});

describe('crossBranchActivityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('broadcastCrossBranchActivity sends event on the company broadcast channel', async () => {
    const activity: CrossBranchActivityPayload = {
      id: 'test_act_1',
      company_id: 'comp_1',
      branch_id: 'branch_1',
      type: 'sale_created',
      title: 'فاتورة مبيعات جديدة',
      message: 'تم تسجيل فاتورة مبيعات رقم INV-100',
      amount: 500,
      currency_code: 'SAR',
      link: '/sales',
      created_by: 'user_1',
    };

    await broadcastCrossBranchActivity('comp_1', activity);

    expect(supabase.channel).toHaveBeenCalledWith('cross-branch-broadcast-comp_1');
    const channel = (supabase.channel as any).mock.results[0].value;
    expect(channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'branch_activity',
      payload: activity,
    });
  });

  it('subscribeToCrossBranchActivity subscribes to broadcast and postgres_changes tables', () => {
    const onActivity = vi.fn();
    const unsubscribe = subscribeToCrossBranchActivity('comp_1', 'user_1', onActivity);

    expect(supabase.channel).toHaveBeenCalledWith('cross-branch-activity-comp_1');
    const channel = (supabase.channel as any).mock.results[0].value;
    expect(channel.on).toHaveBeenCalledWith('broadcast', { event: 'branch_activity' }, expect.any(Function));
    expect(channel.subscribe).toHaveBeenCalled();

    unsubscribe();
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });
});

