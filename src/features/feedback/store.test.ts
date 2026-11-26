import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeedbackStore } from './store';

describe('useFeedbackStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useFeedbackStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast, merges parsed error details, and auto-dismisses after 5s', () => {
    useFeedbackStore.getState().showToast('تعذر الحفظ', 'error', new Error('Network failure'));

    const toasts = useFeedbackStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.type).toBe('error');
    expect(toasts[0]?.message).toContain('تعذر الحفظ');
    expect(toasts[0]?.details).toBeDefined();

    vi.advanceTimersByTime(5000);
    expect(useFeedbackStore.getState().toasts).toHaveLength(0);
  });

  it('allows manual dismissal via hideToast before timer expiry', () => {
    useFeedbackStore.getState().showToast('تم الحفظ بنجاح', 'success');

    const toastId = useFeedbackStore.getState().toasts[0]?.id;
    expect(toastId).toBeDefined();

    if (toastId) {
      useFeedbackStore.getState().hideToast(toastId);
    }
    expect(useFeedbackStore.getState().toasts).toHaveLength(0);
  });
});
