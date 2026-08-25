import { describe, expect, it } from 'vitest';
import { isRateLimitError, withBackoff } from '../../src/providers/capacities/rateLimit';

function rateLimitError(): Error {
  return Object.assign(new Error('limited'), { code: 'cap_rate_limit_exceeded' });
}

describe('isRateLimitError', () => {
  it('recognizes SDK codes and raw 429s, and nothing else', () => {
    expect(isRateLimitError(rateLimitError())).toBe(true);
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError(new Error('boom'))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError('429')).toBe(false);
  });
});

describe('withBackoff', () => {
  it('retries with growing, capped delays and reports each throttle', async () => {
    const delays: number[] = [];
    let throttles = 0;
    let calls = 0;
    const result = await withBackoff(
      () => {
        calls += 1;
        return calls < 4 ? Promise.reject(rateLimitError()) : Promise.resolve('ok');
      },
      {
        baseDelayMs: 100,
        maxDelayMs: 250,
        sleep: (ms) => {
          delays.push(ms);
          return Promise.resolve();
        },
        random: () => 1, // jitter factor becomes exactly 1
        onRateLimited: () => {
          throttles += 1;
        },
      },
    );
    expect(result).toBe('ok');
    expect(delays).toEqual([100, 200, 250]); // capped at maxDelayMs
    expect(throttles).toBe(3);
  });

  it('gives up after maxRetries and rethrows', async () => {
    let calls = 0;
    await expect(
      withBackoff(
        () => {
          calls += 1;
          return Promise.reject(rateLimitError());
        },
        { maxRetries: 2, sleep: () => Promise.resolve() },
      ),
    ).rejects.toThrow('limited');
    expect(calls).toBe(3);
  });

  it('does not retry non-rate-limit errors', async () => {
    let calls = 0;
    await expect(
      withBackoff(() => {
        calls += 1;
        return Promise.reject(new Error('boom'));
      }),
    ).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });
});
