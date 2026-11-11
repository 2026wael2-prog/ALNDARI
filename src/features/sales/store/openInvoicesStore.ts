/* eslint-disable max-lines-per-function, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SalesCartItem, SalesSummary } from '../store';

export interface OpenInvoiceDraft {
  id: string;
  tabTitle: string;
  customTitle?: string | undefined;
  vehicleDescription?: string | undefined;
  createdAt: string;
  updatedAt: string;
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
}

interface OpenInvoicesState {
  drafts: OpenInvoiceDraft[];
  activeDraftId: string;

  // Actions
  createDraft: (customTitle?: string) => string;
  switchDraft: (draftId: string, currentSnapshot?: Partial<OpenInvoiceDraft>) => OpenInvoiceDraft | null;
  closeDraft: (draftId: string) => OpenInvoiceDraft | null;
  renameDraft: (draftId: string, newTitle: string) => void;
  setVehicleDescription: (draftId: string, desc: string) => void;
  syncCurrentDraft: (snapshot: Partial<OpenInvoiceDraft>) => void;
  resetAllDrafts: () => void;
}

const createDefaultDraft = (number = 1, customTitle?: string): OpenInvoiceDraft => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const trimmedTitle = customTitle?.trim();
  const title = (trimmedTitle !== undefined && trimmedTitle.length > 0)
    ? trimmedTitle
    : `فاتورة مفتوحة (${String(number)})`;

  return {
    id,
    tabTitle: title,
    customTitle: (trimmedTitle !== undefined && trimmedTitle.length > 0) ? trimmedTitle : undefined,
    vehicleDescription: '',
    createdAt: now,
    updatedAt: now,
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
  };
};

const STORAGE_KEY = 'alzhra_multi_open_invoices_v1';

export const useOpenInvoicesStore = create<OpenInvoicesState>()(
  persist(
    (set, get) => ({
      drafts: [createDefaultDraft(1)],
      activeDraftId: '',

      createDraft: (customTitle?: string): string => {
        const state = get();
        const nextNum = state.drafts.length + 1;
        const newDraft = createDefaultDraft(nextNum, customTitle);

        set({
          drafts: [...state.drafts, newDraft],
          activeDraftId: newDraft.id,
        });

        return newDraft.id;
      },

      switchDraft: (targetId: string, currentSnapshot?: Partial<OpenInvoiceDraft>): OpenInvoiceDraft | null => {
        const state = get();
        if (state.activeDraftId === targetId) {
          return state.drafts.find(d => d.id === targetId) ?? null;
        }

        // 1. احفظ snapshot الحالي في المسودة النشطة السابقة إن وُجدت
        let updatedDrafts = state.drafts;
        if (currentSnapshot && state.activeDraftId) {
          updatedDrafts = updatedDrafts.map(draft => {
            if (draft.id === state.activeDraftId) {
              return {
                ...draft,
                ...currentSnapshot,
                updatedAt: new Date().toISOString(),
              };
            }
            return draft;
          });
        }

        const targetDraft = updatedDrafts.find(d => d.id === targetId) ?? null;
        set({
          drafts: updatedDrafts,
          activeDraftId: targetId,
        });

        return targetDraft;
      },

      closeDraft: (draftId: string): OpenInvoiceDraft | null => {
        const state = get();
        const remainingDrafts = state.drafts.filter(d => d.id !== draftId);

        // إذا أغلقت كل المسودات، ننشئ مسودة جديدة تلقائياً لكي لا تبقى الشاشة فارغة
        if (remainingDrafts.length === 0) {
          const freshDraft = createDefaultDraft(1);
          set({
            drafts: [freshDraft],
            activeDraftId: freshDraft.id,
          });
          return freshDraft;
        }

        // إذا أغلق التبويب النشط، ننتقل لأول تبويب متبقٍ
        let nextActiveId = state.activeDraftId;
        if (state.activeDraftId === draftId) {
          nextActiveId = remainingDrafts[0]?.id ?? '';
        }

        set({
          drafts: remainingDrafts,
          activeDraftId: nextActiveId,
        });

        return remainingDrafts.find(d => d.id === nextActiveId) ?? null;
      },

      renameDraft: (draftId: string, newTitle: string): void => {
        const trimmed = newTitle.trim();
        if (!trimmed) return;
        set(state => ({
          drafts: state.drafts.map(d =>
            d.id === draftId
              ? { ...d, tabTitle: trimmed, customTitle: trimmed, updatedAt: new Date().toISOString() }
              : d
          ),
        }));
      },

      setVehicleDescription: (draftId: string, desc: string): void => {
        set(state => ({
          drafts: state.drafts.map(d =>
            d.id === draftId
              ? { ...d, vehicleDescription: desc.trim(), updatedAt: new Date().toISOString() }
              : d
          ),
        }));
      },

      syncCurrentDraft: (snapshot: Partial<OpenInvoiceDraft>): void => {
        const { activeDraftId, drafts } = get();
        if (!activeDraftId) return;

        set({
          drafts: drafts.map(d =>
            d.id === activeDraftId
              ? {
                  ...d,
                  ...snapshot,
                  updatedAt: new Date().toISOString(),
                }
              : d
          ),
        });
      },

      resetAllDrafts: (): void => {
        const defaultDraft = createDefaultDraft(1);
        set({
          drafts: [defaultDraft],
          activeDraftId: defaultDraft.id,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      onRehydrateStorage: () => state => {
        // تأكد من وجود مسودة نشطة دائماً بعد استعادة البيانات
        if (!state) return;
        if (!state.activeDraftId || !state.drafts.some(d => d.id === state.activeDraftId)) {
          const first = state.drafts[0];
          if (first) {
            state.activeDraftId = first.id;
          } else {
            const fresh = createDefaultDraft(1);
            state.drafts = [fresh];
            state.activeDraftId = fresh.id;
          }
        }
      },
    }
  )
);
