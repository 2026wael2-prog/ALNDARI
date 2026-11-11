import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { normalizeSearch } from '../../../core/utils';
import type { Column } from '../ExcelTable';

export interface TableSortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface UseExcelTableDataOptions<T> {
  data: T[];
  columns: Array<Column<T>>;
  /** قيمة صندوق البحث الخارجي («الرئيسي») إن وُجد. */
  searchValue?: string | undefined;
  /** عند تمريرها يُلغى البحث المحلي وتُدار القيمة من الخارج. */
  onSearchChange?: ((value: string) => void) | undefined;
  sortConfig: TableSortConfig | null;
  /** زمن تهدئة البحث الداخلي بالمللي ثانية (افتراضياً 150). */
  searchDebounceMs?: number | undefined;
}

export interface UseExcelTableDataReturn<T> {
  /** القيمة المعروضة في صندوق البحث. */
  effectiveSearch: string;
  /** موجّه تغيير صندوق البحث (داخلي أو خارجي حسب الإعداد). */
  handleSearchInput: (value: string) => void;
  /** نص البحث الفعلي المستخدم في الفلترة (بعد التهدئة/التأجيل). */
  searchTerm: string;
  /** البيانات بعد الفلترة والفرز. */
  processedData: T[];
}

const isSearchableText = (v: unknown): v is string | number =>
  typeof v === 'string' || typeof v === 'number';

/** هل القيمة عنصر React أو كائن وعد؟ (يُستثنى من البحث العميق). */
const isOpaqueRuntimeValue = (val: unknown): boolean => {
  if (val === null || typeof val !== 'object') return false;
  const rec = val as { $$typeof?: unknown; then?: unknown };
  return rec.$$typeof !== undefined || typeof rec.then === 'function';
};

/** يستخرج نصاً قابلاً للبحث من أي عنصر React أو قيمة أولية. */
function getStringContent(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (isSearchableText(val) || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.map(getStringContent).join(' ');
  if (typeof val !== 'object' || isOpaqueRuntimeValue(val)) return '';

  const children = (val as { props?: { children?: unknown } }).props?.children;
  if (children !== undefined) return getStringContent(children);

  return joinObjectValues(val);
}

/** يبني نصاً من قيم كائن مجهول (يُستثنى الكائنات الحيّة كعناصر React). */
function joinObjectValues(obj: object): string {
  try {
    return Object.values(obj as Record<string, unknown>).map(getStringContent).join(' ');
  } catch {
    return '';
  }
}

/** بحث عميق متكرّر في القيم المتداخلة (احتياط أخير بعد المسارات الأسرع). */
function deepSearchValue(val: unknown, term: string): boolean {
  if (val === null || val === undefined) return false;
  if (isSearchableText(val) || typeof val === 'boolean') {
    return normalizeSearch(String(val)).includes(term);
  }
  if (isOpaqueRuntimeValue(val)) return false;
  if (typeof val !== 'object') return false;
  try {
    return Object.values(val as Record<string, unknown>).some(inner =>
      deepSearchValue(inner, term)
    );
  } catch {
    return false;
  }
}

/** مسار سريع 1: الحقول الأولية المباشرة للعنصر. */
const matchesPrimitiveField = (item: unknown, term: string): boolean => {
  if (item === null || typeof item !== 'object') return false;
  const rec = item as Record<string, unknown>;
  return Object.keys(rec).some(key => {
    // eslint-disable-next-line security/detect-object-injection -- مفتاح من مفاتيح العنصر نفسه
    const value = rec[key];
    return isSearchableText(value) && normalizeSearch(String(value)).includes(term);
  });
};

/** مسار سريع 2: الحقول المعلنة في `accessorKey` للأعمدة. */
const matchesAccessorKey = <T>(item: unknown, columns: Array<Column<T>>, term: string): boolean => {
  if (item === null || typeof item !== 'object') return false;
  const rec = item as Record<string, unknown>;
  return columns.some(col => {
    const key = col.accessorKey;
    if (key === undefined) return false;
    const value = rec[String(key)];
    return isSearchableText(value) && normalizeSearch(String(value)).includes(term);
  });
};

/** مسار 3: تقييم accessor العمود (يلتقط الشارات والعناصر المخصّصة). */
const matchesRenderedContent = <T>(
  item: T,
  columns: Array<Column<T>>,
  term: string
): boolean =>
  columns.some(col => {
    try {
      const content = getStringContent(col.accessor(item));
      return content !== '' && normalizeSearch(content).includes(term);
    } catch {
      return false;
    }
  });

const matchesSearchTerm = <T>(item: T, columns: Array<Column<T>>, term: string): boolean =>
  matchesPrimitiveField(item, term) ||
  matchesAccessorKey(item, columns, term) ||
  matchesRenderedContent(item, columns, term) ||
  deepSearchValue(item, term);

const getNestedValue = (obj: unknown, path: string): unknown => {
  if (obj === null || obj === undefined || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  if (path in rec) {
    // eslint-disable-next-line security/detect-object-injection -- المسار مشتق من sortKey المعلن في تعريف العمود
    return rec[path];
  }
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc === null || typeof acc !== 'object') return undefined;
    return getNestedValue(acc, part);
  }, obj);
};

const toComparableText = (val: unknown): string => {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val instanceof Date) return val.toISOString();
  return '';
};

const comparePresentValues = (aVal: unknown, bVal: unknown): number => {
  if (typeof aVal === 'string' && typeof bVal === 'string') {
    return aVal.localeCompare(bVal, 'ar', { numeric: true, sensitivity: 'base' });
  }
  if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal;
  return toComparableText(aVal) > toComparableText(bVal) ? 1 : -1;
};

/** الفرز: القيم الغائبة أولاً في التصاعدي وآخراً في التنازلي (سلوك الجدول الأصلي). */
const compareValues = (aVal: unknown, bVal: unknown, direction: 'asc' | 'desc'): number => {
  if (aVal === null || aVal === undefined) return direction === 'asc' ? -1 : 1;
  if (bVal === null || bVal === undefined) return direction === 'asc' ? -1 : 1;
  const base = comparePresentValues(aVal, bVal);
  return direction === 'asc' ? base : -base;
};

/**
 * يؤجّل قيمة نصية بعد مدة تهدئة (صندوق البحث الداخلي).
 * `enabled=false` يعني أن التهدئة معطّلة (بحث خارجي).
 */
const useDebouncedValue = (value: string, delayMs: number, enabled: boolean): string => {
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return (): void => {
      clearTimeout(timer);
    };
  }, [value, delayMs, enabled]);
  return debounced;
};

/**
 * فلترة + فرز بيانات الجدول.
 *
 * سبب وجود الملف: كانت الفلترة والفرز داخل `ExcelTable` في كتلة واحدة (~140
 * سطراً) تحتوي دالّتين متكرّرتين تُعادان إنشاؤهما في كل استدعاء (أي عند كل حرف
 * يُكتب). هنا صار المنطق معزولاً وقابلاً للاختبار، وانتقلت دوال المطابقة إلى
 * نطاق الوحدة فلم تُعدَّ بناؤها في كل ضغطة مفتاح.
 */
export const useExcelTableData = <T>({
  data,
  columns,
  searchValue,
  onSearchChange,
  sortConfig,
  searchDebounceMs = 150,
}: UseExcelTableDataOptions<T>): UseExcelTableDataReturn<T> => {
  const isMainSearch = onSearchChange !== undefined;
  const [internalSearch, setInternalSearch] = useState('');
  const debouncedSearch = useDebouncedValue(internalSearch, searchDebounceMs, !isMainSearch);

  const effectiveSearch = isMainSearch ? (searchValue ?? '') : internalSearch;

  const handleSearchInput = useCallback(
    (value: string): void => {
      if (onSearchChange !== undefined) {
        onSearchChange(value);
        return;
      }
      setInternalSearch(value);
    },
    [onSearchChange]
  );

  // صندوق البحث الخارجي كان يغذّي الفلترة بقيمته الخام، فكل ضغطة مفتاح تحجب
  // الخيط الرئيسي على كامل البيانات؛ `useDeferredValue` يُبقي الكتابة سريعة.
  const deferredMainSearch = useDeferredValue(searchValue ?? '');
  const searchTerm = isMainSearch ? deferredMainSearch : debouncedSearch;
  const searchTermForFilter = isMainSearch ? '' : searchTerm;

  const filteredItems = useMemo(() => {
    const term = normalizeSearch(searchTermForFilter);
    if (!term) return data;
    return data.filter(item => matchesSearchTerm(item, columns, term));
  }, [data, searchTermForFilter, columns]);

  /**
   * الفرز في `useMemo` مستقل: كانت ضغطة مفتاح تُعيد الفرز كاملاً، وضغطة الفرز
   * تُعيد الفلترة كاملاً. الآن كل مسار له ذاكرة تبعية خاصة به.
   */
  const processedData = useMemo(() => {
    if (sortConfig === null) return filteredItems;
    const { key, direction } = sortConfig;
    return [...filteredItems].sort((a, b) =>
      compareValues(getNestedValue(a, key), getNestedValue(b, key), direction)
    );
  }, [filteredItems, sortConfig]);

  return { effectiveSearch, handleSearchInput, searchTerm, processedData };
};
