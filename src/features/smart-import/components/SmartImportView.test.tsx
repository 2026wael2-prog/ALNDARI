import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SmartImportView from './SmartImportView';
import { documentAiService } from '../../ai/documentService';
import { useFeedbackStore } from '../../feedback/store';

vi.mock('../../ai/documentService', () => ({
  documentAiService: {
    parseDocument: vi.fn(),
  },
}));

vi.mock('../../settings/hooks', () => ({
  useCurrencies: () => ({
    currencies: [
      { code: 'SAR', name_ar: 'ريال سعودي' },
      { code: 'YER', name_ar: 'ريال يمني' },
    ],
  }),
}));

vi.mock('../../inventory/hooks/useInventoryManagement', () => ({
  useWarehouses: () => ({
    data: [{ id: 'wh-main', name_ar: 'المخزن الرئيسي' }],
  }),
}));

vi.mock('../../../ui/common/ExcelTable', () => ({
  default: ({ data }: { data: Array<{ name?: string }> }) => (
    <div data-testid="mock-excel-table">{data.map(row => row.name).join(',')}</div>
  ),
}));

describe('SmartImportView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFeedbackStore.setState({ toasts: [] });
  });

  it('renders upload screen, extracts document items, and forwards confirmed payload with auto-selected warehouse', async () => {
    vi.mocked(documentAiService.parseDocument).mockResolvedValueOnce({
      items: [{ name: 'فحمات فرامل', partNumber: 'BRK-10', quantity: 4, unitPrice: 120 }],
      supplierName: 'مورد القطع الذهبي',
      currency: 'sar',
    });

    const onConfirm = vi.fn();
    const { container } = render(<SmartImportView mode="invoice" onConfirm={onConfirm} />);

    expect(screen.getByText('الاستيراد الذكي للبيانات')).toBeInTheDocument();

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const samplePdf = new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' });
    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [samplePdf] } });
    }

    await waitFor(() => {
      expect(screen.getByTestId('mock-excel-table')).toHaveTextContent('فحمات فرامل');
    });

    fireEvent.click(screen.getByRole('button', { name: /نقل البيانات للفاتورة/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      items: [
        {
          name: 'فحمات فرامل',
          partNumber: 'BRK-10',
          quantity: 4,
          unitPrice: 120,
          warehouse_id: 'wh-main',
        },
      ],
      supplierName: 'مورد القطع الذهبي',
      currency: 'SAR',
    });
  });

  it('shows error toast and stays on upload step when parser returns empty items', async () => {
    vi.mocked(documentAiService.parseDocument).mockResolvedValueOnce({
      items: [],
      supplierName: '',
      currency: 'SAR',
    });

    const onConfirm = vi.fn();
    const { container } = render(<SmartImportView mode="inventory" onConfirm={onConfirm} />);
    const fileInput = container.querySelector('input[type="file"]');
    const samplePdf = new File(['%PDF-1.4'], 'empty.pdf', { type: 'application/pdf' });

    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [samplePdf] } });
    }

    await waitFor(() => {
      const toasts = useFeedbackStore.getState().toasts;
      expect(toasts.some(t => t.type === 'error')).toBe(true);
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('الاستيراد الذكي للبيانات')).toBeInTheDocument();
  });
});
