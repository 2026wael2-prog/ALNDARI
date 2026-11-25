import type React from 'react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_PRINT_TEMPLATE_CONFIG,
  usePrintTemplateStore,
  type PrintTemplateConfig,
} from '../printTemplateStore';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';

export type TemplateScope = 'global' | 'branch';

export interface BranchOverrideShape {
  branchName?: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
}

export interface PrintFormDraft {
  companyTitle: string;
  branchLabel: string;
  line1: string;
  line2: string;
  line3: string;
  address: string;
  phone: string;
  logoUrl: string;
  term1: string;
  term2: string;
  sig1: string;
  sig2: string;
  sig3: string;
  showLogo: boolean;
  showTerms: boolean;
  showSignatures: boolean;
}

export const hasNonEmptyText = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value.length > 0;

const findBranchOverride = (
  overrides: PrintTemplateConfig['branchOverrides'],
  branchId: string | null | undefined
): BranchOverrideShape | undefined => {
  if (!hasNonEmptyText(branchId)) return undefined;
  return Object.entries(overrides).find(([key]) => key === branchId)?.[1];
};

const pickScopedText = (
  scope: TemplateScope,
  overrideVal: string | undefined,
  fallbackVal: string
): string => (scope === 'branch' && hasNonEmptyText(overrideVal) ? overrideVal : fallbackVal);

const createDraftFromConfig = (
  config: PrintTemplateConfig,
  scope: TemplateScope,
  override: BranchOverrideShape | undefined,
  branchName: string | null | undefined
): PrintFormDraft => ({
  companyTitle: config.companyTitle,
  branchLabel: override?.branchName ?? branchName ?? '',
  line1: config.taglineLines[0],
  line2: config.taglineLines[1],
  line3: config.taglineLines[2],
  address: pickScopedText(scope, override?.address, config.defaultAddress),
  phone: pickScopedText(scope, override?.phone, config.defaultPhone),
  logoUrl: pickScopedText(scope, override?.logoUrl, config.logoUrl),
  term1: config.terms[0],
  term2: config.terms[1],
  sig1: config.signatures[0],
  sig2: config.signatures[1],
  sig3: config.signatures[2],
  showLogo: config.showLogo,
  showTerms: config.showTerms,
  showSignatures: config.showSignatures,
});

const createDefaultDraft = (branchLabel: string): PrintFormDraft => ({
  companyTitle: DEFAULT_PRINT_TEMPLATE_CONFIG.companyTitle,
  branchLabel,
  line1: DEFAULT_PRINT_TEMPLATE_CONFIG.taglineLines[0],
  line2: DEFAULT_PRINT_TEMPLATE_CONFIG.taglineLines[1],
  line3: DEFAULT_PRINT_TEMPLATE_CONFIG.taglineLines[2],
  address: DEFAULT_PRINT_TEMPLATE_CONFIG.defaultAddress,
  phone: DEFAULT_PRINT_TEMPLATE_CONFIG.defaultPhone,
  logoUrl: DEFAULT_PRINT_TEMPLATE_CONFIG.logoUrl,
  term1: DEFAULT_PRINT_TEMPLATE_CONFIG.terms[0],
  term2: DEFAULT_PRINT_TEMPLATE_CONFIG.terms[1],
  sig1: DEFAULT_PRINT_TEMPLATE_CONFIG.signatures[0],
  sig2: DEFAULT_PRINT_TEMPLATE_CONFIG.signatures[1],
  sig3: DEFAULT_PRINT_TEMPLATE_CONFIG.signatures[2],
  showLogo: true,
  showTerms: true,
  showSignatures: true,
});

const persistPrintDraft = (params: {
  draft: PrintFormDraft;
  scope: TemplateScope;
  branchId: string | null | undefined;
  updateConfig: (patch: Partial<PrintTemplateConfig>) => void;
  updateBranchOverride: (id: string, patch: BranchOverrideShape) => void;
}): void => {
  const { draft, scope, branchId, updateConfig, updateBranchOverride } = params;
  const trimmedAddr = draft.address.trim();
  const trimmedPhone = draft.phone.trim();
  const trimmedLogo = draft.logoUrl.trim();
  const trimmedTitle = draft.companyTitle.trim();

  updateConfig({
    companyTitle:
      trimmedTitle.length > 0 ? trimmedTitle : DEFAULT_PRINT_TEMPLATE_CONFIG.companyTitle,
    taglineLines: [draft.line1.trim(), draft.line2.trim(), draft.line3.trim()],
    terms: [draft.term1.trim(), draft.term2.trim()],
    signatures: [draft.sig1.trim(), draft.sig2.trim(), draft.sig3.trim()],
    showLogo: draft.showLogo,
    showTerms: draft.showTerms,
    showSignatures: draft.showSignatures,
    ...(scope === 'global'
      ? {
          defaultAddress:
            trimmedAddr.length > 0 ? trimmedAddr : DEFAULT_PRINT_TEMPLATE_CONFIG.defaultAddress,
          defaultPhone:
            trimmedPhone.length > 0 ? trimmedPhone : DEFAULT_PRINT_TEMPLATE_CONFIG.defaultPhone,
          logoUrl: trimmedLogo.length > 0 ? trimmedLogo : DEFAULT_PRINT_TEMPLATE_CONFIG.logoUrl,
        }
      : {}),
  });

  if (scope === 'branch' && hasNonEmptyText(branchId)) {
    updateBranchOverride(branchId, {
      branchName: draft.branchLabel.trim(),
      address: trimmedAddr,
      phone: trimmedPhone,
      logoUrl: trimmedLogo,
    });
  }
};

export const usePrintTemplateDraftController = (
  isOpen: boolean,
  onClose: () => void
): {
  branchId: string | null | undefined;
  branchName: string | null | undefined;
  scope: TemplateScope;
  setScope: React.Dispatch<React.SetStateAction<TemplateScope>>;
  draft: PrintFormDraft;
  setField: <K extends keyof PrintFormDraft>(field: K, value: PrintFormDraft[K]) => void;
  handleLogoFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSave: () => void;
  handleReset: () => void;
} => {
  const { config, updateConfig, updateBranchOverride, resetDefaults } = usePrintTemplateStore();
  const { branchId, branchName } = useBranchFilter();
  const initialOverride = findBranchOverride(config.branchOverrides, branchId);
  const initialScope: TemplateScope = hasNonEmptyText(branchId) ? 'branch' : 'global';

  const [scope, setScope] = useState<TemplateScope>(initialScope);
  const [draft, setDraft] = useState<PrintFormDraft>(() =>
    createDraftFromConfig(config, initialScope, initialOverride, branchName)
  );

  useEffect(() => {
    if (!isOpen) return;
    setScope(hasNonEmptyText(branchId) ? 'branch' : 'global');
  }, [isOpen, branchId]);

  useEffect(() => {
    if (!isOpen) return;
    const override = findBranchOverride(config.branchOverrides, branchId);
    setDraft(createDraftFromConfig(config, scope, override, branchName));
  }, [isOpen, scope, branchId, branchName, config]);

  const setField = <K extends keyof PrintFormDraft>(field: K, value: PrintFormDraft[K]): void => {
    setDraft(prev => ({ ...prev, [field]: value }));
  };

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setField('logoUrl', reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (): void => {
    persistPrintDraft({ draft, scope, branchId, updateConfig, updateBranchOverride });
    onClose();
  };

  const handleReset = (): void => {
    resetDefaults();
    setDraft(prev => createDefaultDraft(prev.branchLabel));
  };

  return {
    branchId,
    branchName,
    scope,
    setScope,
    draft,
    setField,
    handleLogoFile,
    handleSave,
    handleReset,
  };
};
