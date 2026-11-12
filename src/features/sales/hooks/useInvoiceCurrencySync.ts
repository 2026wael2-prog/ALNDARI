import { useEffect, useRef } from 'react';
import { useSalesStore } from '../store';
import { usePaymentAccounts } from '../../accounting/hooks/index';
import { useWarehouses } from '../../inventory/hooks/useInventoryManagement';
import { useCurrencies } from '../../settings/hooks';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';
import {
  resolveAutoExchangeRate,
  getDefaultExchangeOperator,
} from '../../../core/utils/currencyUtils';

/**
 * useInvoiceCurrencySync
 * Encapsulates branch-aware currency detection, automated exchange rate lookup,
 * auto-matching treasury cashboxes based on active invoice currency, and primary warehouse fallback.
 */
export const useInvoiceCurrencySync = () => {
  const {
    currency,
    warehouseId,
    cashboxId,
    setMetadata,
  } = useSalesStore();

  const { data: paymentAccounts } = usePaymentAccounts();
  const { data: warehouses } = useWarehouses();
  const { currencies, rates } = useCurrencies();
  const { branchId, branchName } = useBranchFilter();
  const prevCurrency = useRef(currency);
  const ratesLoaded = useRef(false);

  // Automatic Branch-Aware Currency Initialization:
  // If active branch is Wael's branch or has YER saved as preferred currency,
  // automatically initialize the invoice currency to YER instead of forcing SAR.
  useEffect(() => {
    const isWaelBranch =
      Boolean(
        branchName &&
          (branchName.includes('وائل') ||
            branchName.includes('النظاري') ||
            branchName.toLowerCase().includes('wael'))
      ) || (branchId ? localStorage.getItem(`branch_pref_currency_${branchId}`) === 'YER' : false);

    if (isWaelBranch && currency === 'SAR' && rates.data) {
      const preferred = (branchId && localStorage.getItem(`branch_pref_currency_${branchId}`)) || 'YER';
      const autoRate = resolveAutoExchangeRate(
        preferred,
        rates.data,
        currencies.data as Array<{ code: string; exchange_operator?: 'multiply' | 'divide' }>
      );
      prevCurrency.current = preferred;
      setMetadata('currency', preferred);
      setMetadata('exchangeRate', autoRate);
      setMetadata('exchangeOperator', getDefaultExchangeOperator(preferred));
    }
  }, [branchId, branchName, rates.data, currencies.data, currency, setMetadata]);

  useEffect(() => {
    const currencyChanged = prevCurrency.current !== currency;
    const ratesJustLoaded = !ratesLoaded.current && Boolean(rates.data);

    if ((currencyChanged || ratesJustLoaded) && rates.data) {
      if (currency === 'SAR') {
        setMetadata('exchangeRate', 1);
        setMetadata('exchangeOperator', 'multiply');
      } else {
        const autoRate = resolveAutoExchangeRate(
          currency,
          rates.data,
          currencies.data as Array<{ code: string; exchange_operator?: 'multiply' | 'divide' }>
        );
        setMetadata('exchangeRate', autoRate);
        const currencyConfig = (
          currencies.data as Array<{ code: string; exchange_operator: string }>
        )?.find(c => c.code === currency);
        setMetadata(
          'exchangeOperator',
          (currencyConfig?.exchange_operator as 'multiply' | 'divide') ||
            getDefaultExchangeOperator(currency)
        );
      }
    }

    if (rates.data) {
      ratesLoaded.current = true;
    }

    // Auto-Treasury (Cashbox) Selection on currency change
    const isCashboxValid = Boolean(
      cashboxId && paymentAccounts?.some(acc => acc.id === cashboxId)
    );
    if ((currencyChanged || !isCashboxValid) && paymentAccounts && paymentAccounts.length > 0) {
      const normalizedCurrency = (currency || 'SAR').toUpperCase();
      const searchTerms = [
        normalizedCurrency,
        ...(normalizedCurrency === 'SAR'
          ? ['سعودي', 'ريال سعودي']
          : normalizedCurrency === 'YER'
            ? ['يمني', 'ريال يمني']
            : []),
      ];
      const matchingAccount = paymentAccounts.find(acc => {
        const accCurrency = (acc.currency_code ?? '').toUpperCase();
        const currencyMatches = accCurrency !== '' && accCurrency === normalizedCurrency;
        const searchableText = `${acc.name_ar} ${acc.code ?? ''}`.toLowerCase();
        const keywordMatches = searchTerms.some(term =>
          searchableText.includes(term.toLowerCase())
        );
        return currencyMatches || keywordMatches;
      });

      setMetadata('cashboxId', matchingAccount ? matchingAccount.id : paymentAccounts[0]?.id ?? '');
    }

    // Default primary warehouse selection
    const castWarehouses = (warehouses ?? []) as Array<Record<string, unknown>>;
    const isWarehouseValid = Boolean(
      warehouseId && warehouseId !== 'wh_main' && castWarehouses.some(w => w.id === warehouseId)
    );
    if (castWarehouses.length > 0 && !isWarehouseValid) {
      const primary = castWarehouses.find(w => w.is_primary);
      const target = primary || castWarehouses[0];
      if (target?.id) {
        setMetadata('warehouseId', target.id as string);
      }
    }

    prevCurrency.current = currency;
  }, [
    currency,
    cashboxId,
    paymentAccounts,
    rates.data,
    warehouses,
    warehouseId,
    currencies.data,
    setMetadata,
  ]);

  const handleCurrencyChange = (newCurr: string) => {
    prevCurrency.current = newCurr;
    setMetadata('currency', newCurr);

    if (branchId) {
      try {
        localStorage.setItem(`branch_pref_currency_${branchId}`, newCurr);
      } catch {
        // ignore quota errors
      }
    }

    if (newCurr === 'SAR') {
      setMetadata('exchangeRate', 1);
      setMetadata('exchangeOperator', 'multiply');
    } else {
      const autoRate = resolveAutoExchangeRate(
        newCurr,
        rates.data ?? [],
        currencies.data as Array<{
          code: string;
          exchange_operator?: 'multiply' | 'divide';
        }>
      );
      setMetadata('exchangeRate', autoRate);
      const currencyConfig = (
        currencies.data as Array<{ code: string; exchange_operator: string }>
      )?.find(c => c.code === newCurr);
      setMetadata(
        'exchangeOperator',
        (currencyConfig?.exchange_operator as 'multiply' | 'divide') ||
          getDefaultExchangeOperator(newCurr)
      );
    }

    if (paymentAccounts && paymentAccounts.length > 0) {
      const normalizedCurrency = (newCurr || 'SAR').toUpperCase();
      const searchTerms = [
        normalizedCurrency,
        ...(normalizedCurrency === 'SAR'
          ? ['سعودي', 'ريال سعودي']
          : normalizedCurrency === 'YER'
            ? ['يمني', 'ريال يمني']
            : []),
      ];
      const matchingAccount = paymentAccounts.find(acc => {
        const accCurrency = (acc.currency_code ?? '').toUpperCase();
        const currencyMatches = accCurrency !== '' && accCurrency === normalizedCurrency;
        const searchableText = `${acc.name_ar} ${acc.code ?? ''}`.toLowerCase();
        const keywordMatches = searchTerms.some(term =>
          searchableText.includes(term.toLowerCase())
        );
        return currencyMatches || keywordMatches;
      });

      setMetadata('cashboxId', matchingAccount ? matchingAccount.id : '');
    }
  };

  return {
    currencies,
    rates,
    paymentAccounts,
    warehouses,
    handleCurrencyChange,
  };
};
