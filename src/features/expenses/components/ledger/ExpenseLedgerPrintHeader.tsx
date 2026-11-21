/* eslint-disable @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing */
import React from 'react';
import { formatLocalDate } from '@/core/utils/dateUtils';
import { AlNadaryPrintHeader } from '@/ui/print/AlNadaryPrintHeader';
import { ALNADARY_PRINT_CSS } from '@/ui/print/alNadaryPrintStyles';

interface ExpenseLedgerPrintHeaderProps {
  selectedAccount?:
    | {
        name: string;
        code: string;
        currency_code?: string | null | undefined;
      }
    | null
    | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

const currencyLabelOf = (code?: string | null): string => {
  const upper = (code || 'SAR').toUpperCase();
  if (upper === 'SAR') return 'ريال سعودي';
  if (upper === 'YER') return 'ريال يمني';
  if (upper === 'OMR') return 'ريال عماني';
  if (upper === 'USD') return 'دولار أمريكي';
  return upper;
};

export const ExpenseLedgerPrintHeader: React.FC<ExpenseLedgerPrintHeaderProps> = ({
  selectedAccount,
  dateFrom,
  dateTo,
}) => {
  const today = formatLocalDate();
  return (
    <div className="alnadary-print-sheet mb-4 hidden print:block" style={{ padding: 0 }} dir="rtl">
      <style>{ALNADARY_PRINT_CSS}</style>
      <AlNadaryPrintHeader
        documentTitle="كشف حساب تفصيلي - سجل الأستاذ العام"
        documentDate={today}
        documentNumber={selectedAccount?.code}
        documentNumberLabel="رقم الحساب"
        rightMeta={[
          ...(selectedAccount
            ? [{ label: 'الحساب', value: `${selectedAccount.name} (${selectedAccount.code})` }]
            : []),
          { label: 'الفترة', value: `من ${dateFrom || 'البداية'} إلى ${dateTo || 'الآن'}` },
        ]}
        leftMeta={[{ label: 'العملة', value: currencyLabelOf(selectedAccount?.currency_code) }]}
      />
    </div>
  );
};
