import { describe, expect, it } from 'vitest';
import {
  evaluateMathExpression,
  hasMathOperator,
  sanitizeMathInput,
} from './mathExpression';

describe('mathExpression', () => {
  it('evaluates basic arithmetic with standard operator precedence', () => {
    expect(evaluateMathExpression('500+250')).toBe(750);
    expect(evaluateMathExpression('1000-350')).toBe(650);
    expect(evaluateMathExpression('250*4')).toBe(1000);
    expect(evaluateMathExpression('43000/430')).toBe(100);
    expect(evaluateMathExpression('100+50*2')).toBe(200);
    expect(evaluateMathExpression('(100+50)*2')).toBe(300);
    expect(evaluateMathExpression('((500+100)/3)*2')).toBe(400);
  });

  it('handles Arabic numerals and Unicode operators (×, ÷, −)', () => {
    expect(evaluateMathExpression('٥٠٠×٣')).toBe(1500);
    expect(evaluateMathExpression('١٠٠٠÷٤')).toBe(250);
    expect(evaluateMathExpression('١٢٠٠+٣٥٠')).toBe(1550);
    expect(evaluateMathExpression('=200*5')).toBe(1000);
    expect(evaluateMathExpression('12٫5*2')).toBe(25);
  });

  it('handles decimals, floating point precision, and percentage', () => {
    expect(evaluateMathExpression('0.1+0.2')).toBe(0.3);
    expect(evaluateMathExpression('1000*15%')).toBe(150);
    expect(evaluateMathExpression('10/3', { maxDecimals: 2 })).toBe(3.33);
  });

  it('rejects division by zero and incomplete expressions cleanly', () => {
    expect(evaluateMathExpression('100/0')).toBeNull();
    expect(evaluateMathExpression('500+')).toBeNull();
    expect(evaluateMathExpression('(100+50')).toBeNull();
    expect(evaluateMathExpression('')).toBeNull();
  });

  it('clamps negative results to 0 when allowNegative is false', () => {
    expect(evaluateMathExpression('100-250', { allowNegative: false })).toBe(0);
    expect(evaluateMathExpression('100-250', { allowNegative: true })).toBe(-150);
  });

  it('detects math operators accurately', () => {
    expect(hasMathOperator('500')).toBe(false);
    expect(hasMathOperator('-500')).toBe(false);
    expect(hasMathOperator('500+100')).toBe(true);
    expect(hasMathOperator('500*3')).toBe(true);
    expect(hasMathOperator('=500')).toBe(true);
  });

  it('sanitizes input while preserving math characters', () => {
    expect(sanitizeMathInput('٥٠٠ × ٣ + abc')).toBe('500 * 3 + ');
  });
});
