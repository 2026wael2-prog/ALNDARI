import type { ReactElement } from 'react';

interface MetaRowProps {
  label: string;
  value: string;
  ltr?: boolean | undefined;
}

/** صف بيان اختياري: لا يُرسم إن كانت القيمة فارغة (لا سطور معلّقة). */
const MetaRow = ({ label, value, ltr = false }: MetaRowProps): ReactElement | null => {
  if (value === '') return null;
  return (
    <p className="text-[11px] text-slate-600" dir={ltr ? 'ltr' : undefined}>
      <span className="font-semibold" dir={ltr ? 'rtl' : undefined}>
        {label}
      </span>{' '}
      {value}
    </p>
  );
};

/** صف «تسمية ← قيمة» على طرفي السطر (تفاصيل العملية). */
const MetaPairRow = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean | undefined;
}): ReactElement | null => {
  if (value === '') return null;
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={mono ? 'font-mono' : 'font-semibold'} dir={mono ? 'ltr' : undefined}>
        {value}
      </span>
    </div>
  );
};

/** ترويسة صغيرة بنقطة لونية موحّدة للبطاقتين. */
const CardTitle = ({ title, accentColor }: { title: string; accentColor: string }): ReactElement => (
  <div className="flex items-center gap-1.5 font-bold text-slate-700">
    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accentColor }}></span>
    <span>{title}</span>
  </div>
);

interface InvoicePrintMetaCardsProps {
  partyName: string;
  partyTaxNumber: string;
  partyPhone: string;
  partyAddress: string;
  paymentLabel: string;
  branchName: string;
  dueDate: string;
  issuedBy: string;
  accentColor: string;
}

/** بطاقتا بيانات العميل وتفاصيل العملية أعلى بنود الفاتورة. */
const InvoicePrintMetaCards = ({
  partyName,
  partyTaxNumber,
  partyPhone,
  partyAddress,
  paymentLabel,
  branchName,
  dueDate,
  issuedBy,
  accentColor,
}: InvoicePrintMetaCardsProps): ReactElement => (
  <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
    <div className="space-y-1">
      <CardTitle title="بيانات العميل (Bill To):" accentColor={accentColor} />
      <div className="space-y-0.5 pr-3 text-slate-800">
        <p className="text-sm font-bold text-slate-900">{partyName}</p>
        <MetaRow label="الرقم الضريبي:" value={partyTaxNumber} />
        <MetaRow label="الهاتف:" value={partyPhone} ltr />
        <MetaRow label="العنوان:" value={partyAddress} />
      </div>
    </div>

    <div className="space-y-1 border-r border-slate-200 pr-3">
      <CardTitle title="تفاصيل العملية:" accentColor={accentColor} />
      <div className="space-y-0.5 pr-3 text-slate-800">
        <div className="flex justify-between">
          <span className="text-slate-500">نوع الفاتورة:</span>
          <span className="font-bold">{paymentLabel}</span>
        </div>
        <MetaPairRow label="الفرع:" value={branchName} />
        <MetaPairRow label="تاريخ الاستحقاق:" value={dueDate} mono />
        <MetaPairRow label="المستخدم / البائع:" value={issuedBy} />
      </div>
    </div>
  </div>
);

export default InvoicePrintMetaCards;

