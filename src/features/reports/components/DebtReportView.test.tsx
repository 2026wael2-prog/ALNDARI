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
        receivables: 4700,
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
          remaining_amount: 4700,
          balances_by_currency: [
            { currency: 'SAR', balance: 4500 },
            { currency: 'YER', balance: 86000 },
          ],
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
      tax_number: '123456789',
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
  it('renders separate currency columns (SAR, YER), PDF/WhatsApp buttons, and exports separated Excel columns', () => {
    exportMock.mockClear();
    render(<DebtReportView />);

    expect(screen.getAllByText(/محلات النظاري لقطع غيار السيارات/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/سعودي \(SAR\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/يمني \(YER\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/86,000/).length).toBeGreaterThan(0);

    // PDF & WhatsApp send buttons exist
    expect(screen.getByRole('button', { name: /تصدير PDF/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إرسال \(واتساب \/ PDF\)/i })).toBeInTheDocument();

    // Excel export separates SAR and YER into distinct numeric columns + base equivalent
    fireEvent.click(screen.getByRole('button', { name: /تصدير Excel/i }));
    expect(exportMock).toHaveBeenCalledTimes(1);

    const payload = exportMock.mock.calls[0][0] as {
      companyName: string;
      headers: string[];
      rows: unknown[][];
    };
    expect(payload.companyName).toBe('محلات النظاري لقطع غيار السيارات');
    expect(payload.headers).toContain('سعودي (SAR)');
    expect(payload.headers).toContain('يمني (YER)');
    expect(payload.headers).toContain('المعادل الأساسي (SAR)');

    // 2 data rows + 1 totals row
    expect(payload.rows).toHaveLength(3);
    // Row 1: SAR = 4500, YER = 86000
    expect(payload.rows[0][5]).toBe(4500);
    expect(payload.rows[0][6]).toBe(86000);
    // Row 2: SAR = -1200, YER = 0
    expect(payload.rows[1][5]).toBe(-1200);
    expect(payload.rows[1][6]).toBe(0);
    // Totals row: SAR net = 3300, YER net = 86000
    expect(payload.rows[2][5]).toBe(3300);
    expect(payload.rows[2][6]).toBe(86000);
  });

  it('buildDebtReportExcelPayload keeps single currency clean without redundant equivalent column', () => {
    const payload = buildDebtReportExcelPayload({
      companyName: 'محلات النظاري',
      activeCurrencies: ['SAR'],
      baseCurrency: 'SAR',
      filterLabel: 'مستحقات العملاء',
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
          balances_by_currency: [{ currency: 'SAR', balance: 500 }],
          currencyAmounts: { SAR: 500 },
        },
      ],
    });
    expect(payload.headers).toHaveLength(6);
    expect(payload.rows).toHaveLength(2);
    expect(payload.rows[0][5]).toBe(500);
    expect(payload.rows[1][5]).toBe(500);
  });
});
