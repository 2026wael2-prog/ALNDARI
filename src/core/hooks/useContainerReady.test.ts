import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContainerReady } from './useContainerReady';

describe('useContainerReady (regression guard against Recharts 0x0 warnings)', () => {
  let resizeCallback: ResizeObserverCallback | null = null;
  const disconnectMock = vi.fn();
  const observeMock = vi.fn();

  beforeEach(() => {
    resizeCallback = null;
    disconnectMock.mockClear();
    observeMock.mockClear();

    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          resizeCallback = cb;
        }
        observe = observeMock;
        disconnect = disconnectMock;
        unobserve = vi.fn();
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stays unmounted when container dimensions are 0x0 and flips to false when hidden', () => {
    const div = document.createElement('div');
    Object.defineProperty(div, 'offsetWidth', { value: 0, configurable: true });
    Object.defineProperty(div, 'offsetHeight', { value: 0, configurable: true });

    const { result, rerender, unmount } = renderHook(() => {
      const hook = useContainerReady<HTMLDivElement>();
      (hook.containerRef as { current: HTMLDivElement | null }).current = div;
      return hook;
    });

    // Re-run effect with attached ref
    rerender();
    expect(result.current.isMounted).toBe(false);

    // Simulate container becoming visible (e.g., active tab)
    act(() => {
      resizeCallback?.(
        [{ contentRect: { width: 400, height: 220 } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });
    expect(result.current.isMounted).toBe(true);

    // Simulate container becoming hidden (e.g., inactive keep-alive tab display:none -> 0x0)
    act(() => {
      resizeCallback?.(
        [{ contentRect: { width: 0, height: 0 } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });
    expect(result.current.isMounted).toBe(false);

    unmount();
    expect(disconnectMock).toHaveBeenCalled();
  });
});

