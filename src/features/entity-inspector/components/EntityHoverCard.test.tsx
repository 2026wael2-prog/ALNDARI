import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EntityHoverCard } from './EntityHoverCard';
import * as inspectorService from '../service';
import { useEntityInspectorStore } from '../store';
import type { InspectedEntityData } from '../types';

vi.mock('../service', () => ({
  fetchInspectedEntity: vi.fn(),
}));

describe('EntityHoverCard', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    useEntityInspectorStore.setState({ stack: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const mockProductData: InspectedEntityData = {
    type: 'product',
    title: 'مساعد يمين هايلوكس 2020',
    subtitle: '48510-09V00',
    code: '48510-09V00',
    badge: { label: 'متوفر', tone: 'emerald' },
    kpis: [
      { label: 'سعر البيع', value: '250.00 ر.س' },
      { label: 'الرصيد الكلي', value: '14 حبة' },
    ],
    fields: [
      { section: 'البيانات', label: 'الشركة الصانعة', value: 'TOYOTA' },
      { section: 'البيانات', label: 'المخزن', value: 'الفرع الرئيسي' },
    ],
    sheets: [],
  };

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  };

  it('renders children trigger normally', () => {
    renderWithProviders(
      <EntityHoverCard type="product" id="prod-123" label="مساعد يمين">
        <span data-testid="trigger-text">مساعد يمين</span>
      </EntityHoverCard>
    );

    expect(screen.getByTestId('trigger-text')).toBeInTheDocument();
    expect(screen.queryByTestId('entity-hover-card')).not.toBeInTheDocument();
  });

  it('opens hover card after openDelay and displays data', async () => {
    vi.mocked(inspectorService.fetchInspectedEntity).mockResolvedValue(mockProductData);

    renderWithProviders(
      <EntityHoverCard type="product" id="prod-123" label="مساعد يمين" openDelay={200}>
        <span data-testid="trigger-text">مساعد يمين</span>
      </EntityHoverCard>
    );

    const trigger = screen.getByTestId('trigger-text').parentElement!;
    fireEvent.mouseEnter(trigger);

    // Before delay expires
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByTestId('entity-hover-card')).not.toBeInTheDocument();

    // After delay expires
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(screen.getByTestId('entity-hover-card')).toBeInTheDocument();

    // Allow query promise to finish
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText('مساعد يمين هايلوكس 2020')).toBeInTheDocument();
    expect(screen.getByText('250.00 ر.س')).toBeInTheDocument();
    expect(screen.getByText('14 حبة')).toBeInTheDocument();
  });

  it('closes card after mouseLeave delay', async () => {
    vi.mocked(inspectorService.fetchInspectedEntity).mockResolvedValue(mockProductData);

    renderWithProviders(
      <EntityHoverCard type="product" id="prod-123" label="مساعد يمين" openDelay={100}>
        <span data-testid="trigger-text">مساعد يمين</span>
      </EntityHoverCard>
    );

    const trigger = screen.getByTestId('trigger-text').parentElement!;
    fireEvent.mouseEnter(trigger);

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByTestId('entity-hover-card')).toBeInTheDocument();

    // Mouse leaves
    fireEvent.mouseLeave(trigger);

    // Still visible within close debounce (150ms)
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByTestId('entity-hover-card')).toBeInTheDocument();

    // After close delay
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.queryByTestId('entity-hover-card')).not.toBeInTheDocument();
  });

  it('opens universal inspector when clicking "استعلام شامل"', async () => {
    vi.mocked(inspectorService.fetchInspectedEntity).mockResolvedValue(mockProductData);

    renderWithProviders(
      <EntityHoverCard type="product" id="prod-123" label="مساعد يمين" openDelay={50}>
        <span data-testid="trigger-text">مساعد يمين</span>
      </EntityHoverCard>
    );

    const trigger = screen.getByTestId('trigger-text').parentElement!;
    fireEvent.mouseEnter(trigger);

    act(() => {
      vi.advanceTimersByTime(60);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const openFullBtn = screen.getByRole('button', { name: /استعلام شامل/i });
    fireEvent.click(openFullBtn);

    const stack = useEntityInspectorStore.getState().stack;
    expect(stack).toHaveLength(1);
    expect(stack[0]).toEqual({
      type: 'product',
      id: 'prod-123',
      label: 'مساعد يمين',
      subType: undefined,
    });
  });
});
