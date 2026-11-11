/**
 * Tests for useTableDrag — سحب الجدول العائم.
 *
 * يغطّي العيبين المُصلحين في تقرير التدقيق (B1/B2):
 *  1. الإزاحة تُحسب نسبياً من نقطة الإمساك، فلا تقفز النافذة عند أول حركة
 *     (كان المعالج يقرأ `dragOffset` القديمة `{0,0}`).
 *  2. مستمعا `document` يُلغَيان عند `mouseup` **و** عند إلغاء التركيب.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useTableDrag } from './useTableDrag';

const MOUSE_DOWN = { clientX: 500, clientY: 300 };

const fireMouseMove = (clientX: number, clientY: number): void => {
  act(() => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY }));
  });
};

const fireMouseUp = (): void => {
  act(() => {
    document.dispatchEvent(new MouseEvent('mouseup'));
  });
};

const makeMouseDown = (init: { clientX: number; clientY: number }): React.MouseEvent =>
  ({
    clientX: init.clientX,
    clientY: init.clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }) as unknown as React.MouseEvent;

const renderDragHook = (enableDrag = true) =>
  renderHook((props: { enableDrag: boolean }) => useTableDrag(props), {
    initialProps: { enableDrag },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTableDrag', () => {
  it('follows the cursor relatively instead of jumping to absolute coordinates', () => {
    const { result } = renderDragHook();

    act(() => {
      result.current.handleTableDragStart(makeMouseDown(MOUSE_DOWN));
    });
    expect(result.current.isDragging).toBe(true);
    expect(result.current.position).toEqual({ x: 0, y: 0 });

    fireMouseMove(520, 310);
    expect(result.current.position).toEqual({ x: 20, y: 10 });

    fireMouseMove(530, 320);
    expect(result.current.position).toEqual({ x: 30, y: 20 });
  });

  it('accumulates across successive drag sessions', () => {
    const { result } = renderDragHook();

    act(() => {
      result.current.handleTableDragStart(makeMouseDown(MOUSE_DOWN));
    });
    fireMouseMove(520, 310);
    fireMouseUp();
    expect(result.current.isDragging).toBe(false);

    act(() => {
      result.current.handleTableDragStart(makeMouseDown({ clientX: 600, clientY: 400 }));
    });
    fireMouseMove(610, 405);
    expect(result.current.position).toEqual({ x: 30, y: 15 });
  });

  it('stops tracking after mouseup', () => {
    const { result } = renderDragHook();

    act(() => {
      result.current.handleTableDragStart(makeMouseDown(MOUSE_DOWN));
    });
    fireMouseMove(520, 310);
    fireMouseUp();
    fireMouseMove(900, 900);

    expect(result.current.position).toEqual({ x: 20, y: 10 });
  });

  it('aborts the document listeners on unmount', () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    const { result, unmount } = renderDragHook();

    act(() => {
      result.current.handleTableDragStart(makeMouseDown(MOUSE_DOWN));
    });
    expect(abortSpy).not.toHaveBeenCalled();

    unmount();
    expect(abortSpy).toHaveBeenCalled();
  });

  it('does nothing when dragging is disabled', () => {
    const addListenerSpy = vi.spyOn(document, 'addEventListener');
    const { result } = renderDragHook(false);

    act(() => {
      result.current.handleTableDragStart(makeMouseDown(MOUSE_DOWN));
    });

    expect(result.current.isDragging).toBe(false);
    expect(addListenerSpy).not.toHaveBeenCalledWith('mousemove', expect.anything(), expect.anything());
  });

  it('resets the position back to the origin', () => {
    const { result } = renderDragHook();

    act(() => {
      result.current.handleTableDragStart(makeMouseDown(MOUSE_DOWN));
    });
    fireMouseMove(520, 310);
    act(() => {
      result.current.resetPosition();
    });

    expect(result.current.position).toEqual({ x: 0, y: 0 });
    expect(result.current.isDragging).toBe(false);
  });
});
