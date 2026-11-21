import { isTreasuryAccount } from '../services/reportService';

export interface TreasuryAccountLike {
  id: string;
  code: string;
  name?: string | undefined;
  name_ar?: string | undefined;
  type?: string | undefined;
  allow_posting?: boolean | undefined;
}

/**
 * Bank accounts (`102xx`) are company-wide and not stored in `cashboxes` or `exchange_companies`.
 */
export const isCompanyWideBankAccount = (code: string): boolean =>
  (code || '').trim().toUpperCase().startsWith('102');

/**
 * Determines whether a Chart-of-Accounts leaf node should be appended to `usePaymentAccounts()`
 * as a fallback treasury account.
 *
 * Strict branch isolation rule:
 * - When a specific `branchId` is active (`branchId !== null`), NEVER fall back to company-wide
 *   `101xx` / `103xx` accounts — those belong to other branches (e.g., Ghamdan accounts leaking
 *   into Wael branch). Only company-wide `102xx` bank accounts are appended.
 * - When `branchId === null` (All Branches admin view), legacy `101xx` / `103xx` fallback still
 *   applies if no cashboxes/exchange companies exist.
 */
export const shouldIncludeFallbackPaymentAccount = (params: {
  account: TreasuryAccountLike;
  branchId: string | null;
  hasBranchCashboxes: boolean;
  hasBranchExchanges: boolean;
  existingAccountIds: ReadonlySet<string>;
  parentAccountIds: ReadonlySet<string>;
}): boolean => {
  const {
    account,
    branchId,
    hasBranchCashboxes,
    hasBranchExchanges,
    existingAccountIds,
    parentAccountIds,
  } = params;

  if (!account.allow_posting) return false;
  if (parentAccountIds.has(account.id)) return false;
  if (existingAccountIds.has(account.id)) return false;

  const code = (account.code || '').trim().toUpperCase();
  if (isCompanyWideBankAccount(code)) return true;

  // Strict branch isolation: never leak another branch's 101*/103* accounts into a branch view.
  if (branchId !== null && branchId !== '') {
    return false;
  }

  return (
    (!hasBranchCashboxes && code.startsWith('101')) ||
    (!hasBranchExchanges && code.startsWith('103'))
  );
};

/**
 * Determines whether a Chart-of-Accounts row belongs to the active branch's Treasury view
 * (TreasurySidebar & TreasuryView default selection).
 *
 * - Specific branch active (`branchId !== null`): strictly show ONLY accounts linked to that
 *   branch's `cashboxes` / `exchange_companies` (plus company-wide `102*` bank accounts).
 * - All Branches mode (`branchId === null`): show all company treasury accounts via `isTreasuryAccount`.
 */
export const isBranchScopedTreasuryAccount = (
  account: TreasuryAccountLike,
  linkedAccountIds: ReadonlySet<string>,
  branchId: string | null
): boolean => {
  if (branchId !== null && branchId !== '') {
    return linkedAccountIds.has(account.id) || isCompanyWideBankAccount(account.code);
  }
  return isTreasuryAccount(account, linkedAccountIds as Set<string>, account.id);
};
