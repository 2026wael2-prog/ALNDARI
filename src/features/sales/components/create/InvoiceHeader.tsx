import React, { useState } from 'react';
import { Building2, FileCheck, ShieldCheck, Sparkles, CheckCircle2, QrCode } from 'lucide-react';
import { useInvoiceSettings } from '../../../settings/settingsStore';

interface InvoiceHeaderProps {
  company: {
    name_ar?: string | null;
    name_en?: string | null;
    address?: string | null;
    tax_number?: string | null;
    logo_url?: string | null;
    phone?: string | null;
    [key: string]: unknown;
  } | null;
  documentTypeTitle?: string;
}

const InvoiceHeader: React.FC<InvoiceHeaderProps> = ({ company, documentTypeTitle }) => {
  const settings = useInvoiceSettings();
  const [logoError, setLogoError] = useState(false);

  const nameAr = settings.company_name_ar || company?.name_ar || 'اسم المنشأة';
  const nameEn = settings.company_name_en || company?.name_en || '';
  const address = settings.company_address || company?.address || '';
  const specialization = settings.company_specialization || '';
  const taxNumber = company?.tax_number || '';
  const companyPhone = company?.phone || '';
  const logoSrc = !logoError ? company?.logo_url || null : null;

  return (
    <div className="relative overflow-hidden rounded-t-2xl border-b border-slate-700/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-3 py-1.5 text-white shadow-md">
      {/* Decorative top ambient bar */}
      <div className="absolute left-0 right-0 top-0 h-[2px] bg-gradient-to-r from-blue-500 via-emerald-400 to-indigo-500 shadow-sm shadow-emerald-500/50"></div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Right: Company Logo & Identity */}
        <div className="flex items-center gap-2.5">
          {logoSrc ? (
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-700/80 bg-white p-0.5 shadow-sm shadow-black/30">
              <img
                src={logoSrc}
                alt={nameAr}
                onError={() => {
                  setLogoError(true);
                }}
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-blue-400/40 bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-700 text-white shadow-sm shadow-blue-500/25">
              <Building2 size={18} />
            </div>
          )}

          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="flex items-center gap-1 text-sm font-black tracking-tight text-white">
                <span>{nameAr}</span>
                <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
              </h1>
              {specialization && (
                <span className="rounded-md border border-blue-400/30 bg-blue-500/20 px-1.5 py-0 text-[10px] font-bold text-blue-300">
                  {specialization}
                </span>
              )}
            </div>

            {(address || companyPhone || taxNumber) && (
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-slate-400">
                {address && <span>{address}</span>}
                {companyPhone && (
                  <>
                    {address && <span className="text-slate-600">•</span>}
                    <span dir="ltr" className="font-mono text-slate-300">
                      {companyPhone}
                    </span>
                  </>
                )}
                {taxNumber && (
                  <>
                    {(address || companyPhone) && <span className="text-slate-600">•</span>}
                    <div className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800/80 px-1.5 py-0 font-mono font-bold text-slate-300">
                      <QrCode size={10} className="text-emerald-400" />
                      <span>الرقم الضريبي: {taxNumber}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center: Transaction Type & ERP Trust Badges */}
        <div className="hidden items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-850/90 px-2.5 py-1 text-xs shadow-inner md:flex">
          <div className="flex items-center gap-1 font-black text-emerald-400">
            <FileCheck size={14} />
            <span>{documentTypeTitle || 'فاتورة مبيعات ضريبية'}</span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-300">
            <ShieldCheck size={13} className="text-blue-400" />
            <span>الجمهورية اليمنية - نظام محاسبي معتمد</span>
          </div>
        </div>

        {/* Left: English Identity & Realtime Indicator */}
        <div className="flex items-center gap-2 text-left" dir="ltr">
          <div className="hidden sm:block">
            <p className="font-mono text-[11px] font-black uppercase leading-tight tracking-wider text-slate-200">
              {nameEn}
            </p>
            <p className="font-mono text-[10px] font-bold leading-tight tracking-tight text-slate-400">
              {settings.invoice_header_text || 'ELECTRONIC TAX INVOICE'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-300 shadow-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            <Sparkles size={12} className="ml-0.5 text-emerald-400" />
            <span>POS Live</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceHeader;
