import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PriorityQueueCard from './PriorityQueueCard';
import { useDebtCollectors, useDebtDashboard, useDebtPriorityQueue } from '../hooks/useDebtQueries';
import { useDebtMutations } from '../hooks/useDebtMutations';
import type { DebtPriorityQueueRow } from '../types';

vi.mock('../hooks/useDebtQueries', () => ({
  useDebtPriorityQueue: vi.fn(),
  useDebtDashboard: vi.fn(),
  useDebtCollectors: vi.fn(),
}));
vi.mock('../hooks/useDebtMutations', () => ({ useDebtMutations: vi.fn() }));
vi.mock('../../../core/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: true, isLoading: false, error: null }),
}));
vi.mock('../../settings/hooks', () => ({
  useCompany: () => ({ data: { base_currency: 'SAR', name_ar: 'الزهراء' } }),
}));
vi.mock('../../feedback/store', () => ({
  useFeedbackStore: () => ({ showToast: vi.fn() }),
}));
// النوافذ المنبثقة تُستهلك في مسارٍ آخر (تسجيل تذكير/وعد) — تُستبدل كي لا
// يجرّ الاختبار طبقة react-query وشبكة العملاء الكاملة.
vi.mock('./PromiseFormModal', () => ({ default: () => null }));
vi.mock('./ReminderModal', () => ({ ReminderModal: () => null }));

const queueRow = (overrides: Partial<DebtPriorityQueueRow>): DebtPriorityQueueRow => ({
  task_id: 'inv:1',
  task_type: 'overdue',
  party_id: 'p1',
  party_name: 'مؤسسة النور',
  party_phone: '777123456',
  currency_code: 'SAR',
  amount: 1000,
  reference_info: 'INV-100',
  urgency: 'high',
  priority: 'high',
  due_at: '2026-10-01T00:00:00Z',
  is_overdue: true,
  assigned_to: 'u1',
  assigned_name: 'محصّل أول',
  escalation_stage: 'call',
  amount_base: 1000,
  days_late: 20,
  days_since_contact: 3,
  priority_score: 85,
  next_action: 'اتصل بالعميل اليوم',
  score_drivers: ['متأخر 20 يوماً'],
  ...overrides,
});

const rows: DebtPriorityQueueRow[] = [
  queueRow({}),
  queueRow({
    task_id: 'inv:2',
    party_id: 'p2',
    party_name: 'شركة الفجر',
    party_phone: null,
    amount_base: 250,
    days_late: 0,
    priority_score: 20,
    escalation_stage: 'monitor',
    score_drivers: null,
  }),
];

const renderCard = (): void => {
  render(
    <MemoryRouter>
      <PriorityQueueCard bucket="all" onBucketChange={vi.fn()} />
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.mocked(useDebtPriorityQueue).mockReturnValue({
    data: rows,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  } as never);
  vi.mocked(useDebtDashboard).mockReturnValue({ data: [] } as never);
  vi.mocked(useDebtCollectors).mockReturnValue({
    data: [{ collector_id: 'u1', full_name: 'محصّل أول', role: 'sales' }],
  } as never);
  vi.mocked(useDebtMutations).mockReturnValue({
    assignParties: vi.fn(),
    isSaving: false,
  } as never);
});

describe('PriorityQueueCard', () => {
  it('renders the priority queue rows with their computed score', () => {
    renderCard();
    expect(screen.getAllByText('مؤسسة النور').length).toBeGreaterThan(0);
    expect(screen.getAllByText('شركة الفجر').length).toBeGreaterThan(0);
    expect(screen.getAllByText('85').length).toBeGreaterThan(0);
  });

  it('filters to critical rows only through a saved view', () => {
    renderCard();
    fireEvent.click(screen.getByTitle('درجة الأهمية ≥ 70'));
    expect(screen.getAllByText('مؤسسة النور').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('شركة الفجر')).toHaveLength(0);
  });

  it('filters by search term across party name and phone', () => {
    renderCard();
    const input = screen.getByPlaceholderText('عميل / هاتف / مرجع / سبب...');
    fireEvent.change(input, { target: { value: '777123456' } });
    expect(screen.queryAllByText('شركة الفجر')).toHaveLength(0);
  });

  it('shows the Excel-style status bar totals in the base currency', () => {
    renderCard();
    expect(screen.getAllByText(/المعروض:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/منقطع التواصل:/).length).toBeGreaterThan(0);
  });
});
