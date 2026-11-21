import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatementExcelView } from './StatementExcelView';
import type { StatementMovement } from '../../service';

const sampleMovements: StatementMovement[] = [
  {
    id: 'mov-1',
    date: '2026-11-20',
    ref: 'INV-2026-001',
    desc: 'فاتورة مبيعات قطع غيار',
    type: 'invoice',
    operation_type: 'sales_invoice',
    debit: 1500,
    credit: 0,
    currency: 'SAR',
    balance: 1500,
    payment_status: 'unpaid',
    reference_id: 'inv-1',
    reference_type: 'invoice',
  },
  {
    id: 'mov-2',
    date: '2026-11-21',
    ref: 'PAY-2026-001',
    desc: 'سداد دفعة نقدية سند صرف/قبض',
    type: 'bond',
    operation_type: 'receipt_bond',
    debit: 0,
    credit: 500,
    currency: 'SAR',
    balance: 1000,
    payment_status: 'paid',
    reference_id: 'bond-1',
    reference_type: 'bond',
  },
];

describe('StatementExcelView', () => {
  it('renders statement movements in Excel grid mode with colors and direct print triggers', () => {
    const onPrintSingle = vi.fn();
    const onSelectRow = vi.fn();
    const onOpenBond = vi.fn();
    const onOpenInvoice = vi.fn();

    render(
      <StatementExcelView
        filteredMovements={sampleMovements}
        selectedRowIds={new Set(['mov-1'])}
        rowColors={new Map([['mov-1', 'emerald']])}
        activeColorPickerRowId={null}
        partyName="ورشة السلام"
        onToggleSelectAll={vi.fn()}
        onToggleRowSelection={onSelectRow}
        onOpenColorPicker={vi.fn()}
        onApplyColorToSingleRow={vi.fn()}
        onPrintSingleTransaction={onPrintSingle}
        onOpenInvoiceModal={onOpenInvoice}
        onOpenBondModal={onOpenBond}
      />
    );

    // Grid headers and rows
    expect(screen.getByText('كشف حساب إكسل: ورشة السلام')).toBeInTheDocument();
    expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    expect(screen.getByText('PAY-2026-001')).toBeInTheDocument();
    expect(screen.getByText('فاتورة مبيعات قطع غيار')).toBeInTheDocument();

    // Direct transaction print trigger
    const printButtons = screen.getAllByTitle('طباعة هذه المعاملة بمفردها');
    expect(printButtons.length).toBe(2);

    fireEvent.click(printButtons[0]);
    expect(onPrintSingle).toHaveBeenCalledWith(sampleMovements[0]);
  });
});
