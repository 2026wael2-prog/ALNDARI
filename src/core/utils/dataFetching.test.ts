import { describe, it, expect, vi } from 'vitest';
import {
  computePreviousDateRange,
  batchLookupParties,
  batchLookupProducts,
} from './dataFetching';

describe('dataFetching utility', () => {
  it('correctly calculates symmetrical previous date range for 7 days', () => {
    const range = computePreviousDateRange('2026-10-08', '2026-10-14');
    expect(range.endDate).toBe('2026-10-07');
    expect(range.startDate).toBe('2026-10-01');
  });

  it('correctly calculates previous single day', () => {
    const range = computePreviousDateRange('2026-11-10', '2026-11-10');
    expect(range.endDate).toBe('2026-11-09');
    expect(range.startDate).toBe('2026-11-09');
  });

  it('performs batch lookup for parties and maps them', async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              { id: 'p1', name: 'مؤسسة الأمل', phone: '0500000001' },
              { id: 'p2', name: 'شركة البركة', phone: '0500000002' },
            ],
            error: null,
          }),
        }),
      }),
    } as any;

    const result = await batchLookupParties(['p1', 'p2', 'p1', null], mockClient);
    expect(result.size).toBe(2);
    expect(result.get('p1')?.name).toBe('مؤسسة الأمل');
    expect(result.get('p2')?.phone).toBe('0500000002');
  });

  it('handles empty party IDs without making database calls', async () => {
    const mockClient = {
      from: vi.fn(),
    } as any;

    const result = await batchLookupParties([null, undefined], mockClient);
    expect(result.size).toBe(0);
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it('performs batch lookup for products and maps them', async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              { id: 'pr1', name_ar: 'فلتر زيت تويوتا', sku: 'FLT-01', brand: 'Toyota' },
            ],
            error: null,
          }),
        }),
      }),
    } as any;

    const result = await batchLookupProducts(['pr1'], mockClient);
    expect(result.size).toBe(1);
    expect(result.get('pr1')?.name_ar).toBe('فلتر زيت تويوتا');
    expect(result.get('pr1')?.brand).toBe('Toyota');
  });
});

