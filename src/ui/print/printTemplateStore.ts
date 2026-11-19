import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BranchPrintOverride {
  branchName?: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
}

export interface PrintTemplateConfig {
  companyTitle: string;
  taglineLines: [string, string, string];
  defaultAddress: string;
  defaultPhone: string;
  logoUrl: string;
  showLogo: boolean;
  showTerms: boolean;
  showSignatures: boolean;
  terms: [string, string];
  signatures: [string, string, string];
  /** تخصيصات مستقلة لكل فرع (الاسم، العنوان، أرقام الهواتف، الشعار) */
  branchOverrides: Record<string, BranchPrintOverride>;
}

export const DEFAULT_PRINT_TEMPLATE_CONFIG: PrintTemplateConfig = {
  companyTitle: 'النظــــاري',
  taglineLines: [
    'لبيع قطع غيار السيارات بجميع أنواعها',
    'وبيع جميع أنواع الفريمات والمكملات',
    'والزيوت والإطارات والبطاريات',
  ],
  defaultAddress: 'الجمهورية اليمنية - المهرة - الغيظة - خلف مطعم قطر',
  defaultPhone: 'هاتف : 05610263 - جوال : 712165706 - 770319249',
  logoUrl: '/assets/alnadary-print-logo.svg',
  showLogo: true,
  showTerms: true,
  showSignatures: true,
  terms: [
    '* البضاعة لا ترد ولا تستبدل بعد خروجها من المحل',
    '* أتعهد بدفع المبلغ عند الطلب',
  ],
  signatures: ['توقيع المستلم', 'توقيع المحاسب', 'الختم والاعتماد'],
  branchOverrides: {},
};

interface PrintTemplateState {
  config: PrintTemplateConfig;
  updateConfig: (patch: Partial<PrintTemplateConfig>) => void;
  updateBranchOverride: (branchId: string, override: BranchPrintOverride) => void;
  resetDefaults: () => void;
}

export const usePrintTemplateStore = create<PrintTemplateState>()(
  persist(
    set => ({
      config: DEFAULT_PRINT_TEMPLATE_CONFIG,
      updateConfig: patch =>
        set(state => ({
          config: { ...state.config, ...patch },
        })),
      updateBranchOverride: (branchId, override) =>
        set(state => ({
          config: {
            ...state.config,
            branchOverrides: {
              ...state.config.branchOverrides,
              [branchId]: {
                ...(state.config.branchOverrides[branchId] ?? {}),
                ...override,
              },
            },
          },
        })),
      resetDefaults: () => set({ config: DEFAULT_PRINT_TEMPLATE_CONFIG }),
    }),
    {
      name: 'alnadary-print-template-v1',
    }
  )
);
