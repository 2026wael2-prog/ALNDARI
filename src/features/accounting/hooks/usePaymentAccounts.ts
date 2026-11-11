import { useMemo } from 'react';
import { useCashboxes, useExchangeCompanies } from './useTreasury';
import { useAccounts } from './useAccounts';

// ─── Payment Account type used throughout POS & payments ─────────────────────
export interface PaymentAccount {
  id: string;
  cashbox_id?: string;
  exchange_company_id?: string;
  name_ar: string;
  code: string;
  currency_code: string;
  balance: number;
}

// ─── Cash / Cashbox accounts ──────────────────────────────────────────────────

export const useCashPaymentAccounts = (): { data: PaymentAccount[]; isLoading: boolean } => {
  const { data: cashboxes, isLoading } = useCashboxes();
  // Live balance comes from the linked chart-of-accounts entry (trial balance),
  // not the static opening_balance stored on the cashbox row.
  const { data: allAccounts } = useAccounts();
  const accounts = useMemo<PaymentAccount[]>(
    () =>
      (cashboxes ?? []).map(cb => {
        const linked = allAccounts?.find(a => a.id === cb.account_id);
        return {
          id: cb.account_id ?? cb.id, // account_id for journal entries
          cashbox_id: cb.id,
          name_ar: cb.name,
          code: linked?.code ?? '',
          currency_code: cb.currency_code,
          balance: linked?.balance ?? (cb.opening_balance || 0),
        };
      }),
    [cashboxes, allAccounts]
  );
  return { data: accounts, isLoading };
};

// ─── Exchange company accounts ────────────────────────────────────────────────

export const useExchangePaymentAccounts = (): { data: PaymentAccount[]; isLoading: boolean } => {
  const { data: companies, isLoading } = useExchangeCompanies();
  const { data: allAccounts } = useAccounts();
  const accounts = useMemo<PaymentAccount[]>(
    () =>
      (companies ?? []).map(ec => {
        const linked = allAccounts?.find(a => a.id === ec.account_id);
        return {
          id: ec.account_id ?? ec.id,
          exchange_company_id: ec.id,
          name_ar: ec.name,
          code: linked?.code ?? '',
          currency_code: ec.currency_code,
          balance: linked?.balance ?? (ec.opening_balance || 0),
        };
      }),
    [companies, allAccounts]
  );
  return { data: accounts, isLoading };
};

// ─── Legacy combined hook (unified source of truth) ───────────────────
export const usePaymentAccounts = (): { data: PaymentAccount[]; isLoading: boolean } => {
  const { data: cash, isLoading: l1 } = useCashPaymentAccounts();
  const { data: exchanges, isLoading: l2 } = useExchangePaymentAccounts();
  const { data: allAccounts, isLoading: l3 } = useAccounts();

  const data = useMemo<PaymentAccount[]>(() => {
    const list: PaymentAccount[] = [...cash, ...exchanges];

    // Source-of-truth fallback:
    // - 102% (Bank accounts) are company-wide and not stored in fin_cashboxes / fin_exchange_companies, so always include active leaf 102% accounts.
    // - 101% (Cashboxes) and 103% (Exchange companies) are branch-scoped via fin_cashboxes and fin_exchange_companies.
    //   Only fall back to Chart of Accounts 101% / 103% if the active branch has 0 cashboxes / 0 exchange companies configured.
    if (allAccounts && allAccounts.length > 0) {
      const existingAccountIds = new Set(list.map(p => p.id));
      const hasBranchCashboxes = cash.length > 0;
      const hasBranchExchanges = exchanges.length > 0;
      const operationalTreasuryAccounts = allAccounts.filter(
        a =>
          Boolean(a.allow_posting) &&
          (a.code.startsWith('102') ||
            (!hasBranchCashboxes && a.code.startsWith('101')) ||
            (!hasBranchExchanges && a.code.startsWith('103'))) &&
          !allAccounts.some(child => child.parent_id === a.id) && // leaf nodes only
          !existingAccountIds.has(a.id)
      );

      operationalTreasuryAccounts.forEach(acc => {
        list.push({
          id: acc.id,
          name_ar: acc.name,
          code: acc.code,
          currency_code: acc.currency_code,
          balance: acc.balance || 0,
        });
      });
    }

    return list;
  }, [cash, exchanges, allAccounts]);

  return { data, isLoading: l1 || l2 || l3 };
};
