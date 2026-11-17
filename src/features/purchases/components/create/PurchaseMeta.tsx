import React, { useState } from 'react';
import { useSupplierSearch } from '../../hooks';
import { usePurchaseStore } from '../../store';
import { usePaymentAccounts } from '../../../accounting/hooks/index';
import { useCurrencies } from '../../../settings/hooks';
import { useWarehouses } from '../../../inventory/hooks/useWarehouses';
import {
  resolveAutoExchangeRate,
  getDefaultExchangeOperator,
} from '../../../../core/utils/currencyUtils';
import { findMatchingAccount, isPaymentAccount, isWarehouse } from './meta/purchaseMetaUtils';
import { SupplierHeader } from './meta/SupplierHeader';
import { MetadataGrid } from './meta/MetadataGrid';

const PurchaseMeta: React.FC = () => {
  const {
    supplier,
    setSupplier,
    invoiceNumber,
    issueDate,
    currency,
    exchangeRate,
    warehouseId,
    invoiceType,
    cashboxId,
    notes,
    setMetadata,
  } = usePurchaseStore();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const { data: supplierRows } = useSupplierSearch(query);
  const suppliers = supplierRows ?? [];
  const { data: cashAccounts } = usePaymentAccounts();
  const paymentAccounts = cashAccounts.filter(isPaymentAccount);
  const { currencies, rates } = useCurrencies();
  const currencyRows = currencies.data ?? [];
  const { data: warehouses } = useWarehouses();
  const warehouseRows = (warehouses ?? []).filter(isWarehouse);
  const prevCurrency = React.useRef(currency);
  const ratesLoaded = React.useRef(false);

  const resolveCurrencyRate = React.useCallback(
    (targetCurrency: string) => {
      if (targetCurrency === 'SAR') return 1;
      return resolveAutoExchangeRate(
        targetCurrency,
        rates.data ?? [],
        currencyRows as Array<{ code: string; exchange_operator?: 'multiply' | 'divide' }>
      );
    },
    [rates.data, currencyRows]
  );

  React.useEffect(() => {
    const currencyChanged = prevCurrency.current !== currency;
    const rateRows = rates.data ?? [];
    const ratesJustLoaded = !ratesLoaded.current && rateRows.length > 0;

    if (currency === 'SAR') {
      if (exchangeRate !== 1) {
        setMetadata('exchangeRate', 1);
      }
    } else if (currencyChanged || ratesJustLoaded) {
      setMetadata('exchangeRate', resolveCurrencyRate(currency));
    }

    if (rateRows.length > 0) ratesLoaded.current = true;
    const isCashboxValid = Boolean(
      cashboxId && paymentAccounts.some(acc => acc.id === cashboxId)
    );
    if ((currencyChanged || !isCashboxValid) && paymentAccounts.length > 0) {
      const matchingAccount = findMatchingAccount(paymentAccounts, currency);
      setMetadata(
        'cashboxId',
        matchingAccount !== undefined ? matchingAccount.id : paymentAccounts[0]?.id ?? ''
      );
    }

    const isWarehouseValid = Boolean(
      warehouseId && warehouseRows.some(w => w.id === warehouseId)
    );
    if (warehouseRows.length > 0 && !isWarehouseValid) {
      const primaryWh = warehouseRows.find(
        w => (w as unknown as { is_primary?: boolean }).is_primary
      );
      const targetWh = primaryWh ?? warehouseRows[0];
      if (targetWh) {
        setMetadata('warehouseId', targetWh.id);
      }
    }

    prevCurrency.current = currency;
  }, [
    currency,
    cashboxId,
    warehouseId,
    warehouseRows,
    paymentAccounts,
    rates.data,
    exchangeRate,
    resolveCurrencyRate,
    setMetadata,
  ]);

  const handleMetadataChange = (field: string, value: string) => {
    setMetadata(field, value);
    if (field === 'currency') {
      prevCurrency.current = value;
      setMetadata('exchangeRate', resolveCurrencyRate(value));
      const matching = findMatchingAccount(paymentAccounts, value);
      if (matching !== undefined) {
        setMetadata('cashboxId', matching.id);
      }
    }
  };

  const currencyObj = currencyRows.find(item => item.code === currency);
  const isDivide =
    currencyObj?.exchange_operator === 'divide' ||
    getDefaultExchangeOperator(currency) === 'divide';

  return (
    <div className="flex flex-col border-b bg-blue-50/20 dark:border-slate-800 dark:bg-slate-950/20">
      <SupplierHeader
        supplier={supplier}
        query={query}
        isOpen={isOpen}
        suppliers={suppliers}
        setSupplier={setSupplier}
        setQuery={setQuery}
        setIsOpen={setIsOpen}
      />
      <MetadataGrid
        issueDate={issueDate}
        invoiceNumber={invoiceNumber}
        invoiceType={invoiceType}
        cashboxId={cashboxId}
        warehouseId={warehouseId}
        currency={currency}
        exchangeRate={exchangeRate}
        isDivide={isDivide}
        notes={notes}
        paymentAccounts={paymentAccounts}
        warehouses={warehouseRows}
        currencies={currencyRows}
        onChange={handleMetadataChange}
        onRateChange={value => {
          setMetadata('exchangeRate', value);
        }}
      />
    </div>
  );
};

export default PurchaseMeta;
