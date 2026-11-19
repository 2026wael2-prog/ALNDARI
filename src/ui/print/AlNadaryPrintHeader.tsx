import React from 'react';

export interface AlNadaryHeaderCompany {
  nameAr?: string | null | undefined;
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
  /** بيانات الشركة الاختيارية (تسقط للقيم الرسمية المعتمدة لشركة النظاري) */
  company?: AlNadaryHeaderCompany | null | undefined;
}

export const ALNADARY_DEFAULT_LOGO = '/assets/alnadary-print-logo.png';

export const ALNADARY_DEFAULT_TAGLINE: readonly string[] = [
  'لبيع قطع غيار السيارات بجميع أنواعها',
  'وبيع جميع أنواع الفريمات والمكملات',
  'والزيوت والإطارات والبطاريات',
];

export const ALNADARY_DEFAULT_ADDRESS = 'الجمهورية اليمنية - المهرة - الغيظة - خلف مطعم قطر';
export const ALNADARY_DEFAULT_PHONE = 'هاتف : 05610263 - جوال : 712165706 - 770319249';

/**
 * الهيدر الموحد الرسمي لشركة النظاري لقطع غيار السيارات.
 * يُستخدم في كافة المستندات المطبوعة: فواتير المبيعات، المشتريات، السندات، وكشوف الحساب.
 */
export const AlNadaryPrintHeader: React.FC<AlNadaryPrintHeaderProps> = ({
  documentTitle,
  documentDate,
  documentNumber,
  documentNumberLabel = 'رقم الفاتورة',
  rightMeta = [],
  leftMeta = [],
  company,
}) => {
  const logoSrc =
    company?.logoUrl && company.logoUrl.trim().length > 0
      ? company.logoUrl
      : ALNADARY_DEFAULT_LOGO;

  const addressText =
    company?.address && company.address.trim().length > 0
      ? company.address
      : ALNADARY_DEFAULT_ADDRESS;

  const phoneText =
    company?.phone && company.phone.trim().length > 0 ? company.phone : ALNADARY_DEFAULT_PHONE;

  const taglineLines =
    company?.taglineLines && company.taglineLines.length > 0
      ? company.taglineLines
      : ALNADARY_DEFAULT_TAGLINE;

  const formattedDate = documentDate ? documentDate.replace(/-/g, '/') : '';

  return (
    <header className="alnadary-header-wrapper">
      {/* الصف العلوي ثلاثي الأعمدة: يمين (الاسم + الأحمر) | منتصف (الشعار) | يسار (العنوان + الهاتف + التاريخ) */}
      <div className="alnadary-header-grid">
        <div className="alnadary-header-right">
          <h1 className="alnadary-company-title">النظــــاري</h1>
          <p className="alnadary-tagline">
            {taglineLines.map((line, idx) => (
              <span key={idx} className="alnadary-tagline-line">
                {line}
              </span>
            ))}
          </p>
        </div>

        <div className="alnadary-header-center">
          <img
            src={logoSrc}
            alt="شعار شركة النظاري"
            className="alnadary-logo-img"
            onError={e => {
              const target = e.currentTarget;
              if (target.src !== window.location.origin + ALNADARY_DEFAULT_LOGO) {
                target.src = ALNADARY_DEFAULT_LOGO;
              }
            }}
          />
        </div>

        <div className="alnadary-header-left">
          <div className="alnadary-address-block">
            <div>{addressText}</div>
            <div>{phoneText}</div>
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

      {/* عنوان المستند في المنتصف */}
      <div className="alnadary-doc-title">{documentTitle}</div>

      {/* بيانات العميل / المورد والرقم وطريقة الدفع */}
      <div className="alnadary-meta-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {rightMeta.map((field, idx) => (
            <div key={idx} className="alnadary-meta-item">
              <span className="alnadary-meta-label">{field.label} :</span>
              <span className="alnadary-meta-value" dir={field.dir}>
                {field.value}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
    </header>
  );
};

export default AlNadaryPrintHeader;
