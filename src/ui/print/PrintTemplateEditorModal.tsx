import React, { useState } from 'react';
import { X, RotateCcw, Save, Upload, Building2 } from 'lucide-react';
import { usePrintTemplateStore, DEFAULT_PRINT_TEMPLATE_CONFIG } from './printTemplateStore';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';

interface PrintTemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * نافذة تعديل وتخصيص القالب الرسمي الموحد للطباعة (عام أو خاص بالفرع النشط).
 */
export const PrintTemplateEditorModal: React.FC<PrintTemplateEditorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { config, updateConfig, updateBranchOverride, resetDefaults } = usePrintTemplateStore();
  const { branchId, branchName } = useBranchFilter();

  const currentBranchOverride = branchId ? config.branchOverrides[branchId] : undefined;

  const [scope, setScope] = useState<'global' | 'branch'>(branchId ? 'branch' : 'global');
  const [companyTitle, setCompanyTitle] = useState(config.companyTitle);
  const [branchLabel, setBranchLabel] = useState(
    currentBranchOverride?.branchName ?? branchName ?? ''
  );
  const [line1, setLine1] = useState(config.taglineLines[0]);
  const [line2, setLine2] = useState(config.taglineLines[1]);
  const [line3, setLine3] = useState(config.taglineLines[2]);
  const [address, setAddress] = useState(
    (scope === 'branch' && currentBranchOverride?.address) || config.defaultAddress
  );
  const [phone, setPhone] = useState(
    (scope === 'branch' && currentBranchOverride?.phone) || config.defaultPhone
  );
  const [logoUrl, setLogoUrl] = useState(
    (scope === 'branch' && currentBranchOverride?.logoUrl) || config.logoUrl
  );
  const [term1, setTerm1] = useState(config.terms[0]);
  const [term2, setTerm2] = useState(config.terms[1]);
  const [sig1, setSig1] = useState(config.signatures[0]);
  const [sig2, setSig2] = useState(config.signatures[1]);
  const [sig3, setSig3] = useState(config.signatures[2]);
  const [showLogo, setShowLogo] = useState(config.showLogo);
  const [showTerms, setShowTerms] = useState(config.showTerms);
  const [showSignatures, setShowSignatures] = useState(config.showSignatures);

  if (!isOpen) return null;

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    updateConfig({
      companyTitle: companyTitle.trim() || DEFAULT_PRINT_TEMPLATE_CONFIG.companyTitle,
      taglineLines: [line1.trim(), line2.trim(), line3.trim()],
      terms: [term1.trim(), term2.trim()],
      signatures: [sig1.trim(), sig2.trim(), sig3.trim()],
      showLogo,
      showTerms,
      showSignatures,
      ...(scope === 'global'
        ? {
            defaultAddress: address.trim() || DEFAULT_PRINT_TEMPLATE_CONFIG.defaultAddress,
            defaultPhone: phone.trim() || DEFAULT_PRINT_TEMPLATE_CONFIG.defaultPhone,
            logoUrl: logoUrl.trim() || DEFAULT_PRINT_TEMPLATE_CONFIG.logoUrl,
          }
        : {}),
    });

    if (scope === 'branch' && branchId) {
      updateBranchOverride(branchId, {
        branchName: branchLabel.trim(),
        address: address.trim(),
        phone: phone.trim(),
        logoUrl: logoUrl.trim(),
      });
    }

    onClose();
  };

  const handleReset = () => {
    resetDefaults();
    setCompanyTitle(DEFAULT_PRINT_TEMPLATE_CONFIG.companyTitle);
    setLine1(DEFAULT_PRINT_TEMPLATE_CONFIG.taglineLines[0]);
    setLine2(DEFAULT_PRINT_TEMPLATE_CONFIG.taglineLines[1]);
    setLine3(DEFAULT_PRINT_TEMPLATE_CONFIG.taglineLines[2]);
    setAddress(DEFAULT_PRINT_TEMPLATE_CONFIG.defaultAddress);
    setPhone(DEFAULT_PRINT_TEMPLATE_CONFIG.defaultPhone);
    setLogoUrl(DEFAULT_PRINT_TEMPLATE_CONFIG.logoUrl);
    setTerm1(DEFAULT_PRINT_TEMPLATE_CONFIG.terms[0]);
    setTerm2(DEFAULT_PRINT_TEMPLATE_CONFIG.terms[1]);
    setSig1(DEFAULT_PRINT_TEMPLATE_CONFIG.signatures[0]);
    setSig2(DEFAULT_PRINT_TEMPLATE_CONFIG.signatures[1]);
    setSig3(DEFAULT_PRINT_TEMPLATE_CONFIG.signatures[2]);
    setShowLogo(true);
    setShowTerms(true);
    setShowSignatures(true);
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-xs"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-300 bg-white p-5 text-right text-slate-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-900">تعديل وتخصيص قالب الطباعة الموحد</h3>
            <p className="text-xs text-slate-500">
              يُطبّق التعديل فوراً على جميع الفواتير وكشوف الحساب والسندات ورسائل الواتساب والإكسل
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={18} />
          </button>
        </div>

        {branchId && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs">
            <Building2 size={15} className="text-slate-700" />
            <span className="font-bold">نطاق حفظ العنوان والهاتف:</span>
            <button
              type="button"
              onClick={() => setScope('branch')}
              className={`rounded-lg px-2.5 py-1 font-bold ${
                scope === 'branch'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200'
              }`}
            >
              الفرع النشط ({branchName || 'الفرع'})
            </button>
            <button
              type="button"
              onClick={() => setScope('global')}
              className={`rounded-lg px-2.5 py-1 font-bold ${
                scope === 'global'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200'
              }`}
            >
              جميع الفروع (افتراضي)
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold">اسم الشركة الرئيسي</label>
            <input
              type="text"
              value={companyTitle}
              onChange={e => setCompanyTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
            />
          </div>

          {branchId && scope === 'branch' && (
            <div>
              <label className="mb-1 block text-xs font-bold">اسم الفرع الظاهر في الترويسة</label>
              <input
                type="text"
                value={branchLabel}
                onChange={e => setBranchLabel(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
              />
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-bold text-red-700">
              العبارات التعريفية (باللون الأحمر)
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              <input
                type="text"
                value={line1}
                onChange={e => setLine1(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
              />
              <input
                type="text"
                value={line2}
                onChange={e => setLine2(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
              />
              <input
                type="text"
                value={line3}
                onChange={e => setLine3(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-bold">العنوان</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-bold">أرقام الهواتف والجوال</label>
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-bold">شعار الشركة (Logo)</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                placeholder="/assets/alnadary-print-logo.svg"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                dir="ltr"
              />
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold hover:bg-slate-100">
                <Upload size={13} />
                <span>رفع شعار</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
              </label>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-bold">الشروط أسفل الفاتورة</label>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <input
                type="text"
                value={term1}
                onChange={e => setTerm1(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
              <input
                type="text"
                value={term2}
                onChange={e => setTerm2(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-bold">تسميات التوقيعات</label>
            <div className="grid grid-cols-3 gap-1.5">
              <input
                type="text"
                value={sig1}
                onChange={e => setSig1(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={sig2}
                onChange={e => setSig2(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={sig3}
                onChange={e => setSig3(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-bold sm:col-span-2">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showLogo}
                onChange={e => setShowLogo(e.target.checked)}
              />
              إظهار الشعار
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showTerms}
                onChange={e => setShowTerms(e.target.checked)}
              />
              إظهار الشروط
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showSignatures}
                onChange={e => setShowSignatures(e.target.checked)}
              />
              إظهار التوقيعات
            </label>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={handleReset}
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
              onClick={handleSave}
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
