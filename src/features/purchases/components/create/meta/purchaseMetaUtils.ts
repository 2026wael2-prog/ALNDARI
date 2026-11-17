import type { PaymentAccount } from '../../../../accounting/hooks/usePaymentAccounts';
import type { Warehouse as WarehouseType } from '../../../../inventory/types';

export const isPaymentAccount = (value: unknown): value is PaymentAccount => {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.name_ar === 'string' &&
    typeof row.currency_code === 'string'
  );
};

export const isWarehouse = (value: unknown): value is WarehouseType => {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.name_ar === 'string';
};

export const findMatchingAccount = (
  accounts: PaymentAccount[],
  currency: string
): PaymentAccount | undefined => {
  const norm = (currency || 'SAR').toUpperCase();
  const terms =
    norm === 'SAR'
      ? ['SAR', 'سعودي', 'ريال سعودي']
      : norm === 'YER'
        ? ['YER', 'يمني', 'ريال يمني']
        : [norm];
  return accounts.find(account => {
    const accCurr = (account.currency_code ?? '').toUpperCase();
    const currencyMatches = accCurr !== '' && accCurr === norm;
    const searchable = `${account.name_ar} ${account.code ?? ''}`.toLowerCase();
    const termMatches = terms.some(term => searchable.includes(term.toLowerCase()));
    return currencyMatches || termMatches;
  });
};
