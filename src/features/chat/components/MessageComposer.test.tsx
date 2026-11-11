import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression guard for the silent send failure.
 *
 * السبب: `catch {}` مع تعليق «Error handled in store» — والمخزن يرمي الخطأ بعد
 * التراجع عن الرسالة المتفاوتة ⇒ الرسالة تختفي بلا أي إشعار للمستخدم.
 */
const { sendMessage, showToast, setReplyingTo } = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  showToast: vi.fn(),
  setReplyingTo: vi.fn(),
}));

vi.mock('../stores/chatStore', () => ({
  useChatStore: () => ({ sendMessage, replyingTo: null, setReplyingTo }),
}));

vi.mock('../../auth/store', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', company_id: 'comp-1', full_name: 'أحمد', email: 'a@z.test' },
  }),
}));

vi.mock('../../feedback/store', () => ({ useFeedbackStore: () => ({ showToast }) }));

vi.mock('../hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false,
    formattedDuration: '0:00',
    volumeLevel: 0,
    duration: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
  }),
}));

vi.mock('./EntityShareModal', () => ({ EntityShareModal: () => null }));
vi.mock('./composer/AudioRecorder', () => ({ AudioRecorder: () => null }));
vi.mock('../../../core/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() },
}));

import { MessageComposer } from './MessageComposer';

const typeAndSend = (text: string) => {
  const textarea = screen.getByPlaceholderText(/اكتب رسالتك هنا/);
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.click(screen.getByTitle('إرسال'));
  return textarea as HTMLTextAreaElement;
};

describe('MessageComposer — إظهار فشل الإرسال للمستخدم', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    showToast.mockReset();
    setReplyingTo.mockReset();
  });

  it('يُظهر رسالة خطأ واضحة ويُبقي النص في الحقل عند فشل الإرسال', async () => {
    sendMessage.mockRejectedValue(
      Object.assign(new Error('عذراً، لا تمتلك صلاحية إرسال الرسائل'), { code: '42501' })
    );

    render(<MessageComposer channelId="ch-1" onTyping={vi.fn()} />);
    const textarea = typeAndSend('مرحباً');

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('النص محفوظ في الحقل'),
        'error'
      );
    });

    // النص باقٍ ليتمكن المستخدم من إعادة المحاولة دون إعادة الكتابة
    expect(textarea).toHaveValue('مرحباً');
  });

  it('يُفرغ الحقل ويُخفي أي خطأ عند نجاح الإرسال', async () => {
    sendMessage.mockResolvedValue(undefined);

    render(<MessageComposer channelId="ch-1" onTyping={vi.fn()} />);
    const textarea = typeAndSend('تم الإرسال');

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(textarea).toHaveValue('');
    });
    expect(showToast).not.toHaveBeenCalled();
  });
});
