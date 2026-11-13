import { describe, it, expect } from 'vitest';
import { shouldRetryQuery } from './queryClient';

describe('shouldRetryQuery (regression guard against 5xx/timeout retry storms)', () => {
  it.each([401, 403, 406, 408, 429, 500, 502, 503, 504, 'PGRST116', 'PGRST301'])(
    'does not retry deterministic or server-overload code %s',
    code => {
      expect(shouldRetryQuery(0, { status: typeof code === 'number' ? code : undefined, code })).toBe(
        false
      );
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
});
