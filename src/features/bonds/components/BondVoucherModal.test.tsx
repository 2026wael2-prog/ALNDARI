import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BondVoucherModal } from './BondVoucherModal';
import type { Bond } from '../types';

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

const samplePaymentBond: Bond = {
  id: 'bond-1',
  payment_number: 'PV-2026-005',
  date: '2026-11-21',
  description: 'سداد دفعة نقدية لمؤسسة الوفاء',
  amount: 2500,
  currency_code: 'SAR',
  type: 'payment',
  party_name: 'مؤسسة الوفاء التجارية',
  account_name: 'الصندوق العام',
  status: 'posted',
  payment_method: 'cash',
};

describe('BondVoucherModal', () => {
  it('renders official Al-Nadary payment voucher with banner, person label, tafqeet, and printRef', () => {
    render(<BondVoucherModal isOpen={true} onClose={vi.fn()} bond={samplePaymentBond} />);

    // Screen title and badge
    expect(screen.getByText('معاينة السند الرسمي (PV-2026-005)')).toBeInTheDocument();
    expect(screen.getAllByText('سند صرف').length).toBeGreaterThan(0);

    // Official print shell header and labels
    expect(screen.getAllByRole('banner').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/صرفنا إلى السيد \/ السادة/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/مؤسسة الوفاء التجارية/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/خمسمئة|خمسمائة/i).length).toBeGreaterThan(0);

    // Dedicated off-screen print target exists to avoid modal cutoffs
    const isolatedPrint = document.getElementById('bond-printable-voucher-isolated');
    expect(isolatedPrint).not.toBeNull();

    // Toolbar actions including PDF export
    expect(screen.getByRole('button', { name: /تصدير PDF/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /طباعة/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إكسل/i })).toBeInTheDocument();
  });
});
