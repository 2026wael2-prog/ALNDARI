
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LayoutDashboard, ReceiptText } from 'lucide-react';
import ClassicRibbon from './ClassicRibbon';
import type { RibbonGroup } from './ribbonModel';

const groups: RibbonGroup[] = [
  {
    id: 'main',
    label: 'الرئيسية',
    items: [{ id: 'dashboard', label: 'لوحة التحكم', path: '/', icon: LayoutDashboard }],
  },
  {
    id: 'sales',
    label: 'المبيعات والتحصيل',
    items: [{ id: 'sales', label: 'المبيعات', path: '/sales', icon: ReceiptText }],
  },
];

describe('ClassicRibbon', () => {
  it('يعرض مجموعات الشريط وتسمياتها', () => {
    render(<ClassicRibbon groups={groups} activePath="/" onNavigate={() => undefined} />);

    expect(screen.getByRole('region', { name: 'الرئيسية' })).toBeDefined();
    expect(screen.getByText('المبيعات والتحصيل')).toBeDefined();
    expect(screen.getByRole('button', { name: 'المبيعات' })).toBeDefined();
  });

  it('يعلّم العنصر النشط بـ aria-current=page فقط', () => {
    render(<ClassicRibbon groups={groups} activePath="/sales" onNavigate={() => undefined} />);

    expect(screen.getByRole('button', { name: 'المبيعات' }).getAttribute('aria-current')).toBe(
      'page'
    );
    expect(
      screen.getByRole('button', { name: 'لوحة التحكم' }).getAttribute('aria-current')
    ).toBeNull();
  });

  it('ينقل إلى مسار العنصر عند النقر', () => {
    const onNavigate = vi.fn();
    render(<ClassicRibbon groups={groups} activePath="/" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'المبيعات' }));

    expect(onNavigate).toHaveBeenCalledWith('/sales');
  });
});
