/**
 * Rate-limit-aware retry (spec §5.1: limits are per endpoint; adapt
 * rather than hardcoding a number). The SDK surfaces 429s as
 * CapacitiesApiError with code cap_rate_limit_exceeded; on one of those
 * we back off exponentially with jitter and retry a few times before
 * giving up. Clock and sleep are injectable for tests.
 *
 * Every documented endpoint meters over a 60-second window, and the SDK
 * discards response headers, so `reset` is not readable. The defaults
 * are therefore sized so that even the shortest jittered run of retries
 * outlasts a full window; a budget that expires inside one surfaces as
 * silently dropped items rather than as an error.
 */

export interface BackoffOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Called once per rate-limited attempt — the pipeline's throttle signal. */
  onRateLimited?: () => void;
}

export function isRateLimitError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; status?: unknown };
  return e.code === 'cap_rate_limit_exceeded' || e.status === 429;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: BackoffOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 7;
  const base = opts.baseDelayMs ?? 1000;
  const max = opts.maxDelayMs ?? 60_000;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= maxRetries) throw err;
      opts.onRateLimited?.();
      const delay = Math.min(max, base * 2 ** attempt) * (0.5 + random() / 2);
      await sleep(delay);
    }
  }
}
