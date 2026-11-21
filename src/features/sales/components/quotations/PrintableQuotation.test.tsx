import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrintableQuotation from './PrintableQuotation';
import type { QuotationDetailRow } from '../../api/quotationsApi';

vi.mock('@/features/settings/hooks', () => ({
  useCompany: () => ({
    data: {
      name_ar: 'محلات النظاري لقطع غيار السيارات',
      address: 'المهرة - شحن',
      phone: '777123456',
      logo_url: '/logo.png',
    },
  }),
}));

vi.mock('@/features/settings/settingsStore', () => ({
  useInvoiceSettings: () => ({
    company_name_ar: 'محلات النظاري لقطع غيار السيارات',
    company_address: 'المهرة - شحن',
    company_phone: '777123456',
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

vi.mock('@/features/branches/hooks/useBranchFilter', () => ({
  useBranchFilter: () => ({
    branchId: 'd8771318-20f8-4260-9ac6-e40c3378a5e1',
    activeBranch: {
      id: 'd8771318-20f8-4260-9ac6-e40c3378a5e1',
      name: 'فرع وائل النظاري',
      address: 'شحن - الشارع العام',
      phone: '777000999',
    },
  }),
}));

const sampleQuotation = {
  id: 'q-100',
  quotation_number: 'QT-2026-0099',
  type: 'sales',
  status: 'sent',
  party_id: 'p-1',
  issue_date: '2026-11-21',
  valid_until: '2026-11-28',
  subtotal: 450,
  discount_amount: 0,
  tax_amount: 0,
  total_amount: 450,
  currency_code: 'SAR',
  exchange_rate: 1,
  notes: 'التسليم خلال 24 ساعة',
  terms_and_conditions: '',
  delivery_terms: 'استلام من الفرع',
  payment_terms: 'نقداً عند الاستلام',
  party: { id: 'p-1', name: 'ورشة السعادة', phone: '771223344', email: null },
  quotation_items: [
    {
      id: 'item-1',
      product_id: 'prod-1',
      description: 'فحمات فرامل أمامي',
      quantity: 3,
      unit_price: 150,
      discount_percent: 0,
      total: 450,
      notes: null,
      sort_order: 0,
      product: {
        name_ar: 'فحمات فرامل أمامي',
        sku: 'SKU-10',
        part_number: '04465-60320',
        brand: 'تويوتا',
        cost_price: 90,
      },
    },
  ],
} as unknown as QuotationDetailRow;

describe('PrintableQuotation', () => {
  it('renders the official Al-Nadary print header banner, items, tafqeet, and signatures', () => {
    render(<PrintableQuotation quotation={sampleQuotation} />);

    // Official AlNadaryPrintHeader renders role="banner" (not <header> dark-mode trapped)
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText('عرض سعر مبيعات')).toBeInTheDocument();
    expect(screen.getByText('QT-2026-0099')).toBeInTheDocument();
    expect(screen.getByText(/ورشة السعادة/)).toBeInTheDocument();
    expect(screen.getByText('فحمات فرامل أمامي')).toBeInTheDocument();
    expect(screen.getByText('04465-60320')).toBeInTheDocument();
    expect(screen.getByText('إعداد المبيعات')).toBeInTheDocument();
    expect(screen.getByText('موافقة العميل')).toBeInTheDocument();
    // Screen preview toolbar visible by default
    expect(screen.getByText('طباعة عرض السعر')).toBeInTheDocument();
  });

  it('hides the screen toolbar when hideToolbar is true (direct print / PDF capture)', () => {
    render(<PrintableQuotation quotation={sampleQuotation} hideToolbar />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.queryByText('طباعة عرض السعر')).not.toBeInTheDocument();
  });
});
