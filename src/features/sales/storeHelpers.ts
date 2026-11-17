import { convertCurrency } from '../../core/utils/currencyUtils';
import { logger } from '../../core/utils/logger';
import { useFeedbackStore } from '../feedback/store';
import type { Product } from '../inventory/types';

/**
 * SalesCartItem - Used for the sales cart/UI state
 * Different from InvoiceItem in types.ts which represents database records
 */
export interface SalesCartItem {
  id: string;
  productId: string;
  sku: string;
  name: string;
  partNumber?: string;
  brand?: string;
  quantity: number;
  basePrice: number;
  price: number;
  discount: number;
  costPrice: number;
  warehouse_distribution?:
    Array<{ warehouse_id: string; warehouse_name: string; quantity: number }> | undefined;
}

export interface SalesSummary {
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
}

export const createNewItem = (): SalesCartItem => ({
  id: crypto.randomUUID(),
  productId: '',
  sku: '',
  name: '',
  partNumber: '',
  brand: '',
  quantity: 0,
  basePrice: 0,
  price: 0,
  discount: 0,
  costPrice: 0,
});

/** Validate exchange rate before any foreign-currency conversion. */
export const assertValidExchangeRate = (currency: string, rate: number): boolean => {
  if (currency !== 'SAR' && (!rate || rate <= 0)) {
    useFeedbackStore
      .getState()
      .showToast(
        'لا يمكن تحويل العملة: سعر الصرف غير صالح (صفر أو سالب). يرجى ضبط سعر الصرف أولاً.',
        'error'
      );
    return false;
  }
  return true;
};

/** Safely convert a base-currency price to the current foreign currency. */
export const safeConvertFromBase = (
  basePrice: number,
  currency: string,
  rate: number,
  operator: 'multiply' | 'divide',
  context: string
): { price: number; failed: boolean } => {
  if (currency === 'SAR') return { price: basePrice, failed: false };
  try {
    return { price: convertCurrency(basePrice, rate, 'fromBase', operator), failed: false };
  } catch (e) {
    logger.error('SalesStore', `Invalid exchange rate for ${context}`, { rate, currency });
    useFeedbackStore
      .getState()
      .showToast('خطأ في تحويل العملة: ' + ((e as Error)?.message || 'سعر صرف غير صالح'), 'error');
    return { price: basePrice, failed: true };
  }
};

export const buildCartItemFromProduct = (
  product: Product,
  convertedPrice: number,
  existingRow?: Partial<SalesCartItem>
): SalesCartItem => ({
  ...createNewItem(),
  ...existingRow,
  id: existingRow?.id ?? crypto.randomUUID(),
  productId: product.id,
  name: product.name,
  sku: product.sku,
  partNumber: product.part_number || '',
  brand: product.brand || '',
  quantity: 1,
  basePrice: product.selling_price || 0,
  price: convertedPrice,
  costPrice: product.cost_price || 0,
  warehouse_distribution: product.warehouse_distribution,
});

export const computeCartSummary = (
  items: SalesCartItem[],
  applyDiscount: boolean
): SalesSummary => {
  let subtotal = 0;
  let discountAmount = 0;

  items.forEach(item => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    subtotal += qty * price;
    if (applyDiscount) {
      discountAmount += Number(item.discount) || 0;
    }
  });

  const roundedSubtotal = Math.round(subtotal * 100) / 100;
  const roundedDiscount = Math.round(discountAmount * 100) / 100;
  const totalAmount = Math.round((roundedSubtotal - roundedDiscount) * 100) / 100;

  return { subtotal: roundedSubtotal, discountAmount: roundedDiscount, totalAmount };
};

export const resolveCurrencyRateAndOperator = (
  currency: string,
  currentRate: number,
  currentOperator: 'multiply' | 'divide',
  customRate?: number,
  customOperator?: 'multiply' | 'divide',
  preserveWhenUnitRate = false
): { rate: number; operator: 'multiply' | 'divide' } => {
  if (currency === 'SAR') {
    return { rate: 1, operator: 'multiply' };
  }

  let newRate = customRate ?? currentRate;
  let newOperator = customOperator ?? currentOperator;
  const shouldFallback =
    customRate === undefined || customRate <= 0 || (preserveWhenUnitRate && newRate === 1);

  if (shouldFallback) {
    if (currency === 'YER') {
      newRate = currentRate && currentRate > 1 ? currentRate : 410;
      newOperator = 'divide';
    } else if (currency === 'USD') {
      newRate = currentRate && currentRate !== 1 ? currentRate : 3.75;
      newOperator = 'multiply';
    }
  }

  return { rate: newRate, operator: newOperator };
};

export const repriceItemsFromBase = (
  items: SalesCartItem[],
  currency: string,
  rate: number,
  operator: 'multiply' | 'divide',
  context: string
): SalesCartItem[] => {
  const isForeign = currency !== 'SAR';
  return items.map(item => {
    if (!item.productId) return item;
    if (!isForeign) return { ...item, price: item.basePrice };

    try {
      const newPrice = convertCurrency(item.basePrice, rate, 'fromBase', operator);
      return { ...item, price: newPrice };
    } catch {
      logger.error('SalesStore', `Invalid rate in ${context}`, { rate, currency });
      return item;
    }
  });
};

export const repriceItemsToBase = (
  items: SalesCartItem[],
  rate: number,
  operator: 'multiply' | 'divide'
): SalesCartItem[] =>
  items.map(item => {
    if (!item.productId && item.price === 0) return item;
    let newBasePrice = item.price;
    try {
      newBasePrice = convertCurrency(item.price, rate, 'toBase', operator);
    } catch {
      newBasePrice = item.price;
    }
    return { ...item, basePrice: newBasePrice };
  });
