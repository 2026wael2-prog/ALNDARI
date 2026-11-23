import { ensureLatinDigits } from './currencyUtils';

/**
 * Normalizes Arabic/Persian numerals and math symbols into standard ASCII expression tokens.
 */
export const normalizeMathExpression = (raw: string): string => {
  let str = ensureLatinDigits(raw)
    .replace(/[،٫]/g, '.')
    .replace(/[×xX]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—]/g, '-');

  // If user typed a comma as decimal separator (e.g. "12,5" with no dot), convert it to dot
  if (str.includes(',') && !str.includes('.')) {
    str = str.replace(/,/g, '.');
  } else {
    str = str.replace(/,/g, '');
  }

  return str;
};

/**
 * Keeps only valid math expression characters while normalizing Arabic digits and operators.
 */
export const sanitizeMathInput = (raw: string): string => {
  const normalized = normalizeMathExpression(raw);
  return normalized.replace(/[^0-9.+\-*/()%=\s]/g, '');
};

/**
 * Returns true if the input contains an arithmetic operator or expression syntax
 * (excluding a plain single leading minus sign like "-5").
 */
export const hasMathOperator = (raw: string): boolean => {
  const trimmed = normalizeMathExpression(raw).trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('=')) return true;
  // Strip one optional leading unary minus/plus before checking for operators
  const body = trimmed.replace(/^[+-]/, '');
  return /[+\-*/()%]/.test(body);
};

/**
 * Rounds floating-point artifacts (e.g. 0.1 + 0.2 => 0.3).
 */
export const roundCalcResult = (value: number, maxDecimals = 4): number => {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, maxDecimals);
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
};

type Token =
  | { type: 'number'; value: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/' | '%' }
  | { type: 'lparen' }
  | { type: 'rparen' };

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i += 1;
      continue;
    }

    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let numStr = '';
      let dotCount = 0;
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
        if (expr[i] === '.') dotCount += 1;
        if (dotCount > 1) return null;
        numStr += expr[i];
        i += 1;
      }
      if (numStr === '.') return null;
      const num = parseFloat(numStr);
      if (!Number.isFinite(num)) return null;
      tokens.push({ type: 'number', value: num });
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%') {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }

    return null;
  }

  return tokens;
}

/**
 * Safe, zero-eval recursive-descent arithmetic expression evaluator.
 * Supports: +, -, *, /, %, (), decimals, unary +/-, Arabic numerals, × and ÷.
 * Returns null if the expression is empty, incomplete, invalid, or divides by zero.
 *
 * Grammar:
 *   Expr    := Term (('+' | '-') Term)*
 *   Term    := Unary (('*' | '/') Unary)*
 *   Unary   := ('+' | '-') Unary | Postfix
 *   Postfix := Primary ('%')*
 *   Primary := NUMBER | '(' Expr ')'
 */
export const evaluateMathExpression = (
  raw: string,
  options?: { maxDecimals?: number; allowNegative?: boolean }
): number | null => {
  const maxDecimals = options?.maxDecimals ?? 4;
  const allowNegative = options?.allowNegative ?? true;

  let normalized = normalizeMathExpression(raw).trim();
  if (!normalized) return null;

  // Support Excel-style leading "=" or trailing "="
  if (normalized.startsWith('=')) normalized = normalized.slice(1).trim();
  if (normalized.endsWith('=')) normalized = normalized.slice(0, -1).trim();
  if (!normalized) return null;

  const tokens = tokenize(normalized);
  if (!tokens || tokens.length === 0) return null;

  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const consume = (): Token => tokens[pos++];

  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;

    while (true) {
      const tok = peek();
      if (tok && tok.type === 'op' && (tok.value === '+' || tok.value === '-')) {
        consume();
        const right = parseTerm();
        if (right === null) return null;
        left = tok.value === '+' ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  };

  const parseTerm = (): number | null => {
    let left = parseUnary();
    if (left === null) return null;

    while (true) {
      const tok = peek();
      if (tok && tok.type === 'op' && (tok.value === '*' || tok.value === '/')) {
        consume();
        const right = parseUnary();
        if (right === null) return null;
        if (tok.value === '/') {
          if (Math.abs(right) < 1e-12) return null; // Division by zero
          left = left / right;
        } else {
          left = left * right;
        }
      } else {
        break;
      }
    }
    return left;
  };

  const parseUnary = (): number | null => {
    const tok = peek();
    if (tok && tok.type === 'op' && (tok.value === '+' || tok.value === '-')) {
      consume();
      const val = parseUnary();
      if (val === null) return null;
      return tok.value === '-' ? -val : val;
    }
    return parsePostfix();
  };

  const parsePostfix = (): number | null => {
    let val = parsePrimary();
    if (val === null) return null;
    while (true) {
      const tok = peek();
      if (tok && tok.type === 'op' && tok.value === '%') {
        consume();
        val = val / 100;
      } else {
        break;
      }
    }
    return val;
  };

  const parsePrimary = (): number | null => {
    const tok = peek();
    if (!tok) return null;

    if (tok.type === 'number') {
      consume();
      return tok.value;
    }

    if (tok.type === 'lparen') {
      consume();
      const inner = parseExpr();
      if (inner === null) return null;
      const closing = peek();
      if (!closing || closing.type !== 'rparen') return null;
      consume();
      return inner;
    }

    return null;
  };

  const result = parseExpr();
  if (result === null || pos !== tokens.length || !Number.isFinite(result)) {
    return null;
  }

  const rounded = roundCalcResult(result, maxDecimals);
  if (!allowNegative && rounded < 0) return 0;
  return rounded;
};
