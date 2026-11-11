import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { FloatingChatWidget } from './FloatingChatWidget';

/**
 * حارس انحدار لنافذة المحادثة العائمة: ارتفاعها ثابت (480/520px) مع إزاحة سفلية
 * 4.5rem، وكان يتجاوز الشاشات القصيرة (أو الشاشة عند فتح لوحة المفاتيح) فيخرج
 * أعلى النافذة أو صندوق الكتابة عن حدود العرض. الحل: `max-h` محسوب من `100dvh`
 * + سلسلة `min-h-0` كي تُمرَّر الرسائل داخل النافذة فقط.
 */
const widgetState = vi.hoisted(() => ({
  setActiveChannel: vi.fn(),
  setFloatingOpen: vi.fn(),
  toggleFloatingMinimized: vi.fn(),
}));

vi.mock('../stores/chatStore', () => ({
  useChatStore: () => ({
    isFloatingOpen: true,
    setFloatingOpen: widgetState.setFloatingOpen,
    isFloatingMinimized: false,
    toggleFloatingMinimized: widgetState.toggleFloatingMinimized,
    activeChannelId: null as string | null,
    setActiveChannel: widgetState.setActiveChannel,
    fetchChannels: vi.fn(),
    getTotalUnreadCount: () => 0,
  }),
}));

vi.mock('../../auth/store', () => ({
  useAuthStore: () => ({ user: { id: 'user-1', company_id: 'company-1' } }),
}));

vi.mock('../hooks/useChatRealtime', () => ({ useChatRealtime: () => undefined }));

vi.mock('./ConversationList', () => ({
  ConversationList: () => <div data-testid="floating-list" />,
}));

vi.mock('./ConversationView', () => ({
  ConversationView: () => <div data-testid="floating-view" />,
}));

describe('FloatingChatWidget — عدم تجاوز حدود الشاشة', () => {
  it('يقيّد ارتفاع النافذة بالمساحة المرئية ويسمح بتقلّص جسمها', () => {
    const { container } = render(
      <MemoryRouter>
        <FloatingChatWidget />
      </MemoryRouter>
    );

    const windowEl = container.firstElementChild;
    if (!(windowEl instanceof HTMLElement)) throw new Error('widget not rendered');

    expect(windowEl.className).toContain('max-h-[calc(100dvh-6.5rem)]');
    expect(windowEl).toHaveClass('min-h-0');
    expect(windowEl).toHaveClass('overflow-hidden');

    const body = windowEl.children[1] as HTMLElement;
    expect(body).toHaveClass('min-h-0');
    expect(body).toHaveClass('flex-1');
    expect(body).toHaveClass('overflow-hidden');
  });
});
