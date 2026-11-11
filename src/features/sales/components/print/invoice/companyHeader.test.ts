import { describe, expect, it } from 'vitest';
import {
  EMPTY_COMPANY_HEADER,
  mergeCompanyHeader,
  resolveCompanyHeader,
} from './companyHeader';

describe('resolveCompanyHeader', () => {
  it('يعطي إعدادات الفاتورة الأولوية على بيانات القاعدة والحالة السابقة', () => {
    const header = resolveCompanyHeader({
      previous: EMPTY_COMPANY_HEADER,
      invoiceSettings: { company_name_ar: 'الزهراء', company_phone: '0123' },
      settingsCompany: { name_ar: 'اسم القاعدة', phone: '9999', tax_number: '300' },
    });
    expect(header.nameAr).toBe('الزهراء');
    expect(header.phone).toBe('0123');
    expect(header.taxNumber).toBe('300');
  });

  it('يسقط إلى بيانات القاعدة ثم الحالة السابقة عند غياب الإعدادات', () => {
    const header = resolveCompanyHeader({
      previous: { ...EMPTY_COMPANY_HEADER, address: 'صنعاء' },
      invoiceCompany: { name: 'شركة النور' },
    });
    expect(header.nameAr).toBe('شركة النور');
    expect(header.address).toBe('صنعاء');
  });

  it('يعيد حقولاً نصية كاملة بلا undefined', () => {
    const header = resolveCompanyHeader({ previous: EMPTY_COMPANY_HEADER });
    expect(Object.values(header).every(value => typeof value === 'string')).toBe(true);
  });
});

describe('mergeCompanyHeader', () => {
  it('يطبّق تعديل المستخدم ويحفظ بقية الحقول بلا undefined', () => {
    const header = mergeCompanyHeader(
      { ...EMPTY_COMPANY_HEADER, phone: '011' },
      { phone: '022', nameAr: 'الزهراء' }
    );
    expect(header.phone).toBe('022');
    expect(header.nameAr).toBe('الزهراء');
    expect(header.address).toBe(EMPTY_COMPANY_HEADER.address);
    expect(Object.values(header).every(value => typeof value === 'string')).toBe(true);
  });
});

