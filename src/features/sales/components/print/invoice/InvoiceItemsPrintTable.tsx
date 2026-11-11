import type { ReactElement } from 'react';
import { formatCurrency } from '@/core/utils';
import type { InvoiceDisplayItem } from './invoicePrintModel';

interface ItemRowProps {
  item: InvoiceDisplayItem;
  index: number;
  currencyCode: string;
  /** إظهار عمود الضريبة فقط عند وجود ضريبة فعلية في بنود الفاتورة. */
  showTax: boolean;
}

/** سطر بند واحد: الرمز ورقم القطعة يُدمجان في سطر ثانوي تحت الاسم. */
const InvoiceItemRow = ({ item, index, currencyCode, showTax }: ItemRowProps): ReactElement => {
  const code = [item.sku, item.partNumber].filter(value => value !== '').join(' | ');
  return (
    <tr className="inv-row-zebra border-b border-slate-200">
      <td className="border border-slate-200 px-1 py-1.5 text-center font-mono text-slate-500">
        {index + 1}
      </td>
      <td className="border border-slate-200 px-2 py-1.5 text-right font-semibold text-slate-900">
        <div>{item.name}</div>
        {code !== '' && (
          <div className="font-mono text-[10px] text-slate-500" dir="ltr">
            {code}
          </div>
        )}
      </td>
      <td
        className="border border-slate-200 px-2 py-1.5 text-center font-mono font-bold text-slate-800"
        dir="ltr"
      >
        {item.quantity}
      </td>
      <td
        className="border border-slate-200 px-2 py-1.5 text-center font-mono text-slate-700"
        dir="ltr"
      >
        {formatCurrency(item.unitPrice, currencyCode)}
      </td>
      {showTax && (
        <td
          className="border border-slate-200 px-2 py-1.5 text-center font-mono text-slate-600"
          dir="ltr"
        >
          {formatCurrency(item.taxAmount, currencyCode)}
        </td>
      )}
      <td
        className="border border-slate-200 px-2 py-1.5 text-center font-mono font-black text-slate-900"
        dir="ltr"
      >
        {formatCurrency(item.lineTotal, currencyCode)}
      </td>
    </tr>
  );
};

const BASE_HEADER_CELLS: ReadonlyArray<{ label: string; width: string; align: 'right' | 'center' }> = [
  { label: '#', width: '4%', align: 'center' },
  { label: 'بيان الصنف / الخدمة', width: '42%', align: 'right' },
  { label: 'الكمية', width: '10%', align: 'center' },
  { label: 'سعر الوحدة', width: '16%', align: 'center' },
];

const TAX_HEADER_CELL = { label: 'الضريبة', width: '12%', align: 'center' as const };
const TOTAL_HEADER_PLAIN = { label: 'الإجمالي', width: '18%', align: 'center' as const };
const TOTAL_HEADER_WITH_TAX = {
  label: 'الإجمالي شامل الضريبة',
  width: '18%',
  align: 'center' as const,
};

/** جدول بنود الفاتورة — رؤوس ثابتة وأعمدة بأعراض مئوية تُطبع بثبات على A4. */
const InvoiceItemsPrintTable = ({
  items,
  currencyCode,
}: {
  items: InvoiceDisplayItem[];
  currencyCode: string;
}): ReactElement => {
  // [NO-TAX] لا يُطبع عمود الضريبة إلا إذا كانت هناك ضريبة فعلية على أحد البنود.
  const showTax = items.some(item => Number(item.taxAmount) > 0);
  const headerCells = showTax
    ? [...BASE_HEADER_CELLS, TAX_HEADER_CELL, TOTAL_HEADER_WITH_TAX]
    : [...BASE_HEADER_CELLS, TOTAL_HEADER_PLAIN];

  return (
    <table className="mb-4 w-full border-collapse border border-slate-200 text-xs">
      <thead>
        <tr className="inv-cell-header text-center">
          {headerCells.map(cell => (
            <th
              key={cell.label}
              className={`border border-slate-300 px-2 py-2 font-bold ${
                cell.align === 'right' ? 'text-right' : 'text-center'
              }`}
              style={{ width: cell.width }}
            >
              {cell.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td
              colSpan={headerCells.length}
              className="border border-slate-200 py-8 text-center text-slate-400"
            >
              لا توجد بنود في هذه الفاتورة
            </td>
          </tr>
        ) : (
          items.map((item, index) => (
            <InvoiceItemRow
              key={item.id}
              item={item}
              index={index}
              currencyCode={currencyCode}
              showTax={showTax}
            />
          ))
        )}
      </tbody>
    </table>
  );
};

export default InvoiceItemsPrintTable;
