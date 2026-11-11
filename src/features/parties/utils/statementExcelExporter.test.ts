import { describe, it, expect } from 'vitest';
import {
  generateStatementExcelWorkbook,
  type StatementEntry,
  type CompanyInfo,
} from './statementExcelExporter';
import { debtAiService } from '../../debts/services/debtAiService';

const mockCompany: CompanyInfo = {
  name_ar: 'شركة الأمل التجاري',
  address: 'صنعاء - شارع الزبيري',
  phone: '777000111',
  tax_number: '123456789',
  bank_name: 'بنك الكريمي',
  bank_account_iban: 'YE123456789',
};

const mockMultiCurrencyEntries: StatementEntry[] = [
  {
    date: '2026-10-01',
    operation_type: 'فاتورة بيع',
    reference_no: 'INV-101',
    desc: 'مبيعات قطع غيار',
    debit: 1500,
    credit: 0,
    balance: 1500,
    currency: 'SAR',
    payment_status: 'unpaid',
  },
  {
    date: '2026-10-05',
    operation_type: 'سند قبض',
    reference_no: 'REC-201',
    desc: 'دفعة نقدية',
    debit: 0,
    credit: 500,
    balance: 1000,
    currency: 'SAR',
    payment_status: 'paid',
  },
  {
    date: '2026-10-10',
    operation_type: 'فاتورة بيع',
    reference_no: 'INV-102',
    desc: 'مبيعات زيوت',
    debit: 400000,
    credit: 0,
    balance: 400000,
    currency: 'YER',
    payment_status: 'unpaid',
  },
  {
    date: '2026-10-15',
    operation_type: 'سند قبض',
    reference_no: 'REC-202',
    desc: 'دفعة نقدية بالريال اليمني',
    debit: 0,
    credit: 150000,
    balance: 250000,
    currency: 'YER',
    payment_status: 'paid',
  },
];

describe('statementExcelExporter Multi-Currency', () => {
  it('creates multi-sheet workbook separating SAR and YER when both exist', async () => {
    const wb = await generateStatementExcelWorkbook(
      mockCompany,
      'مؤسسة النور',
      mockMultiCurrencyEntries,
      { partyType: 'customer' }
    );

    expect(wb.SheetNames).toContain('ملخص شامل للعملات');
    expect(wb.SheetNames).toContain('ريال سعودي (SAR)');
    expect(wb.SheetNames).toContain('ريال يمني (YER)');
  });

  it('creates single sheet workbook when entries are in single currency', async () => {
    const sarOnlyEntries = mockMultiCurrencyEntries.filter(e => e.currency === 'SAR');
    const wb = await generateStatementExcelWorkbook(
      mockCompany,
      'مؤسسة النور',
      sarOnlyEntries,
      { currencyCode: 'SAR', partyType: 'customer' }
    );

    expect(wb.SheetNames.length).toBe(1);
    expect(wb.SheetNames[0]).toBe('كشف حساب - ريال سعودي');
  });
});

describe('debtAiService.generateWhatsAppStatementSummary', () => {
  it('formats multi-currency statement distinguishing SAR and YER', () => {
    const message = debtAiService.generateWhatsAppStatementSummary({
      partyName: 'مؤسسة النور',
      companyName: 'شركة الأمل التجاري',
      currencies: [
        { currency: 'SAR', totalDebit: 1500, totalCredit: 500, finalBalance: 1000 },
        { currency: 'YER', totalDebit: 400000, totalCredit: 150000, finalBalance: 250000 },
      ],
      movements: [
        {
          date: '2026-10-01',
          ref: 'INV-101',
          desc: 'مبيعات قطع غيار',
          debit: 1500,
          credit: 0,
          currency: 'SAR',
        },
        {
          date: '2026-10-10',
          ref: 'INV-102',
          desc: 'مبيعات زيوت',
          debit: 400000,
          credit: 0,
          currency: 'YER',
        },
      ],
    });

    expect(message).toContain('كشف حساب مالي تفصيلي');
    expect(message).toContain('🇸🇦 *حساب الريال السعودي (SAR):*');
    expect(message).toContain('🇾🇪 *حساب الريال اليمني (YER):*');
    expect(message).toContain('1,000.00 SAR');
    expect(message).toContain('250,000.00 YER');
    expect(message).toContain('مبيعات قطع غيار');
  });
});

