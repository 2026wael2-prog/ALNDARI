import { describe, it, expect } from 'vitest';
import {
  isBranchScopedTreasuryAccount,
  shouldIncludeFallbackPaymentAccount,
  type TreasuryAccountLike,
} from './branchTreasuryFilter';

const WAEL_BRANCH_ID = 'd8771318-20f8-4260-9ac6-e40c3378a5e1';

const ghamdanCashbox: TreasuryAccountLike = {
  id: 'acc-ghamdan-101001',
  code: '101001',
  name: 'الصندوق العام',
  type: 'asset',
  allow_posting: true,
};

const ghamdanExchange: TreasuryAccountLike = {
  id: 'acc-ghamdan-103001',
  code: '103001',
  name: 'شركة البسيري للصرافة',
  type: 'asset',
  allow_posting: true,
};

const waelCashbox: TreasuryAccountLike = {
  id: 'acc-wael-mz135',
  code: 'MZ-135',
  name: 'صندوق سعودي',
  type: 'asset',
  allow_posting: true,
};

const waelExchange: TreasuryAccountLike = {
  id: 'acc-wael-mz143',
  code: 'MZ-143',
  name: 'صرافة البسيري سعودي',
  type: 'asset',
  allow_posting: true,
};

const companyBank: TreasuryAccountLike = {
  id: 'acc-bank-102001',
  code: '102001',
  name: 'البنك الأهلي',
  type: 'asset',
  allow_posting: true,
};

describe('branchTreasuryFilter', () => {
  it('never leaks Ghamdan 101*/103* accounts into Wael branch payment accounts even if branch lists are empty', () => {
    const empty = new Set<string>();

    expect(
      shouldIncludeFallbackPaymentAccount({
        account: ghamdanCashbox,
        branchId: WAEL_BRANCH_ID,
        hasBranchCashboxes: false,
        hasBranchExchanges: false,
        existingAccountIds: empty,
        parentAccountIds: empty,
      })
    ).toBe(false);

    expect(
      shouldIncludeFallbackPaymentAccount({
        account: ghamdanExchange,
        branchId: WAEL_BRANCH_ID,
        hasBranchCashboxes: false,
        hasBranchExchanges: false,
        existingAccountIds: empty,
        parentAccountIds: empty,
      })
    ).toBe(false);

    // Company-wide 102* bank accounts remain allowed
    expect(
      shouldIncludeFallbackPaymentAccount({
        account: companyBank,
        branchId: WAEL_BRANCH_ID,
        hasBranchCashboxes: true,
        hasBranchExchanges: true,
        existingAccountIds: empty,
        parentAccountIds: empty,
      })
    ).toBe(true);
  });

  it('allows legacy 101*/103* fallback only in All Branches mode (branchId === null)', () => {
    const empty = new Set<string>();

    expect(
      shouldIncludeFallbackPaymentAccount({
        account: ghamdanCashbox,
        branchId: null,
        hasBranchCashboxes: false,
        hasBranchExchanges: false,
        existingAccountIds: empty,
        parentAccountIds: empty,
      })
    ).toBe(true);

    expect(
      shouldIncludeFallbackPaymentAccount({
        account: ghamdanExchange,
        branchId: null,
        hasBranchCashboxes: true,
        hasBranchExchanges: false,
        existingAccountIds: empty,
        parentAccountIds: empty,
      })
    ).toBe(true);
  });

  it('strictly isolates TreasurySidebar accounts to the active branch cashboxes & exchange companies', () => {
    const waelLinkedIds = new Set<string>([waelCashbox.id, waelExchange.id]);

    expect(isBranchScopedTreasuryAccount(waelCashbox, waelLinkedIds, WAEL_BRANCH_ID)).toBe(true);
    expect(isBranchScopedTreasuryAccount(waelExchange, waelLinkedIds, WAEL_BRANCH_ID)).toBe(true);
    expect(isBranchScopedTreasuryAccount(companyBank, waelLinkedIds, WAEL_BRANCH_ID)).toBe(true);

    // Ghamdan's accounts MUST NOT appear in Wael's branch treasury sidebar
    expect(isBranchScopedTreasuryAccount(ghamdanCashbox, waelLinkedIds, WAEL_BRANCH_ID)).toBe(
      false
    );
    expect(isBranchScopedTreasuryAccount(ghamdanExchange, waelLinkedIds, WAEL_BRANCH_ID)).toBe(
      false
    );
  });

  it('shows all company treasury accounts in All Branches mode (branchId === null)', () => {
    const waelLinkedIds = new Set<string>([waelCashbox.id]);

    expect(isBranchScopedTreasuryAccount(waelCashbox, waelLinkedIds, null)).toBe(true);
    expect(isBranchScopedTreasuryAccount(ghamdanCashbox, waelLinkedIds, null)).toBe(true);
    expect(isBranchScopedTreasuryAccount(ghamdanExchange, waelLinkedIds, null)).toBe(true);
  });
});
