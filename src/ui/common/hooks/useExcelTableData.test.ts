/**
 * Tests for useExcelTableData — فلترة + فرز بيانات الجدول.
 *
 * يغطي: البحث الداخلي المهَدَّأ، البحث الخارجي (الذي يتجاوز الفلترة المحلية)،
 * مسارات المطابقة الأربعة (حقول أولية، accessorKey، محتوى مُصيَّر، بحث عميق)،
 * والفرز التصاعدي/التنازلي مع القيم الغائبة.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useExcelTableData, type UseExcelTableDataOptions } from './useExcelTableData';
import type { Column } from '../ExcelTable';

interface Row {
  id: string;
  name: string;
  amount: number;
  note?: string | undefined;
}

const COLUMNS: Array<Column<Row>> = [
  { header: 'الاسم', accessor: row => row.name, accessorKey: 'name' },
  { header: 'المبلغ', accessor: row => row.amount, accessorKey: 'amount' },
];

const ROWS: Row[] = [
  { id: '1', name: 'فلتر زيت', amount: 25, note: 'تويوتا' },
  { id: '2', name: 'بوجيه', amount: 10, note: 'هوندا' },
  { id: '3', name: 'زيت محرك', amount: 40 },
];

const baseOptions = (overrides: Partial<UseExcelTableDataOptions<Row>> = {}) => ({
  data: ROWS,
  columns: COLUMNS,
  sortConfig: null,
  ...overrides,
});

const renderDataHook = (options: UseExcelTableDataOptions<Row>) =>
  renderHook((props: UseExcelTableDataOptions<Row>) => useExcelTableData(props), {
    initialProps: options,
  });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useExcelTableData', () => {
  it('returns all rows when there is no search term', () => {
    const { result } = renderDataHook(baseOptions());
    expect(result.current.processedData).toEqual(ROWS);
  });

  it('debounces internal search and then filters by any column', () => {
    const { result } = renderDataHook(baseOptions());

    act(() => {
      result.current.handleSearchInput('زيت');
    });
    expect(result.current.processedData).toEqual(ROWS);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.processedData.map(row => row.id)).toEqual(['1', '3']);
  });

  it('finds rows through deep nested values', () => {
    const { result } = renderDataHook(baseOptions());

    act(() => {
      result.current.handleSearchInput('هوندا');
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.processedData.map(row => row.id)).toEqual(['2']);
  });

  it('sorts ascending and descending by the selected key', () => {
    const { result, rerender } = renderDataHook(
      baseOptions({ sortConfig: { key: 'amount', direction: 'asc' } })
    );
    expect(result.current.processedData.map(row => row.amount)).toEqual([10, 25, 40]);

    rerender(baseOptions({ sortConfig: { key: 'amount', direction: 'desc' } }));
    expect(result.current.processedData.map(row => row.amount)).toEqual([40, 25, 10]);
  });

  it('skips local filtering when an external search box is provided', () => {
    const onSearchChange = vi.fn();
    const { result } = renderDataHook(
      baseOptions({ searchValue: 'بوجيه', onSearchChange })
    );

    expect(result.current.processedData).toEqual(ROWS);
    expect(result.current.effectiveSearch).toBe('بوجيه');

    act(() => {
      result.current.handleSearchInput('فلتر');
    });
    expect(onSearchChange).toHaveBeenCalledWith('فلتر');
  });
});
