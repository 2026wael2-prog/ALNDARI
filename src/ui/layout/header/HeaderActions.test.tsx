import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression guard for the frozen unread badge.
 *
 * السبب: `useChatStore.getState().getTotalUnreadCount()` كانت تُقرأ داخل JSX،
 * وهذا لا يُشترك في تحديثات المخزن ⇒ الشارة لا تتغيّر عند وصول رسالة جديدة
 * خارج صفحة المحادثة (وهي الحالة الوحيدة التي تظهر فيها الشارة أصلاً).
 */
vi.mock('../../../lib/themeStore', () => ({
  useThemeStore: () => ({ theme: 'dark' as const, toggleTheme: vi.fn() }),
}));

vi.mock('../../../features/auth/store', () => ({
  useAuthStore: () => ({ user: { id: 'user-1', company_id: 'comp-1', full_name: 'أحمد' } }),
}));

vi.mock('../../../lib/i18nStore', () => ({
  useI18nStore: () => ({ lang: 'ar', dir: 'rtl', setLang: vi.fn() }),
}));

vi.mock('../../../lib/hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../features/notifications/store', () => ({
  useNotificationStore: () => ({ getCompanyUnreadCount: () => 0 }),
  useSoundStore: () => ({ isSoundEnabled: true, toggleSound: vi.fn() }),
}));

vi.mock('../../../lib/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => 'online',
}));

vi.mock('../../../core/lib/sync-store', () => ({
  syncStore: { getPending: () => Promise.resolve([]) },
}));

vi.mock('../../../features/auth/hooks', () => ({
  useLogout: () => ({ logout: vi.fn(), isLoggingOut: false }),
  useIsSuperAdmin: () => ({ data: false }),
}));

vi.mock('../../../features/accompanying-info/store/accompanyingInfoStore', () => ({
  useAccompanyingInfoStore: () => ({ enabled: false, toggleEnabled: vi.fn() }),
}));

vi.mock('../../../features/notifications/components/NotificationDropdown', () => ({
  default: () => null,
}));
vi.mock('../../components/SyncStatusModal', () => ({ default: () => null }));
vi.mock('../../../features/auth/components/LogoutConfirmModal', () => ({
  default: () => null,
}));
vi.mock('../../../features/accompanying-info/components/AccompanyingInfoToggle', () => ({
  AccompanyingInfoToggle: () => null,
}));

import HeaderActions from './HeaderActions';
import { useChatStore } from '../../../features/chat/stores/chatStore';

const chatBadge = () => screen.getByRole('button', { name: 'المحادثات والتواصل الداخلي' });

const setUnread = (counts: number[]) => {
  act(() => {
    useChatStore.setState({
      channels: counts.map((unread_count, index) => ({
        id: `ch-${String(index)}`,
        company_id: 'comp-1',
        type: 'branch' as const,
        name: `قناة ${String(index)}`,
        is_private: false,
        created_at: '2026-11-05T08:00:00.000Z',
        updated_at: '2026-11-05T08:00:00.000Z',
        unread_count,
      })),
    });
  });
};

describe('HeaderActions — شارة المحادثات غير المقروءة', () => {
  beforeEach(() => {
    useChatStore.setState({ channels: [] });
  });

  it('تظهر وتتحدّث فوراً مع تغيّر المخزن دون إعادة تركيب', async () => {
    render(
      <MemoryRouter>
        <HeaderActions />
      </MemoryRouter>
    );
    // استقرار تحديثات المخزن غير المتزامنة (عدّاد المزامنة) قبل القياس
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(chatBadge()).toHaveTextContent('');

    setUnread([2, 1]);
    expect(chatBadge()).toHaveTextContent('3');

    setUnread([5, 5]);
    expect(chatBadge()).toHaveTextContent('9+');

    setUnread([1, 0]);
    expect(chatBadge()).toHaveTextContent('1');
    expect(chatBadge()).not.toHaveTextContent('9+');
  });
});
