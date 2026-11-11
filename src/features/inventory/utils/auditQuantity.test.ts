import { describe, expect, it } from 'vitest';
import { parseCountedInput, toCountedQuantity } from './auditQuantity';

describe('toCountedQuantity', () => {
  it('returns null for empty/invalid payloads instead of NaN', () => {
    for (const value of [null, undefined, '', '   ', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(toCountedQuantity(value)).toBeNull();
    }
    expect(toCountedQuantity({})).toBeNull();
  });

  it('keeps valid numbers untouched (counted and zero counts)', () => {
    expect(toCountedQuantity(0)).toBe(0);
    expect(toCountedQuantity(7)).toBe(7);
    expect(toCountedQuantity('12')).toBe(12);
    expect(toCountedQuantity('0.5')).toBe(0.5);
  });

  it('does not convert a negative entry into a cleared count', () => {
    // الأرقام السالبة خطأ إدخال يُرفض في الخادم؛ تحويلها إلى null كان سيمسح الكمية.
    expect(toCountedQuantity(-3)).toBe(-3);
  });
});

describe('parseCountedInput (setValueAs)', () => {
  it('maps an empty numeric field to null — the NaN source is closed', () => {
    expect(parseCountedInput('')).toBeNull();
    expect(parseCountedInput(null)).toBeNull();
    expect(parseCountedInput(undefined)).toBeNull();
    // `Number.isNaN` تقبل `unknown`، فلا حاجة لتحويل نوعي هنا.
    expect(Number.isNaN(parseCountedInput(''))).toBe(false);
  });

  it('passes through typed values', () => {
    expect(parseCountedInput('15')).toBe(15);
    expect(parseCountedInput(15)).toBe(15);
    expect(parseCountedInput(0)).toBe(0);
  });
});
