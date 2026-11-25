import React from 'react';
import { Building2, Upload } from 'lucide-react';
import type { PrintFormDraft, TemplateScope } from './usePrintTemplateDraftController';

export const PrintTemplateScopeBar: React.FC<{
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

export const PrintIdentityFieldsSection: React.FC<{
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

export const PrintFooterFieldsSection: React.FC<{
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
