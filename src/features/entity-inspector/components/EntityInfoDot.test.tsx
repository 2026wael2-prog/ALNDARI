import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EntityInfoDot } from './EntityInfoDot';
import { useEntityInspectorStore } from '../store';

describe('EntityInfoDot', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    useEntityInspectorStore.setState({ stack: [] });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  };

  it('renders null when id is null or undefined', () => {
    const { container } = renderWithProviders(<EntityInfoDot type="product" id={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders dot button and opens inspector store on click', () => {
    renderWithProviders(
      <EntityInfoDot type="party" id="party-456" label="عبد الرحيم السنح" subType="customer" />
    );

    const button = screen.getByRole('button', { name: /استعلام فوري عند النقر/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);

    const stack = useEntityInspectorStore.getState().stack;
    expect(stack).toHaveLength(1);
    expect(stack[0]).toEqual({
      type: 'party',
      id: 'party-456',
      label: 'عبد الرحيم السنح',
      subType: 'customer',
    });
  });

  it('drills down instead of open when inInspector is true', () => {
    useEntityInspectorStore.setState({
      stack: [{ type: 'invoice', id: 'inv-1' }],
    });

    renderWithProviders(
      <EntityInfoDot type="product" id="prod-99" inInspector={true} />
    );

    const button = screen.getByRole('button', { name: /استعلام فوري عند النقر/i });
    fireEvent.click(button);

    const stack = useEntityInspectorStore.getState().stack;
    expect(stack).toHaveLength(2);
    expect(stack[1].id).toBe('prod-99');
  });
});
