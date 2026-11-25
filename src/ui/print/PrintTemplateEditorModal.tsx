/* eslint-disable max-lines-per-function */
import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Save, Upload, Building2 } from 'lucide-react';
import {
  usePrintTemplateStore,
  DEFAULT_PRINT_TEMPLATE_CONFIG,
  type PrintTemplateConfig,
} from './printTemplateStore';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';

interface PrintTemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TemplateScope = 'global' | 'branch';

interface BranchOverrideShape {
  branchName?: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
}

interface PrintFormDraft {
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

const hasNonEmptyText = (value: string | null | undefined): value is string =>
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

const usePrintTemplateDraftController = (
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

const PrintTemplateScopeBar: React.FC<{
  branchName: string | null | undefined;
  scope: TemplateScope;
  onChangeScope: (scope: TemplateScope) => void;
}> = ({ branchName, scope, onChangeScope }) => (
  <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs">
    <Building2 size={15} className="text-slate-700" />
    <span className="font-bold">نطاق حفظ العنوان والهاتف:</span>
    <button
      type="button"
      onClick={() => {
        onChangeScope('branch');
      }}
      className={`rounded-lg px-2.5 py-1 font-bold ${
        scope === 'branch'
          ? 'bg-slate-900 text-white'
          : 'border border-slate-200 bg-white text-slate-700'
      }`}
    >
      الفرع النشط ({branchName ?? 'الفرع'})
    </button>
    <button
      type="button"
      onClick={() => {
        onChangeScope('global');
      }}
      className={`rounded-lg px-2.5 py-1 font-bold ${
        scope === 'global'
          ? 'bg-slate-900 text-white'
          : 'border border-slate-200 bg-white text-slate-700'
      }`}
    >
      جميع الفروع (افتراضي)
    </button>
  </div>
);

const PrintIdentityFieldsSection: React.FC<{
  draft: PrintFormDraft;
  showBranchLabel: boolean;
  onFieldChange: <K extends keyof PrintFormDraft>(field: K, value: PrintFormDraft[K]) => void;
  onLogoFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ draft, showBranchLabel, onFieldChange, onLogoFile }) => (
  <>
    <div>
      <label htmlFor="pte-company-title" className="mb-1 block text-xs font-bold">
        اسم الشركة الرئيسي
      </label>
      <input
        id="pte-company-title"
        type="text"
        value={draft.companyTitle}
        onChange={e => {
          onFieldChange('companyTitle', e.target.value);
        }}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
      />
    </div>

    {showBranchLabel && (
      <div>
        <label htmlFor="pte-branch-label" className="mb-1 block text-xs font-bold">
          اسم الفرع الظاهر في الترويسة
        </label>
        <input
          id="pte-branch-label"
          type="text"
          value={draft.branchLabel}
          onChange={e => {
            onFieldChange('branchLabel', e.target.value);
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
        />
      </div>
    )}

    <div className="sm:col-span-2">
      <label htmlFor="pte-line-1" className="mb-1 block text-xs font-bold text-red-700">
        العبارات التعريفية (باللون الأحمر)
      </label>
      <div className="grid grid-cols-1 gap-1.5">
        <input
          id="pte-line-1"
          type="text"
          value={draft.line1}
          onChange={e => {
            onFieldChange('line1', e.target.value);
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
        />
        <input
          id="pte-line-2"
          aria-label="العبارة التعريفية الثانية"
          type="text"
          value={draft.line2}
          onChange={e => {
            onFieldChange('line2', e.target.value);
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
        />
        <input
          id="pte-line-3"
          aria-label="العبارة التعريفية الثالثة"
          type="text"
          value={draft.line3}
          onChange={e => {
            onFieldChange('line3', e.target.value);
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
        />
      </div>
    </div>

    <div className="sm:col-span-2">
      <label htmlFor="pte-address" className="mb-1 block text-xs font-bold">
        العنوان
      </label>
      <input
        id="pte-address"
        type="text"
        value={draft.address}
        onChange={e => {
          onFieldChange('address', e.target.value);
        }}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
      />
    </div>

    <div className="sm:col-span-2">
      <label htmlFor="pte-phone" className="mb-1 block text-xs font-bold">
        أرقام الهواتف والجوال
      </label>
      <input
        id="pte-phone"
        type="text"
        value={draft.phone}
        onChange={e => {
          onFieldChange('phone', e.target.value);
        }}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
      />
    </div>

    <div className="sm:col-span-2">
      <label htmlFor="pte-logo-url" className="mb-1 block text-xs font-bold">
        شعار الشركة (Logo)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="pte-logo-url"
          type="text"
          value={draft.logoUrl}
          onChange={e => {
            onFieldChange('logoUrl', e.target.value);
          }}
          placeholder="/assets/alnadary-print-logo.svg"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
          dir="ltr"
        />
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold hover:bg-slate-100">
          <Upload size={13} />
          <span>رفع شعار</span>
          <input type="file" accept="image/*" className="hidden" onChange={onLogoFile} />
        </label>
      </div>
    </div>
  </>
);

const PrintFooterFieldsSection: React.FC<{
  draft: PrintFormDraft;
  onFieldChange: <K extends keyof PrintFormDraft>(field: K, value: PrintFormDraft[K]) => void;
}> = ({ draft, onFieldChange }) => (
  <>
    <div className="sm:col-span-2">
      <label htmlFor="pte-term-1" className="mb-1 block text-xs font-bold">
        الشروط أسفل الفاتورة
      </label>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <input
          id="pte-term-1"
          type="text"
          value={draft.term1}
          onChange={e => {
            onFieldChange('term1', e.target.value);
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
        />
        <input
          id="pte-term-2"
          aria-label="الشرط الثاني أسفل الفاتورة"
          type="text"
          value={draft.term2}
          onChange={e => {
            onFieldChange('term2', e.target.value);
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
        />
      </div>
    </div>

    <div className="sm:col-span-2">
      <label htmlFor="pte-sig-1" className="mb-1 block text-xs font-bold">
        تسميات التوقيعات
      </label>
      <div className="grid grid-cols-3 gap-1.5">
        <input
          id="pte-sig-1"
          type="text"
          value={draft.sig1}
          onChange={e => {
            onFieldChange('sig1', e.target.value);
          }}
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
        />
        <input
          id="pte-sig-2"
          aria-label="تسمية التوقيع الثاني"
          type="text"
          value={draft.sig2}
          onChange={e => {
            onFieldChange('sig2', e.target.value);
          }}
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
        />
        <input
          id="pte-sig-3"
          aria-label="تسمية التوقيع الثالث"
          type="text"
          value={draft.sig3}
          onChange={e => {
            onFieldChange('sig3', e.target.value);
          }}
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
        />
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-bold sm:col-span-2">
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={draft.showLogo}
          onChange={e => {
            onFieldChange('showLogo', e.target.checked);
          }}
        />
        إظهار الشعار
      </label>
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={draft.showTerms}
          onChange={e => {
            onFieldChange('showTerms', e.target.checked);
          }}
        />
        إظهار الشروط
      </label>
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={draft.showSignatures}
          onChange={e => {
            onFieldChange('showSignatures', e.target.checked);
          }}
        />
        إظهار التوقيعات
      </label>
    </div>
  </>
);

/**
 * نافذة تعديل وتخصيص القالب الرسمي الموحد للطباعة (عام أو خاص بالفرع النشط).
 */
export const PrintTemplateEditorModal: React.FC<PrintTemplateEditorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const ctrl = usePrintTemplateDraftController(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-xs sm:items-center sm:p-3"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-slate-300 bg-white p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] text-right text-slate-900 shadow-2xl sm:rounded-2xl sm:p-5"
        onClick={e => {
          e.stopPropagation();
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-200 pb-2.5 sm:mb-4 sm:pb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-900 sm:text-base">
              تعديل وتخصيص قالب الطباعة الموحد
            </h3>
            <p className="text-[11px] text-slate-500 sm:text-xs">
              يُطبّق التعديل فوراً على جميع الفواتير وكشوف الحساب والسندات ورسائل الواتساب والإكسل
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={18} />
          </button>
        </div>

        {hasNonEmptyText(ctrl.branchId) && (
          <PrintTemplateScopeBar
            branchName={ctrl.branchName}
            scope={ctrl.scope}
            onChangeScope={ctrl.setScope}
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PrintIdentityFieldsSection
            draft={ctrl.draft}
            showBranchLabel={hasNonEmptyText(ctrl.branchId) && ctrl.scope === 'branch'}
            onFieldChange={ctrl.setField}
            onLogoFile={ctrl.handleLogoFile}
          />
          <PrintFooterFieldsSection draft={ctrl.draft} onFieldChange={ctrl.setField} />
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={ctrl.handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw size={13} />
            <span>استعادة الافتراضي</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={ctrl.handleSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
            >
              <Save size={13} />
              <span>حفظ وتطبيق</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintTemplateEditorModal;
