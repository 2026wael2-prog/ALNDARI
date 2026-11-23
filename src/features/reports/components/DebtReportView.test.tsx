import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DebtReportView, { buildDebtReportExcelPayload } from './DebtReportView';

const exportMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../core/utils/genericExcelExporter', () => ({
  exportGenericTableToExcel: (...args: unknown[]) => exportMock(...args),
}));

vi.mock('../hooks', () => ({
  useDebtReport: () => ({
    isLoading: false,
    data: {
      summary: {
        receivables: 4500,
        payables: 1200,
        currency: 'SAR',
      },
      debts: [
        {
          id: 'p-1',
          name: 'شركة النور للتجارة',
          phone: '777111222',
          type: 'customer',
          currency: 'SAR',
          total_sales: 0,
          paid_amount: 0,
          remaining_amount: 4500,
          balances_by_currency: [{ currency: 'SAR', balance: 4500 }],
        },
        {
          id: 'p-2',
          name: 'مورد الخليج لقطع الغيار',
          phone: '777333444',
          type: 'supplier',
          currency: 'SAR',
          total_sales: 0,
          paid_amount: 0,
          remaining_amount: -1200,
          balances_by_currency: [{ currency: 'SAR', balance: -1200 }],
        },
      ],
    },
  }),
}));

vi.mock('../../settings/hooks', () => ({
  useCompany: () => ({
    data: {
      name_ar: 'محلات النظاري لقطع غيار السيارات',
      address: 'المهرة - شحن',
      phone: '777123456',
      logo_url: '/logo.png',
    },
  }),
}));

vi.mock('../../settings/settingsStore', () => ({
  useInvoiceSettings: () => ({
    company_name_ar: 'محلات النظاري لقطع غيار السيارات',
    company_address: 'المهرة - شحن',
    company_phone: '777123456',
  }),
  useDocumentHeaderSettings: () => ({
    whatsapp: null,
    details: {},
  }),
  usePrintSettings: () => ({
    print_header: true,
    print_footer: true,
    paper_size: 'A4',
    orientation: 'portrait',
    margin_top: 8,
    margin_right: 10,
    margin_bottom: 8,
    margin_left: 10,
  }),
}));

describe('DebtReportView', () => {
  it('renders Al-Nadary identity, KPIs, party amounts, and exports non-empty Excel rows', () => {
    exportMock.mockClear();
    render(<DebtReportView />);

    expect(screen.getAllByText(/محلات النظاري لقطع غيار السيارات/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/الجعفري سمارت/)).not.toBeInTheDocument();

    expect(screen.getAllByText(/شركة النور للتجارة/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/مورد الخليج لقطع الغيار/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4,500/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,200/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /تصدير Excel/i }));
    expect(exportMock).toHaveBeenCalledTimes(1);

    const payload = exportMock.mock.calls[0][0] as {
      companyName: string;
      headers: string[];
      rows: unknown[][];
    };
    expect(payload.companyName).toBe('محلات النظاري لقطع غيار السيارات');
    expect(payload.headers.length).toBe(7);
    // 2 data rows + 1 totals row
    expect(payload.rows.length).toBe(3);
    expect(payload.rows[0][1]).toBe('شركة النور للتجارة');
    expect(payload.rows[0][5]).toBe(4500);
    expect(payload.rows[1][1]).toBe('مورد الخليج لقطع الغيار');
    expect(payload.rows[1][5]).toBe(1200);
  });

  it('buildDebtReportExcelPayload includes accurate numeric amounts and totals row', () => {
    const payload = buildDebtReportExcelPayload({
      companyName: 'محلات النظاري',
      baseCurrency: 'SAR',
      filterLabel: 'جميع الذمم',
      rows: [
        {
          id: '1',
          rowIndex: 1,
          name: 'عميل أ',
          phone: '777000111',
          type: 'customer',
          typeLabel: 'عميل',
          remaining_amount: 500,
          absAmount: 500,
          direction: 'debit',
          directionLabel: 'عليه (مدين)',
          currency: 'SAR',
          balances_by_currency: [],
          currenciesText: '500 SAR',
        },
      ],
    });
    expect(payload.rows).toHaveLength(2);
    expect(payload.rows[0]).toContain(500);
    expect(payload.rows[1][5]).toBe(500);
  });
});
