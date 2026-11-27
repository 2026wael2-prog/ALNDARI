import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock lazy-loaded child sections so tab switching tests run fast and deterministically.
vi.mock('./components/PersonalProfile', () => ({
  default: () => <div data-testid="section-profile">PersonalProfile</div>,
}));
vi.mock('./components/CompanyProfile', () => ({
  default: () => <div data-testid="section-company">CompanyProfile</div>,
}));
vi.mock('./components/branches/BranchManager', () => ({
  default: () => <div data-testid="section-branches">BranchManager</div>,
}));
vi.mock('./components/financial/FinancialSettings', () => ({
  default: () => <div data-testid="section-financial">FinancialSettings</div>,
}));
vi.mock('./components/security/SecuritySettings', () => ({
  default: () => <div data-testid="section-security">SecuritySettings</div>,
}));
vi.mock('./components/backup/BackupPage', () => ({
  default: () => <div data-testid="section-backup">BackupPage</div>,
}));

vi.mock('../../lib/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    dir: 'rtl',
  }),
}));

vi.mock('../../lib/hooks/useBreakpoint', () => ({
  useBreakpoint: () => true,
}));

import SettingsPage from './SettingsPage';

describe('SettingsPage — tab switching & URL query sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switches away from an initial ?tab=financial query param without snapping back', async () => {
    render(
      <MemoryRouter initialEntries={['/settings?tab=financial']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('section-financial')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /company_profile/i }));
    expect(await screen.findByTestId('section-company')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /security_settings/i }));
    expect(await screen.findByTestId('section-security')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^profile/i }));
    expect(await screen.findByTestId('section-profile')).toBeTruthy();
  });

  it('normalizes legacy ?tab=backup query param to the security section', async () => {
    render(
      <MemoryRouter initialEntries={['/settings?tab=backup']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('section-security')).toBeTruthy();
  });
});
