import type { ReactElement } from 'react';
import type { CompanyHeaderData, HeaderLayoutMode } from '../PrintDocumentHeader';
import type { InvoiceCompanyHeader } from './companyHeader';
import type { InvoicePrintView } from './invoicePrintModel';
import { AlNadaryPrintShell } from '@/ui/print/AlNadaryPrintShell';

interface InvoicePrintDocumentProps {
  view: InvoicePrintView;
  companyHeader: InvoiceCompanyHeader;
  layoutMode: HeaderLayoutMode;
  accentColor: string;
  showQrCode: boolean;
  onUpdateCompany: (updated: Partial<CompanyHeaderData>) => void;
}

const formatNum = (val: number): string => {
  if (!Number.isFinite(val)) return '0';
  return Number.isInteger(val)
    ? val.toLocaleString('en-US')
    : val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * قالب طباعة فاتورة المبيعات الموحد لشركة النظاري — مطابق للفاتورة المرجعية الرسمية.
 */
const InvoicePrintDocument = ({ view, companyHeader }: InvoicePrintDocumentProps): ReactElement => {
  const customerDisplay = view.partyPhone
    ? `${view.partyName}   ${view.partyPhone}`
    : view.partyName;

  const docTitle = view.isReturn ? 'فاتورة مرتجع مبيعات' : 'فاتورة بيع المحل';

  return (
    <AlNadaryPrintShell
      documentTitle={docTitle}
      documentDate={view.documentMeta.documentDate}
      documentNumber={view.documentMeta.documentNumber}
      documentNumberLabel="رقم الفاتورة"
      company={{
        nameAr: companyHeader.nameAr,
        logoUrl: companyHeader.logoUrl,
        address: companyHeader.address,
        phone: companyHeader.phone,
      }}
      rightMeta={[
        { label: 'المطلوب من السيد', value: customerDisplay },
        ...(view.partyAddress ? [{ label: 'العنوان', value: view.partyAddress }] : []),
      ]}
      leftMeta={[
        { label: 'طريقة الدفع', value: view.paymentLabel },
        ...(view.branchName ? [{ label: 'الفرع', value: view.branchName }] : []),
      ]}
    >
      {/* جدول المواد الرسمي من اليمين إلى اليسار (7 أعمدة مطابقة للمرجع) */}
      <table className="alnadary-table">
        <thead>
          <tr>
            <th style={{ width: '5%' }}>م</th>
            <th style={{ width: '41%' }}>اسم المادة</th>
            <th style={{ width: '8%' }}>الكمية</th>
            <th style={{ width: '10%' }}>السعر</th>
            <th style={{ width: '9%' }}>الوحدة</th>
            <th style={{ width: '12%' }}>إجمالي</th>
            <th style={{ width: '15%' }}>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          {view.items.length === 0 ? (
            <tr>
              <td colSpan={7} className="alnadary-td-center" style={{ padding: '14px' }}>
                لا توجد مواد مسجلة في هذه الفاتورة
              </td>
            </tr>
          ) : (
            view.items.map((item, idx) => (
              <tr key={item.id || idx}>
                <td className="alnadary-td-center">{idx + 1}</td>
                <td className="alnadary-td-right">
                  <div>{item.name}</div>
                  {item.partNumber && (
                    <div style={{ fontSize: '10px', fontWeight: 600 }} dir="ltr">
                      {item.partNumber}
                    </div>
                  )}
                </td>
                <td className="alnadary-td-num">{formatNum(item.quantity)}</td>
                <td className="alnadary-td-num">{formatNum(item.unitPrice)}</td>
                <td className="alnadary-td-center">{item.unit || ''}</td>
                <td className="alnadary-td-num">{formatNum(item.lineTotal)}</td>
                <td className="alnadary-td-center">{item.notes || ''}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* الإجماليات والتفقيط أسفل الفاتورة — مطابقة لتوزيع الصورة المرجعية */}
      <div className="alnadary-totals-section">
        <div className="alnadary-total-bar">
          <div className="alnadary-total-bar-label">الإجمالي</div>
          <div className="alnadary-total-bar-words">{view.amountInWords}</div>
          <div className="alnadary-total-bar-amount">{formatNum(view.totals.total)}</div>
        </div>

        <div className="alnadary-inline-summary">
          {view.totals.discount > 0 && (
            <span>
              الخصم : <span dir="ltr">{formatNum(view.totals.discount)}</span>
            </span>
          )}
          <span>
            المدفوع / الدفعة : <span dir="ltr">{formatNum(view.totals.paid)}</span>
          </span>
          <span>العملة : {view.currencyUnit}</span>
        </div>

        <div className="alnadary-remaining-row">
          <div style={{ fontWeight: 900 }}>المتبقي بالفاتورة :</div>
          <div style={{ fontWeight: 900, textAlign: 'center' }} dir="ltr">
            {formatNum(view.totals.remaining)}
          </div>
          <div className="alnadary-remaining-words-box">{view.remainingInWords}</div>
        </div>

        {view.notes && (
          <div className="alnadary-notes-box">
            <span>ملاحظات : </span>
            <span>{view.notes}</span>
          </div>
        )}
      </div>
    </AlNadaryPrintShell>
  );
};

export default InvoicePrintDocument;
