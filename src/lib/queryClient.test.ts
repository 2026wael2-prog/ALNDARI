import { describe, it, expect } from 'vitest';
import { queryClient, shouldRetryQuery } from './queryClient';

describe('shouldRetryQuery (regression guard against 4xx/5xx/timeout retry storms)', () => {
  it.each([
    400,
    401,
    403,
    404,
    406,
    408,
    422,
    429,
    500,
    502,
    503,
    504,
    'PGRST116',
    'PGRST202',
    'PGRST301',
    '22P02',
    '23514',
    '42883',
  ])(
    'does not retry deterministic or server-overload code %s',
    code => {
      expect(
        shouldRetryQuery(0, typeof code === 'number' ? { status: code, code } : { code })
      ).toBe(false);
    }
  );

  it.each([
    'JWT expired',
    'Invalid Refresh Token',
    'User not authenticated',
    'Gateway timeout',
    'Service Unavailable',
    'Connection terminated due to connection timeout',
  ])('does not retry error message "%s"', message => {
    expect(shouldRetryQuery(0, { message })).toBe(false);
  });

  it('retries transient network errors up to 3 times', () => {
    const err = { message: 'Failed to fetch' };
    expect(shouldRetryQuery(0, err)).toBe(true);
    expect(shouldRetryQuery(1, err)).toBe(true);
    expect(shouldRetryQuery(2, err)).toBe(true);
    expect(shouldRetryQuery(3, err)).toBe(false);
  });

  it('disables automatic retries on mutations to avoid duplicate writes and UI stalls', () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(0);
  });
});
