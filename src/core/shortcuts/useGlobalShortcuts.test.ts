import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGlobalShortcuts } from './useGlobalShortcuts';

const mockNavigate = vi.fn();
let mockPathname = '/';
let mockSearch = '';

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({
    pathname: mockPathname,
    search: mockSearch,
  }),
}));

describe('useGlobalShortcuts', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockPathname = '/';
    mockSearch = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('navigates to sales create on Ctrl + ف', () => {
    renderHook(() => useGlobalShortcuts());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ف', ctrlKey: true, bubbles: true })
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/sales?tab=create');
  });

  it('navigates to customer statements on Ctrl + ك', () => {
    renderHook(() => useGlobalShortcuts());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ك', ctrlKey: true, bubbles: true })
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/clients?tab=statements');
  });

  it('navigates to inventory with action=new on Ctrl + م from home', () => {
    renderHook(() => useGlobalShortcuts());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'م', ctrlKey: true, bubbles: true })
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/inventory?action=new');
  });

  it('dispatches alzhra-open-add-product on Ctrl + م if already on inventory', () => {
    mockPathname = '/inventory';
    const eventSpy = vi.fn();
    window.addEventListener('alzhra-open-add-product', eventSpy);

    renderHook(() => useGlobalShortcuts());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'م', ctrlKey: true, bubbles: true })
      );
    });

    expect(eventSpy).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    window.removeEventListener('alzhra-open-add-product', eventSpy);
  });

  it('navigates to bonds receipt on Ctrl + ق', () => {
    renderHook(() => useGlobalShortcuts());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ق', ctrlKey: true, bubbles: true })
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/bonds?tab=receipt&action=new');
  });

  it('navigates to bonds payment on Ctrl + د', () => {
    renderHook(() => useGlobalShortcuts());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'د', ctrlKey: true, bubbles: true })
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/bonds?tab=payment&action=new');
  });

  it('toggles help modal on Shift + ?', () => {
    const { result } = renderHook(() => useGlobalShortcuts());

    expect(result.current.isHelpOpen).toBe(false);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true })
      );
    });

    expect(result.current.isHelpOpen).toBe(true);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true })
      );
    });

    expect(result.current.isHelpOpen).toBe(false);
  });
});
