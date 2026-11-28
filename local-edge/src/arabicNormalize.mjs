/**
 * Arabic & numeral normalization aligned with `src/core/utils/search.ts`.
 * Used by SQLite FTS5 indexing & fast local query matching.
 */

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeArabicDigits(input) {
  if (!input) return '';
  let out = '';
  for (const ch of String(input)) {
    const arIdx = ARABIC_DIGITS.indexOf(ch);
    if (arIdx !== -1) {
      out += String(arIdx);
      continue;
    }
    const faIdx = PERSIAN_DIGITS.indexOf(ch);
    if (faIdx !== -1) {
      out += String(faIdx);
      continue;
    }
    out += ch;
  }
  return out;
}

export function normalizeArabic(input) {
  if (!input) return '';
  return normalizeArabicDigits(String(input))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // diacritics + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Build safe FTS5 prefix query tokens from user search string. */
export function buildFtsMatchQuery(rawQuery) {
  const norm = normalizeArabic(rawQuery);
  if (!norm) return '';
  const tokens = norm
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 1);
  if (tokens.length === 0) return '';
  // Quote tokens to prevent FTS5 syntax errors on hyphens like 04465-33470
  return tokens.map(t => `"${t.replace(/"/g, '')}"*`).join(' ');
}
