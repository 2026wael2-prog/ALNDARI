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
    operation_type: 'فاتورة مبيعات',
    debit: 1500,
    credit: 0,
    currency: 'SAR',
    balance: 1500,
    payment_status: 'partial',
    remaining_amount: 500,
    items_count: 3,
    reference_id: 'inv-1',
    reference_type: 'sales_invoice',
  },
  {
    id: 'mov-2',
    date: '2026-11-21',
    ref: 'PAY-2026-001',
    desc: 'سداد دفعة نقدية سند صرف/قبض',
    type: 'bond',
    operation_type: 'سند قبض',
    debit: 0,
    credit: 500,
    currency: 'SAR',
    balance: 1000,
    payment_status: 'paid',
    reference_id: 'bond-1',
    reference_type: 'receipt_bond',
  },
  {
    id: 'mov-3',
    date: '2026-11-22',
    ref: 'INV-YER-002',
    desc: 'فاتورة مبيعات بالريال اليمني',
    type: 'invoice',
    operation_type: 'فاتورة مبيعات',
    debit: 42500,
    credit: 0,
    currency: 'YER',
    balance: 42500,
    payment_status: 'unpaid',
    reference_id: 'inv-2',
    reference_type: 'sales_invoice',
  },
];

describe('StatementExcelView', () => {
  it('renders Excel grid with A..J headers, separate SAR/YER totals footer, partial badge, and direct print triggers', () => {
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

    // Excel grid banner, column letters, and rows
    expect(screen.getByText('كشف حساب إكسل: ورشة السلام')).toBeInTheDocument();
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    expect(screen.getByText('PAY-2026-001')).toBeInTheDocument();
    expect(screen.getByText('INV-YER-002')).toBeInTheDocument();
    expect(screen.getByText('فاتورة مبيعات قطع غيار')).toBeInTheDocument();
    expect(screen.getByText('جزئي')).toBeInTheDocument();

    // Separate per-currency totals footer rows
    expect(screen.getByText(/إجمالي حركات عملة \(SAR\)/)).toBeInTheDocument();
    expect(screen.getByText(/إجمالي حركات عملة \(YER\)/)).toBeInTheDocument();

    // Direct transaction print trigger
    const printButtons = screen.getAllByTitle('طباعة هذه المعاملة بمفردها');
    expect(printButtons.length).toBe(3);

    fireEvent.click(printButtons[0]);
    expect(onPrintSingle).toHaveBeenCalledWith(sampleMovements[0]);

    // Clicking a cell updates the Excel formula bar (fx) with coordinate & full content
    fireEvent.click(screen.getByText('فاتورة مبيعات قطع غيار'));
    expect(screen.getByText('E1')).toBeInTheDocument();
    expect(screen.getByTitle('نسخ قيمة الخلية النشطة')).toBeInTheDocument();

    // Font-size / density switcher buttons
    expect(screen.getByRole('button', { name: 'واضح' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'كبير' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'كبير' }));
    expect(screen.getByRole('grid').className).toContain('text-[15px]');
  });
});
