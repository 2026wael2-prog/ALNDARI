import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CalculatorInput } from './CalculatorInput';

describe('CalculatorInput', () => {
  it('shows live preview and evaluates expression on Enter', () => {
    const onValueChange = vi.fn();
    render(<CalculatorInput value={0} onValueChange={onValueChange} aria-label="المبلغ" />);

    const input = screen.getByLabelText('المبلغ') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '500*3' } });

    expect(screen.getByTestId('calc-live-preview')).toHaveTextContent('1,500');
    expect(onValueChange).toHaveBeenLastCalledWith(1500);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('1500');
  });

  it('evaluates expression immediately when typing trailing "="', () => {
    const onValueChange = vi.fn();
    render(<CalculatorInput value={0} onValueChange={onValueChange} aria-label="المبلغ" />);

    const input = screen.getByLabelText('المبلغ') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1200+350=' } });

    expect(input.value).toBe('1550');
    expect(onValueChange).toHaveBeenLastCalledWith(1550);
  });

  it('evaluates expression on blur', () => {
    const onValueChange = vi.fn();
    render(<CalculatorInput value={0} onValueChange={onValueChange} aria-label="المبلغ" />);

    const input = screen.getByLabelText('المبلغ') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '43000/430' } });
    fireEvent.blur(input);

    expect(input.value).toBe('100');
    expect(onValueChange).toHaveBeenLastCalledWith(100);
  });

  it('opens inline calculator keypad and computes expression via buttons', () => {
    const onValueChange = vi.fn();
    render(
      <CalculatorInput
        value={0}
        onValueChange={onValueChange}
        showKeypadToggle={true}
        aria-label="المبلغ"
      />
    );

    fireEvent.click(screen.getByLabelText('فتح الآلة الحاسبة'));
    expect(screen.getByTestId('calc-keypad-popover')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: '= تطبيق' }));

    const input = screen.getByLabelText('المبلغ') as HTMLInputElement;
    expect(input.value).toBe('100');
    expect(onValueChange).toHaveBeenLastCalledWith(100);
  });
});
