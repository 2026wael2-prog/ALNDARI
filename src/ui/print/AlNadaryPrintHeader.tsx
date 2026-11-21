import React, { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  ALNADARY_DEFAULT_ADDRESS,
  ALNADARY_DEFAULT_LOGO,
  ALNADARY_DEFAULT_PHONE,
  ALNADARY_DEFAULT_TAGLINE,
  resolveAlNadaryIdentity,
} from '@/core/utils/alNadaryIdentity';
import { useBranchFilter } from '@/features/branches/hooks/useBranchFilter';
import { usePrintSettings } from '@/features/settings/settingsStore';
import { usePrintTemplateStore } from './printTemplateStore';
import { PrintTemplateEditorModal } from './PrintTemplateEditorModal';

export interface AlNadaryHeaderCompany {
  nameAr?: string | null | undefined;
  branchName?: string | null | undefined;
  logoUrl?: string | null | undefined;
  address?: string | null | undefined;
  phone?: string | null | undefined;
  taglineLines?: readonly string[] | undefined;
}

export interface AlNadaryMetaField {
  label: string;
  value: string;
  dir?: 'rtl' | 'ltr';
}

export interface AlNadaryPrintHeaderProps {
  /** عنوان المستند في المنتصف (مثل: فاتورة بيع المحل، كشف حساب عميل، سند قبض) */
  documentTitle: string;
  /** التاريخ المعروض أسفل العنوان في الجهة اليسرى */
  documentDate?: string | undefined;
  /** رقم المستند (رقم الفاتورة / السند / الحساب) */
  documentNumber?: string | undefined;
  /** تسمية رقم المستند (افتراضي: رقم الفاتورة) */
  documentNumberLabel?: string | undefined;
  /** حقول الجهة اليمنى أسفل الخط الفاصل (مثل: المطلوب من السيد / اسم العميل / الهاتف) */
  rightMeta?: readonly AlNadaryMetaField[] | undefined;
  /** حقول الجهة اليسرى أسفل الخط الفاصل (مثل: طريقة الدفع / الفترة / العملة) */
  leftMeta?: readonly AlNadaryMetaField[] | undefined;
  /** بيانات الشركة/الفرع الاختيارية (تُدمج تلقائياً مع الفرع النشط والقيم الرسمية لشركة النظاري) */
  company?: AlNadaryHeaderCompany | null | undefined;
  /** إخفاء الترويسة العلوية فقط (للورق المطبوع مسبقاً) مع إبقاء عنوان المستند وبيانات العميل ورقم الفاتورة */
  hideLetterhead?: boolean | undefined;
}

export {
  ALNADARY_DEFAULT_ADDRESS,
  ALNADARY_DEFAULT_LOGO,
  ALNADARY_DEFAULT_PHONE,
  ALNADARY_DEFAULT_TAGLINE,
};

/**
 * الهيدر الموحد الرسمي لشركة النظاري لقطع غيار السيارات.
 * يتكيّف تلقائياً مع اسم الفرع وأرقامه وعنوانه مع الحفاظ التام على نفس القالب والشعار.
 */
export const AlNadaryPrintHeader: React.FC<AlNadaryPrintHeaderProps> = ({
  documentTitle,
  documentDate,
  documentNumber,
  documentNumberLabel = 'رقم الفاتورة',
  rightMeta = [],
  leftMeta = [],
  company,
  hideLetterhead = false,
}) => {
  const { branchName: activeBranchName } = useBranchFilter();
  const printSettings = usePrintSettings();
  // اشتراك تفاعلي لتحديث الترويسة فور تعديل القالب
  usePrintTemplateStore(s => s.config);
  const [editorOpen, setEditorOpen] = useState(false);

  const identity = resolveAlNadaryIdentity({
    ...company,
    branchName: company?.branchName ?? activeBranchName,
  });
  const shouldShowLogo = identity.showLogo && printSettings.print_logo !== false;

  const formattedDate = documentDate ? documentDate.replace(/-/g, '/') : '';

  return (
    <div role="banner" className="alnadary-header-wrapper relative">
      {/* زر تعديل القالب — يظهر على الشاشة فقط ويُخفى تماماً عند الطباعة */}
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        className="no-print absolute left-0 top-0 z-10 inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white/95 px-2 py-1 text-[11px] font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-100 hover:text-slate-950"
        title="تعديل وتخصيص الترويسة والقالب"
      >
        <SlidersHorizontal size={12} />
        <span>تعديل القالب</span>
      </button>

      {/* الصف العلوي ثلاثي الأعمدة: يمين (الاسم + الأحمر) | منتصف (الشعار) | يسار (العنوان + الهاتف + التاريخ) */}
      {!hideLetterhead && (
        <>
          <div className="alnadary-header-grid">
            <div className="alnadary-header-right">
              <h1 className="alnadary-company-title">{identity.companyTitle}</h1>
              {identity.branchName && (
                <div style={{ fontSize: '12px', fontWeight: 900, marginBottom: '3px', color: '#000' }}>
                  {identity.branchName}
                </div>
              )}
              <p className="alnadary-tagline">
                {identity.taglineLines.map((line, idx) => (
                  <span key={idx} className="alnadary-tagline-line">
                    {line}
                  </span>
                ))}
              </p>
            </div>

            <div className="alnadary-header-center">
              {shouldShowLogo && (
                <img
                  src={identity.logoUrl}
                  alt="شعار شركة النظاري"
                  className="alnadary-logo-img"
                  loading="eager"
                  decoding="sync"
                  onError={e => {
                    const target = e.currentTarget;
                    if (target.src !== window.location.origin + ALNADARY_DEFAULT_LOGO) {
                      target.src = ALNADARY_DEFAULT_LOGO;
                    }
                  }}
                />
              )}
            </div>

            <div className="alnadary-header-left">
              <div className="alnadary-address-block">
                <div>{identity.address}</div>
                <div>{identity.phone}</div>
              </div>
              {formattedDate && (
                <div className="alnadary-date-row">
                  <span>التاريخ :</span>
                  <span dir="ltr">{formattedDate}</span>
                </div>
              )}
            </div>
          </div>

          <hr className="alnadary-solid-divider" />
        </>
      )}

      <PrintTemplateEditorModal isOpen={editorOpen} onClose={() => setEditorOpen(false)} />

      {/* عنوان المستند في المنتصف */}
      <div className="alnadary-doc-title">{documentTitle}</div>

      {/* بيانات العميل / المورد والرقم وطريقة الدفع */}
      <div className="alnadary-meta-grid">
        <div className="alnadary-meta-col-right" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {rightMeta.map((field, idx) => (
            <div key={idx} className="alnadary-meta-item">
              <span className="alnadary-meta-label">{field.label} :</span>
              <span className="alnadary-meta-value" dir={field.dir}>
                {field.value}
              </span>
            </div>
          ))}
        </div>

        <div className="alnadary-meta-col-left" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {hideLetterhead && formattedDate && (
            <div className="alnadary-meta-item">
              <span className="alnadary-meta-label">التاريخ :</span>
              <span className="alnadary-meta-value" dir="ltr">
                {formattedDate}
              </span>
            </div>
          )}
          {documentNumber && (
            <div className="alnadary-meta-item">
              <span className="alnadary-meta-label">{documentNumberLabel} :</span>
              <span className="alnadary-meta-value" dir="ltr">
                {documentNumber}
              </span>
            </div>
          )}
          {leftMeta.map((field, idx) => (
            <div key={idx} className="alnadary-meta-item">
              <span className="alnadary-meta-label">{field.label} :</span>
              <span className="alnadary-meta-value" dir={field.dir}>
                {field.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <hr className="alnadary-dashed-divider" />
    </div>
  );
};

export default AlNadaryPrintHeader;
