import React from 'react';
// Fix: Corrected import path to point to the barrel file.
import { useAccounts } from '../../hooks/index';
import { Wallet, Landmark, Users, Building, Loader2 } from 'lucide-react';
import { formatCurrency } from '../../../../core/utils';
import type { Account } from '../../types/models';
import Card from '../../../../ui/base/Card';

const KeyAccountBalances: React.FC = () => {
  const { data: accounts, isLoading } = useAccounts();

  const keyAccounts = [
    { code: '1010', label: 'الصناديق', icon: Wallet, color: 'text-emerald-500' },
    { code: '1020', label: 'البنوك', icon: Landmark, color: 'text-blue-500' },
    { code: '1100', label: 'ذمم العملاء', icon: Users, color: 'text-amber-500' },
    { code: '2100', label: 'ذمم الموردين', icon: Building, color: 'text-rose-500' },
  ];

  if (isLoading) {
    return (
      <Card variant="ledger" className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-[var(--app-text-secondary)]" />
      </Card>
    );
  }

  const computeCategorySummary = (
    key: 'cashbox' | 'bank' | 'receivable' | 'payable'
  ): { hasAccount: boolean; totalBalance: number } => {
    if (!accounts || accounts.length === 0) return { hasAccount: false, totalBalance: 0 };

    const hasAnyKeyword = (text: string, keywords: string[]) =>
      keywords.some(k => text.includes(k));

    const isBankAccount = (a: Account): boolean => {
      if (a.type !== 'asset') return false;
      const code = a.code.trim().toUpperCase();
      const nameLower = `${a.name || ''} ${a.name_ar || ''}`.toLowerCase();
      return (
        code.startsWith('102') ||
        code.startsWith('103') ||
        hasAnyKeyword(nameLower, ['بنك', 'مصرف', 'الكريمي', 'bank'])
      );
    };

    const isReceivableAccount = (a: Account): boolean => {
      if (a.type !== 'asset') return false;
      const code = a.code.trim().toUpperCase();
      const nameLower = `${a.name || ''} ${a.name_ar || ''}`.toLowerCase();
      return (
        code.startsWith('1100') ||
        code.startsWith('121') ||
        code.startsWith('MZ-121') ||
        hasAnyKeyword(nameLower, ['عملاء', 'عميل', 'مدينون', 'ذمم مدين', 'customer', 'receivable'])
      );
    };

    const matched = accounts.filter(a => {
      const code = a.code.trim().toUpperCase();
      const nameLower = `${a.name || ''} ${a.name_ar || ''}`.toLowerCase();

      switch (key) {
        case 'cashbox':
          return (
            a.type === 'asset' &&
            !isBankAccount(a) &&
            !isReceivableAccount(a) &&
            (code.startsWith('101') ||
              code.startsWith('111') ||
              code.startsWith('MZ-13') ||
              code.startsWith('MZ-14') ||
              hasAnyKeyword(nameLower, ['صندوق', 'خزنة', 'خزينة', 'نقد', 'cash']))
          );
        case 'bank':
          return isBankAccount(a);
        case 'receivable':
          return isReceivableAccount(a);
        case 'payable':
          return (
            a.type === 'liability' &&
            (code.startsWith('2100') ||
              code.startsWith('231') ||
              code.startsWith('MZ-231') ||
              code.startsWith('221') ||
              code.startsWith('MZ-221') ||
              hasAnyKeyword(nameLower, ['مورد', 'دائنون', 'ذمم دائن', 'supplier', 'payable']))
          );
      }
    });

    if (matched.length === 0) return { hasAccount: false, totalBalance: 0 };

    const parentIds = new Set(accounts.map(a => a.parent_id).filter(Boolean));
    const leafMatches = matched.filter(a => !parentIds.has(a.id));
    const targetAccounts = leafMatches.length > 0 ? leafMatches : matched;

    const totalBalance = targetAccounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
    return { hasAccount: true, totalBalance };
  };

  const categoryByCode: Record<string, 'cashbox' | 'bank' | 'receivable' | 'payable'> = {
    '1010': 'cashbox',
    '1020': 'bank',
    '1100': 'receivable',
    '2100': 'payable',
  };

  return (
    <Card variant="ledger">
      <h3 className="mb-3 px-1 text-[10px] font-bold uppercase tracking-widest text-[var(--app-text-secondary)]">
        أرصدة رئيسية
      </h3>
      <div className="space-y-1">
        {keyAccounts.map(ka => {
          const summary = computeCategorySummary(categoryByCode[ka.code] ?? 'cashbox');
          const { hasAccount, totalBalance } = summary;
          return (
            <div
              key={ka.code}
              className="flex items-center justify-between p-2 transition-colors hover:bg-[var(--app-surface-hover)]"
            >
              <div className="flex items-center gap-2">
                <ka.icon size={14} className={ka.color} />
                <span className="text-[11px] font-bold text-[var(--app-text)]">{ka.label}</span>
              </div>
              <span
                dir="ltr"
                className={`font-mono text-[11px] font-bold ${(totalBalance ?? 0) < 0 ? 'text-rose-600' : 'text-[var(--app-text)]'}`}
              >
                {hasAccount ? formatCurrency(totalBalance ?? 0) : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default KeyAccountBalances;
