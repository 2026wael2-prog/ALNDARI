import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatHubPage } from './ChatHubPage';

/**
 * Regression guard for the "المحادثة تنزلق خارج الشاشة" defect.
 *
 * السبب كان `h-[calc(100vh-4rem)]`: تعبير يدوي يتجاهل شريط التبويبات (2.5rem)
 * وشريط التنقل السفلي + حشوة `<main>` (7rem على الهاتف) ⇒ تصبح الصفحة أطول من
 * حاويتها، فتُمرَّر `<main>` ويخرج صندوق الكتابة أسفل الشاشة. الحل: `h-full`
 * نسبةً إلى الحاوية + سلسلة `min-h-0` كي تُمرَّر الرسائل وحدها.
 */
const chatState = vi.hoisted(() => ({
  fetchChannels: vi.fn(),
  setActiveChannel: vi.fn(),
}));

vi.mock('../stores/chatStore', () => ({
  useChatStore: () => ({
    fetchChannels: chatState.fetchChannels,
    activeChannelId: null as string | null,
    setActiveChannel: chatState.setActiveChannel,
  }),
}));

vi.mock('../../auth/store', () => ({
  useAuthStore: () => ({ user: { id: 'user-1', company_id: 'company-1' } }),
}));

vi.mock('../hooks/useChatRealtime', () => ({ useChatRealtime: () => undefined }));

vi.mock('./ConversationList', () => ({
  ConversationList: ({ onSelectChannel }: { onSelectChannel?: () => void }) => (
    <div data-testid="conversation-list">
      <button type="button" onClick={onSelectChannel}>
        فتح محادثة
      </button>
    </div>
  ),
}));

vi.mock('./ConversationView', () => ({
  ConversationView: () => <div data-testid="conversation-view" />,
}));

const getRoot = (container: HTMLElement): HTMLElement => {
  const root = container.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error('ChatHubPage root element not rendered');
  return root;
};

describe('ChatHubPage — ارتفاع الشاشة والتمرير', () => {
  it('يملأ المساحة المتاحة بلا أي حساب يدوي للـ viewport', () => {
    const { container } = render(<ChatHubPage />);
    const root = getRoot(container);

    // لا ارتفاع مبني على 100vh/100dvh ⇒ لا تجاوز لحدود الحاوية
    expect(root.className).not.toMatch(/100vh|100dvh/);
    // يتبع ارتفاع حاوية الصفحة + يمنع أي تسرّب أفقي/رأسي
    expect(root).toHaveClass('h-full');
    expect(root).toHaveClass('min-h-0');
    expect(root).toHaveClass('overflow-hidden');
    expect(root).toHaveClass('flex');
  });

  it('يمنح لوحة القائمة ولوحة المحادثة `min-h-0` كي تتقلّصا وتُمرَّرا داخلياً', () => {
    const { container } = render(<ChatHubPage />);
    const root = getRoot(container);

    const listPane = root.children[0] as HTMLElement;
    const chatPane = root.children[1] as HTMLElement;

    expect(listPane).toHaveClass('min-h-0');
    expect(chatPane).toHaveClass('min-h-0');
    expect(chatPane).toHaveClass('min-w-0');
  });

  it('يبدأ بقائمة المحادثات وينتقل إلى المحادثة عند الاختيار (جوال)', () => {
    const { container } = render(<ChatHubPage />);
    const root = getRoot(container);
    const listPane = root.children[0] as HTMLElement;
    const chatPane = root.children[1] as HTMLElement;

    expect(screen.getByTestId('conversation-list')).toBeInTheDocument();
    expect(listPane).not.toHaveClass('hidden');
    expect(chatPane).toHaveClass('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'فتح محادثة' }));

    expect(listPane).toHaveClass('hidden');
    expect(chatPane).not.toHaveClass('hidden');
    expect(chatPane).toHaveClass('flex');
    expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
  });

  it('يجلب القنوات عند توفر مستخدم بمنشأة', () => {
    render(<ChatHubPage />);
    expect(chatState.fetchChannels).toHaveBeenCalledWith('company-1', 'user-1');
  });
});
