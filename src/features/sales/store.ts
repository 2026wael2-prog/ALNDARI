import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../../core/constants';
import type { Product } from '../inventory/types';
import { useDiscountStore } from '../settings/taxDiscountStore';
import {
  assertValidExchangeRate,
  buildCartItemFromProduct,
  computeCartSummary,
  createNewItem,
  repriceItemsFromBase,
  repriceItemsToBase,
  resolveCurrencyRateAndOperator,
  safeConvertFromBase,
  type SalesCartItem,
  type SalesSummary,
} from './storeHelpers';

export type { SalesCartItem, SalesSummary } from './storeHelpers';

interface SalesState {
  items: SalesCartItem[];
  selectedCustomer: { id: string; name: string; phone?: string; type?: string } | null;
  summary: SalesSummary;
  invoiceType: 'cash' | 'credit';
  currency: string;
  exchangeRate: number;
  exchangeOperator: 'multiply' | 'divide';
  warehouseId: string;
  cashboxId: string;
  paidAmount: number;
  showDiscount: boolean;
  notes: string;

  initializeItems: (count: number) => void;
  updateItem: (index: number, field: keyof SalesCartItem, value: string | number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  setProductForRow: (index: number, product: Product) => void;
  addItem: () => void;
  addProductToCart: (product: Product) => void;
  removeItem: (idOrIndex: number | string) => void;
  calculateTotals: () => void;
  setCustomer: (
    customer: { id: string; name: string; phone?: string; type?: string } | null
  ) => void;
  setMetadata: (field: string, value: string | boolean | null | number) => void;
  setCurrency: (
    currency: string,
    exchangeRate?: number,
    exchangeOperator?: 'multiply' | 'divide'
  ) => void;
  setCurrencyPreservingPrices: (
    currency: string,
    exchangeRate?: number,
    exchangeOperator?: 'multiply' | 'divide'
  ) => void;
  toggleColumn: (field: 'showDiscount') => void;
  resetCart: () => void;
  loadCartState: (cartState: Partial<SalesState>) => void;
}

type NumericField = 'quantity' | 'costPrice' | 'basePrice' | 'price' | 'discount';
const NUMERIC_FIELDS = new Set<NumericField>([
  'quantity',
  'costPrice',
  'basePrice',
  'price',
  'discount',
]);

export const useSalesStore = create<SalesState>()(
  persist(
    (set, get) => ({
      items: [],
      selectedCustomer: null,
      summary: { subtotal: 0, discountAmount: 0, totalAmount: 0 },
      invoiceType: 'cash',
      currency: 'SAR',
      exchangeRate: 1,
      exchangeOperator: 'multiply',
      warehouseId: '',
      cashboxId: '',
      paidAmount: 0,
      showDiscount: false,
      notes: '',

      initializeItems: count => {
        set({ items: Array.from({ length: count }, createNewItem) });
      },

      updateItem: (index, field, value) => {
        set(state => {
          const newItems = [...state.items];
          if (newItems[index]) {
            const coercedValue = NUMERIC_FIELDS.has(field as NumericField)
              ? Number(value)
              : String(value);
            newItems[index] = {
              ...newItems[index],
              [field]: coercedValue as SalesCartItem[typeof field],
            };
          }
          return { items: newItems };
        });
        get().calculateTotals();
      },

      updateQuantity: (productId, quantity) => {
        set(state => ({
          items: state.items.map(item =>
            item.productId === productId ? { ...item, quantity: Math.max(0, quantity) } : item
          ),
        }));
        get().calculateTotals();
      },

      setProductForRow: (index, product) => {
        const currentState = get();
        if (!assertValidExchangeRate(currentState.currency, currentState.exchangeRate)) return;

        set(state => {
          const basePrice = product.selling_price || 0;
          const { price: convertedPrice, failed } = safeConvertFromBase(
            basePrice,
            state.currency,
            state.exchangeRate,
            state.exchangeOperator,
            'setProductForRow'
          );
          if (failed) return state;

          const newItems = [...state.items];
          if (index >= 0 && index < newItems.length) {
            newItems[index] = buildCartItemFromProduct(product, convertedPrice, newItems[index]);
          } else {
            newItems.push(buildCartItemFromProduct(product, convertedPrice));
          }
          return { items: newItems };
        });
        get().calculateTotals();
      },

      addItem: () => {
        set(state => ({ items: [...state.items, createNewItem()] }));
      },

      addProductToCart: product => {
        const currentState = get();
        if (!assertValidExchangeRate(currentState.currency, currentState.exchangeRate)) return;

        set(state => {
          const existing = state.items.find(i => i.productId === product.id);
          if (existing) {
            return {
              items: state.items.map(i =>
                i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
              ),
            };
          }

          const basePrice = product.selling_price || 0;
          const { price: convertedPrice, failed } = safeConvertFromBase(
            basePrice,
            state.currency,
            state.exchangeRate,
            state.exchangeOperator,
            'addProductToCart'
          );
          if (failed) return state;

          // إدراج المنتج في أول صف فارغ (الصف الأول بدلاً من تكديس صفوف جديدة فوق الصفوف الفارغة)
          const firstEmptyIdx = state.items.findIndex(
            i => !i.productId && i.name.trim().length === 0
          );
          if (firstEmptyIdx !== -1) {
            const nextItems = [...state.items];
            nextItems[firstEmptyIdx] = buildCartItemFromProduct(
              product,
              convertedPrice,
              nextItems[firstEmptyIdx]
            );
            return { items: nextItems };
          }

          return { items: [...state.items, buildCartItemFromProduct(product, convertedPrice)] };
        });
        get().calculateTotals();
      },

      removeItem: idOrIndex => {
        set(state => ({
          items:
            typeof idOrIndex === 'string'
              ? state.items.filter(i => i.id !== idOrIndex)
              : state.items.filter((_, i) => i !== idOrIndex),
        }));
        get().calculateTotals();
      },

      calculateTotals: () => {
        const { discountEnabled } = useDiscountStore.getState();
        set(state => ({
          summary: computeCartSummary(state.items, discountEnabled && state.showDiscount),
        }));
      },

      setCustomer: selectedCustomer => {
        set({ selectedCustomer });
      },

      setMetadata: (field, value) => {
        set(state => {
          const newState = { ...state, [field]: value };

          if (field === 'currency' && value === 'YER' && state.exchangeRate === 1) {
            newState.exchangeRate = 410;
            newState.exchangeOperator = 'divide';
          } else if (field === 'currency' && value === 'SAR') {
            newState.exchangeRate = 1;
            newState.exchangeOperator = 'multiply';
          }

          if (['currency', 'exchangeRate', 'exchangeOperator'].includes(field)) {
            newState.items = repriceItemsFromBase(
              newState.items,
              newState.currency,
              newState.exchangeRate,
              newState.exchangeOperator,
              'setMetadata'
            );
          }

          return newState;
        });
        get().calculateTotals();
      },

      setCurrency: (currency, customRate, customOperator) => {
        set(state => {
          const { rate, operator } = resolveCurrencyRateAndOperator(
            currency,
            state.exchangeRate,
            state.exchangeOperator,
            customRate,
            customOperator,
            false
          );
          return {
            ...state,
            currency,
            exchangeRate: rate,
            exchangeOperator: operator,
            items: repriceItemsFromBase(state.items, currency, rate, operator, 'setCurrency'),
          };
        });
        get().calculateTotals();
      },

      setCurrencyPreservingPrices: (currency, customRate, customOperator) => {
        set(state => {
          const { rate, operator } = resolveCurrencyRateAndOperator(
            currency,
            state.exchangeRate,
            state.exchangeOperator,
            customRate,
            customOperator,
            true
          );
          return {
            ...state,
            currency,
            exchangeRate: rate,
            exchangeOperator: operator,
            items: repriceItemsToBase(state.items, rate, operator),
          };
        });
        get().calculateTotals();
      },

      toggleColumn: field => {
        set(state => ({ [field]: !state[field] }));
        get().calculateTotals();
      },

      resetCart: () => {
        set(() => ({
          items: [],
          selectedCustomer: null,
          summary: { subtotal: 0, discountAmount: 0, totalAmount: 0 },
          invoiceType: 'cash',
          currency: 'SAR',
          exchangeRate: 1,
          exchangeOperator: 'multiply',
          warehouseId: '',
          cashboxId: '',
          paidAmount: 0,
          showDiscount: false,
          notes: '',
        }));
      },

      loadCartState: cartState => {
        set(state => Object.assign({}, state, cartState));
        get().calculateTotals();
      },
    }),
    {
      name: STORAGE_KEYS.SALES_DRAFT,
      partialize: state => ({
        items: state.items,
        selectedCustomer: state.selectedCustomer,
        summary: state.summary,
        invoiceType: state.invoiceType,
        currency: state.currency,
        exchangeRate: state.exchangeRate,
        exchangeOperator: state.exchangeOperator,
        warehouseId: state.warehouseId,
        cashboxId: state.cashboxId,
        paidAmount: state.paidAmount,
        showDiscount: state.showDiscount,
        notes: state.notes,
      }),
    }
  )
);

useDiscountStore.subscribe((state, prevState) => {
  if (state.discountEnabled !== prevState.discountEnabled) {
    useSalesStore.getState().calculateTotals();
  }
});
