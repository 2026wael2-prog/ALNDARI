import { useMemo } from 'react';
import { useCashboxes, useExchangeCompanies } from './useTreasury';
import { useAccounts } from './useAccounts';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';
import { shouldIncludeFallbackPaymentAccount } from '../utils/branchTreasuryFilter';

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
  const { branchId } = useBranchFilter();

  const data = useMemo<PaymentAccount[]>(() => {
    const list: PaymentAccount[] = [...cash, ...exchanges];

    // Source-of-truth fallback:
    // - 102% (Bank accounts) are company-wide and not stored in cashboxes / exchange_companies, so include active leaf 102% accounts.
    // - 101% (Cashboxes) and 103% (Exchange companies) are strictly branch-scoped via cashboxes and exchange_companies.
    //   When a specific branch is active, NEVER fall back to another branch's 101%/103% accounts.
    if (allAccounts && allAccounts.length > 0) {
      const existingAccountIds = new Set(list.map(p => p.id));
      const parentAccountIds = new Set(
        allAccounts.map(child => child.parent_id).filter((id): id is string => Boolean(id))
      );
      const hasBranchCashboxes = cash.length > 0;
      const hasBranchExchanges = exchanges.length > 0;
      const operationalTreasuryAccounts = allAccounts.filter(account =>
        shouldIncludeFallbackPaymentAccount({
          account,
          branchId,
          hasBranchCashboxes,
          hasBranchExchanges,
          existingAccountIds,
          parentAccountIds,
        })
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
  }, [cash, exchanges, allAccounts, branchId]);

  return {
    data,
    isLoading: cash.length > 0 || exchanges.length > 0 ? l1 || l2 : l1 || l2 || l3,
  };
};
