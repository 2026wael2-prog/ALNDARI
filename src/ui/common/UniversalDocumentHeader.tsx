/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unnecessary-type-conversion, @typescript-eslint/restrict-template-expressions, @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unnecessary-condition */
import React from 'react';
import { Building2, ShieldCheck, Phone, MapPin, Mail, Calendar } from 'lucide-react';
import type { DocumentHeaderConfig, LogoSize } from '@/core/types/documentHeader';
import { DEFAULT_DOCUMENT_HEADER_CONFIG } from '@/core/types/documentHeader';

export interface UniversalDocumentHeaderProps {
  config?: DocumentHeaderConfig;
  company?: {
    name?: string | undefined;
    logo_url?: string | undefined;
    phone?: string | undefined;
    email?: string | undefined;
    address?: string | undefined;
    tax_number?: string | undefined;
    commercial_register?: string | undefined;
    slogan?: string | undefined;
    name_en?: string | undefined;
  };
  documentTitle?: string | undefined;
  documentNumber?: string | undefined;
  documentDate?: string | undefined;
  statusBadge?: string | undefined;
  className?: string | undefined;
}

const LOGO_SIZE_CLASSES: Record<LogoSize, { img: string; maxH: number }> = {
  small: { img: 'h-12 w-auto max-w-[100px]', maxH: 48 },
  medium: { img: 'h-16 w-auto max-w-[140px]', maxH: 64 },
  large: { img: 'h-20 w-auto max-w-[180px]', maxH: 80 },
  xlarge: { img: 'h-24 w-auto max-w-[220px]', maxH: 96 },
};

export const UniversalDocumentHeader: React.FC<UniversalDocumentHeaderProps> = ({
  config = DEFAULT_DOCUMENT_HEADER_CONFIG,
  company = {},
  documentTitle,
  documentNumber,
  documentDate,
  statusBadge,
  className = '',
}) => {
  const { typography, logo, banner, details, style } = config;

  // Resolve values (priority: config overrides -> company record -> fallback)
  const resolvedCompanyName =
    details.companyNameOverride?.trim() || company.name?.trim() || 'اسم المنشأة التجارية';

  const resolvedSlogan = details.sloganText?.trim() || company.slogan?.trim() || '';
  const resolvedPhone = company.phone?.trim() || '';
  const resolvedEmail = company.email?.trim() || '';
  const resolvedAddress = company.address?.trim() || '';
  const resolvedTaxNumber = company.tax_number?.trim() || '';
  const resolvedCommercialRegister = company.commercial_register?.trim() || '';
  const resolvedLogoUrl = logo.logoUrl?.trim() || company.logo_url?.trim() || '';
  const resolvedNameEn = company.name_en?.trim() || '';

  // Safe font sizes (enforcing AGENTS.md rule: >= 10px)
  const safeTitleSize = Math.max(14, Number(typography.titleSize) || 22);
  const safeDetailsSize = Math.max(10, Number(typography.detailsSize) || 11);
  const accentColor = style.accentColor || '#1F4E78';

  // If full-banner mode is active and banner url exists
  if (banner.enabled && banner.bannerUrl) {
    return (
      <header
        className={`w-full overflow-hidden print:w-full ${className}`}
        style={{
          borderBottom: style.showDivider
            ? `${Math.max(1, style.borderWidth)}px solid ${style.borderColor || '#cbd5e1'}`
            : 'none',
        }}
      >
        <img
          src={banner.bannerUrl}
          alt={resolvedCompanyName}
          style={{
            height: `${banner.height}px`,
            objectFit: banner.objectFit,
            width: '100%',
          }}
          className="block w-full"
        />
        {documentTitle && (
          <div
            className="flex items-center justify-between border-b px-4 py-2 print:border-slate-800"
            style={{
              borderColor: style.borderColor || '#cbd5e1',
              backgroundColor: style.backgroundColor || '#ffffff',
            }}
          >
            <div className="flex items-center gap-2">
              <h2
                style={{
                  fontFamily: typography.titleFont,
                  color: accentColor,
                  fontSize: `${safeTitleSize * 0.85}px`,
                }}
                className="font-black"
              >
                {documentTitle}
              </h2>
              {statusBadge && (
                <span className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                  {statusBadge}
                </span>
              )}
            </div>
            {(documentNumber || documentDate) && (
              <div
                className="flex items-center gap-4 text-xs text-slate-700 print:text-black"
                style={{ fontFamily: typography.detailsFont }}
              >
                {documentNumber && (
                  <span>
                    <strong>رقم:</strong> <bdo dir="ltr" className="font-mono font-bold">{documentNumber}</bdo>
                  </span>
                )}
                {documentDate && (
                  <span>
                    <strong>التاريخ:</strong> <bdo dir="ltr" className="font-mono">{documentDate}</bdo>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </header>
    );
  }

  // Common Typography Styles
  const titleStyle: React.CSSProperties = {
    fontFamily: typography.titleFont,
    fontSize: `${safeTitleSize}px`,
    fontWeight: typography.titleBold ? 800 : 700,
    color: typography.titleColor || '#0f172a',
  };

  const detailsStyle: React.CSSProperties = {
    fontFamily: typography.detailsFont,
    fontSize: `${safeDetailsSize}px`,
    fontWeight: typography.detailsBold ? 600 : 400,
    color: typography.detailsColor || '#334155',
    lineHeight: 1.5,
  };

  // Logo Element (Render Image or Dignified Emblem)
  const renderLogo = (isCenter = false) => {
    if (!logo.showLogo) return null;

    if (resolvedLogoUrl) {
      const sizeConfig = LOGO_SIZE_CLASSES[logo.size] || LOGO_SIZE_CLASSES.medium;
      return (
        <div className={`flex flex-shrink-0 items-center justify-center ${isCenter ? 'mx-auto' : ''}`}>
          <img
            src={resolvedLogoUrl}
            alt={resolvedCompanyName}
            className={`${sizeConfig.img} object-contain transition-all`}
            style={{
              maxHeight: logo.customWidth ? undefined : `${sizeConfig.maxH}px`,
              width: logo.customWidth ? `${logo.customWidth}px` : undefined,
              borderRadius: `${logo.borderRadius ?? 8}px`,
            }}
          />
        </div>
      );
    }

    // Default Prestigious Seal / Emblem when no image is uploaded
    return (
      <div
        className={`flex flex-shrink-0 flex-col items-center justify-center rounded-xl border border-slate-300 bg-slate-50/90 p-2 shadow-2xs print:border-slate-400 print:bg-white ${
          isCenter ? 'mx-auto' : ''
        }`}
        style={{
          width: '70px',
          height: '66px',
          borderColor: style.borderColor || '#cbd5e1',
        }}
        title="الختم التجاري المعتمد"
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-xs"
          style={{ backgroundColor: accentColor }}
        >
          <Building2 size={18} />
        </div>
        <span className="mt-1 text-[10px] font-black tracking-tight text-slate-700 print:text-black">
          معتمد رسمياً
        </span>
      </div>
    );
  };

  // Official Commercial Details Badges
  const renderDetails = (align: 'right' | 'left' | 'center' = 'right') => {
    const alignClass =
      align === 'center'
        ? 'items-center text-center'
        : align === 'left'
          ? 'items-start text-left'
          : 'items-start text-right';

    return (
      <div className={`flex flex-col gap-1.5 ${alignClass}`} style={detailsStyle}>
        {details.showSlogan && resolvedSlogan && (
          <p className="text-xs font-semibold text-slate-600 print:text-slate-800">
            {resolvedSlogan}
          </p>
        )}

        {/* Commercial Registration & Tax Identification Badges */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {details.showTaxNumber && resolvedTaxNumber && (
            <span className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-800 print:border-slate-400 print:bg-transparent print:text-black">
              <span className="text-slate-500 print:text-black">
                {details.taxNumberLabel || 'الرقم الضريبي'}:
              </span>
              <bdo dir="ltr" className="font-mono font-black">{resolvedTaxNumber}</bdo>
            </span>
          )}

          {details.showCommercialRegister && resolvedCommercialRegister && (
            <span className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-800 print:border-slate-400 print:bg-transparent print:text-black">
              <span className="text-slate-500 print:text-black">
                {details.commercialRegisterLabel || 'السجل التجاري'}:
              </span>
              <bdo dir="ltr" className="font-mono font-black">{resolvedCommercialRegister}</bdo>
            </span>
          )}
        </div>

        {/* Contact info row: Phone, Address, Email */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[11px] text-slate-600 print:text-slate-800">
          {details.showPhone && resolvedPhone && (
            <span className="inline-flex items-center gap-1">
              <Phone size={11} className="text-slate-400 print:text-slate-600" />
              <span className="font-bold text-slate-500 print:text-black">{details.phoneLabel || 'هاتف'}:</span>
              <bdo dir="ltr" className="font-mono font-bold text-slate-900 print:text-black">{resolvedPhone}</bdo>
            </span>
          )}

          {details.showAddress && resolvedAddress && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} className="text-slate-400 print:text-slate-600" />
              <span>{resolvedAddress}</span>
            </span>
          )}

          {details.showEmail && resolvedEmail && (
            <span className="inline-flex items-center gap-1">
              <Mail size={11} className="text-slate-400 print:text-slate-600" />
              <span className="font-mono">{resolvedEmail}</span>
            </span>
          )}
        </div>

        {details.showCustomNote && details.customNoteText && (
          <p className="mt-0.5 text-[10px] text-slate-500 print:text-slate-700">{details.customNoteText}</p>
        )}
      </div>
    );
  };

  // Official Document Identification Card (Title, Number, Date, Status)
  const renderDocumentBadge = () => {
    if (!documentTitle && !documentNumber && !documentDate && !statusBadge) return null;

    return (
      <div
        className="flex flex-shrink-0 flex-col items-center justify-center rounded-xl border-2 bg-gradient-to-b from-white to-slate-50/80 p-3 shadow-2xs print:border-slate-800 print:bg-white print:shadow-none sm:items-end"
        style={{
          borderColor: accentColor,
          fontFamily: typography.detailsFont,
        }}
      >
        {/* Document Title Badge */}
        {documentTitle && (
          <div
            className="mb-1.5 flex items-center gap-1.5 rounded-lg px-3 py-1 font-black text-white shadow-xs print:border print:border-black print:text-white"
            style={{
              backgroundColor: accentColor,
              fontSize: `${Math.max(13, safeTitleSize * 0.7)}px`,
            }}
          >
            <ShieldCheck size={14} className="shrink-0" />
            <span>{documentTitle}</span>
          </div>
        )}

        {/* Status Chip if present */}
        {statusBadge && (
          <div className="mb-1 rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 print:border-slate-400 print:text-black">
            {statusBadge}
          </div>
        )}

        {/* Document Number */}
        {documentNumber && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 print:text-black">
            <span className="text-slate-500 print:text-black">رقم المستند:</span>
            <bdo dir="ltr" className="font-mono font-black text-slate-900 print:text-black">
              {documentNumber}
            </bdo>
          </div>
        )}

        {/* Document Date */}
        {documentDate && (
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600 print:text-black">
            <Calendar size={11} className="text-slate-400 print:text-slate-700" />
            <span className="font-bold text-slate-500 print:text-black">التاريخ:</span>
            <bdo dir="ltr" className="font-mono font-semibold">{documentDate}</bdo>
          </div>
        )}
      </div>
    );
  };

  return (
    <header
      className={`relative w-full overflow-hidden bg-white text-slate-900 print:bg-white print:text-black ${className}`}
      style={{
        backgroundColor: style.backgroundColor || '#ffffff',
        paddingTop: `${Math.max(8, style.paddingY)}px`,
        paddingBottom: `${Math.max(8, style.paddingY)}px`,
      }}
    >
      {/* Top Official Decorative Accent Ribbon */}
      <div
        className="absolute left-0 right-0 top-0 h-1.5 print:h-1"
        style={{
          background: `linear-gradient(90deg, ${accentColor}, #3b82f6 50%, ${accentColor})`,
        }}
      />

      {/* Modern Centered Layout */}
      {style.layout === 'modern-centered' && (
        <div className="flex flex-col items-center gap-3 px-4 pt-1 text-center">
          {logo.position === 'center' && renderLogo(true)}
          <div className="flex w-full flex-col items-center justify-center gap-2">
            {details.showCompanyName && (
              <h1 style={titleStyle} className="leading-tight text-slate-950 print:text-black">
                {resolvedCompanyName}
              </h1>
            )}
            {resolvedNameEn && (
              <p className="font-mono text-xs font-bold tracking-wider text-slate-600 print:text-black" dir="ltr">
                {resolvedNameEn}
              </p>
            )}
            {renderDetails('center')}
          </div>
          {renderDocumentBadge()}
        </div>
      )}

      {/* Compact Minimal Layout */}
      {style.layout === 'compact-minimal' && (
        <div className="flex items-center justify-between gap-4 px-3 pt-1">
          <div className="flex items-center gap-3">
            {renderLogo()}
            <div>
              {details.showCompanyName && (
                <h1
                  style={{ ...titleStyle, fontSize: `${safeTitleSize * 0.9}px` }}
                  className="font-black leading-tight text-slate-950 print:text-black"
                >
                  {resolvedCompanyName}
                </h1>
              )}
              <div
                className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-700 print:text-black"
                style={detailsStyle}
              >
                {details.showPhone && resolvedPhone && <span>هاتف: {resolvedPhone}</span>}
                {details.showTaxNumber && resolvedTaxNumber && (
                  <span>ضريبي: {resolvedTaxNumber}</span>
                )}
                {details.showCommercialRegister && resolvedCommercialRegister && (
                  <span>س.ت: {resolvedCommercialRegister}</span>
                )}
              </div>
            </div>
          </div>
          {renderDocumentBadge()}
        </div>
      )}

      {/* Classic Split Layout (Default Official Commercial Design) */}
      {(style.layout === 'classic-split' || !style.layout) && (
        <div className="flex flex-col items-start justify-between gap-4 px-4 pt-1 sm:flex-row sm:items-center">
          {/* Right Section: Commercial Organization Info */}
          <div className="flex items-center gap-4">
            {logo.position !== 'left' && renderLogo()}
            <div className="flex flex-col">
              {details.showCompanyName && (
                <h1 style={titleStyle} className="mb-0.5 leading-snug text-slate-950 print:text-black">
                  {resolvedCompanyName}
                </h1>
              )}
              {resolvedNameEn && (
                <p className="font-mono text-xs font-bold tracking-wider text-slate-600 print:text-black" dir="ltr">
                  {resolvedNameEn}
                </p>
              )}
              {renderDetails('right')}
            </div>
          </div>

          {/* Left Section: Document Identification Card or Left Logo */}
          <div className="flex items-center gap-4 self-end sm:self-center">
            {renderDocumentBadge()}
            {logo.position === 'left' && renderLogo()}
          </div>
        </div>
      )}

      {/* Official Bottom Commercial Dual-Line Divider */}
      {style.showDivider && (
        <div className="mt-3 w-full">
          <div
            className="h-[2px] w-full"
            style={{ backgroundColor: accentColor }}
          />
          <div className="mt-[2px] h-[1px] w-full bg-slate-200 print:bg-slate-400" />
        </div>
      )}
    </header>
  );
};

export default UniversalDocumentHeader;
