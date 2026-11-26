import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PartyAnalyticsView from './components/PartyAnalyticsView';
import type { Party } from './types';

vi.mock('./hooks/useCustomerCreditAnalytics', () => ({
  useCustomerCreditAnalytics: () => ({
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
    data: null,
    summary: {
      total_customers: 3,
      debtors_count: 2,
      creditors_count: 0,
      settled_count: 1,
      total_receivable: 37000,
      total_credit_balance: 0,
      total_overdue: 25000,
      overdue_percent: 67.6,
      period_total_sales: 80000,
      period_credit_sales: 50000,
      period_collections: 35000,
      dso_days: 66.6,
      cei_percent: 58.3,
      over_limit_count: 1,
      over_limit_amount: 5000,
      concentration_top5_percent: 100,
      ecl_provision: 15060,
      aging: {
        current: 12000,
        d1_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90_plus: 25000,
        count_current: 1,
        count_1_30: 0,
        count_31_60: 0,
        count_61_90: 0,
        count_90_plus: 1,
      },
    },
    customers: [
      {
        party_id: 'p-1',
        name: 'شركة الأمل للتجارة',
        phone: '967771234567',
        status: 'active',
        party_type: 'customer',
        category_name: 'جملة',
        credit_limit: 20000,
        payment_terms_days: 30,
        customer_since: '2025-01-01',
        balance: 25000,
        other_currency_balance: 0,
        other_currency_code: 'YER',
        aging_current: 0,
        aging_1_30: 0,
        aging_31_60: 0,
        aging_61_90: 0,
        aging_90_plus: 25000,
        overdue_amount: 25000,
        oldest_unpaid_date: '2025-10-01',
        max_days_overdue: 120,
        sales_12m: 45000,
        credit_sales_12m: 40000,
        returns_12m: 0,
        invoices_count_12m: 8,
        last_invoice_date: '2026-10-15',
        collections_12m: 15000,
        last_payment_date: '2026-08-10',
        last_payment_amount: 5000,
        days_since_last_payment: 100,
        next_promise_date: null,
        next_promise_subject: null,
        next_promise_status: null,
        creditScore: 26,
        creditGrade: 'D',
        scoreBreakdown: { punctuality: 20, aging: 0, utilization: 0, velocity: 90, returns: 100 },
        utilizationPercent: 125,
        isOverLimit: true,
        eclAmount: 15000,
        rfmSegment: 'high_value_risk',
        policyLabel: 'حرج — تجميد آجل / نقدي فقط',
      },
      {
        party_id: 'p-2',
        name: 'مؤسسة النور',
        phone: '966501234567',
        status: 'active',
        party_type: 'customer',
        category_name: 'تجزئة',
        credit_limit: 30000,
        payment_terms_days: 30,
        customer_since: '2025-01-01',
        balance: 12000,
        other_currency_balance: 0,
        other_currency_code: 'YER',
        aging_current: 12000,
        aging_1_30: 0,
        aging_31_60: 0,
        aging_61_90: 0,
        aging_90_plus: 0,
        overdue_amount: 0,
        oldest_unpaid_date: '2026-11-20',
        max_days_overdue: 0,
        sales_12m: 60000,
        credit_sales_12m: 50000,
        returns_12m: 0,
        invoices_count_12m: 15,
        last_invoice_date: '2026-11-20',
        collections_12m: 50000,
        last_payment_date: '2026-11-21',
        last_payment_amount: 10000,
        days_since_last_payment: 5,
        next_promise_date: null,
        next_promise_subject: null,
        next_promise_status: null,
        creditScore: 98,
        creditGrade: 'A+',
        scoreBreakdown: { punctuality: 100, aging: 100, utilization: 100, velocity: 100, returns: 100 },
        utilizationPercent: 40,
        isOverLimit: false,
        eclAmount: 60,
        rfmSegment: 'champions',
        policyLabel: 'ممتاز — مؤهل لرفع السقف',
      },
    ],
  }),
  useUpdatePartyCreditPolicy: () => ({ mutate: vi.fn(), isPending: false }),
  useLogCreditPromise: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('PartyAnalyticsView (Scientific Customer Credit Analytics)', () => {
  const mockParties: Party[] = [
    {
      id: 'p-1',
      name: 'شركة الأمل للتجارة',
      phone: '967771234567',
      balance: 25000,
      status: 'active',
      company_id: 'comp-1',
      type: 'customer',
    } as Party,
  ];

  const renderWithQuery = (ui: React.ReactElement) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  };

  it('renders scientific credit KPIs, AR aging matrix, and credit grade cards', () => {
    renderWithQuery(
      <PartyAnalyticsView
        partyType="customer"
        parties={mockParties}
        onViewStatement={vi.fn()}
      />
    );

    expect(screen.getByText('متوسط التحصيل (DSO)')).toBeInTheDocument();
    expect(screen.getByText('كفاءة التحصيل (CEI)')).toBeInTheDocument();
    expect(screen.getByText('مخصص IFRS 9 ECL')).toBeInTheDocument();
    expect(screen.getByText(/مصفوفة أعمار الديون التفاعلية/)).toBeInTheDocument();
    expect(screen.getByText(/التصنيف الائتماني/)).toBeInTheDocument();
  });

  it('renders customer credit portfolio rows with names and grades', () => {
    renderWithQuery(
      <PartyAnalyticsView
        partyType="customer"
        parties={mockParties}
        onViewStatement={vi.fn()}
      />
    );

    expect(screen.getByText('شركة الأمل للتجارة')).toBeInTheDocument();
    expect(screen.getByText('مؤسسة النور')).toBeInTheDocument();
  });
});
