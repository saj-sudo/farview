/**
 * Adaptive concurrency pool for object enrichment (spec §5.4). The
 * per-endpoint RateLimit header is not surfaced by the SDK's error
 * type, so adaptation works from the signal we do have: start a few
 * workers, halve the target on any rate-limited attempt, and creep
 * back up after a stretch of clean completions. Revisit if the SDK
 * ever exposes response headers.
 *
 * Concurrency alone cannot satisfy a *rate* limit: even one worker
 * with no delay issues requests as fast as round-trips allow, which is
 * far above a per-minute quota. So a rate-limited attempt also opens a
 * minimum gap between dispatches, doubling while 429s keep arriving and
 * decaying once they stop. The gap converges on whatever the endpoint's
 * real quota is without naming a number here.
 */

export interface PoolOptions {
  initialConcurrency?: number;
  maxConcurrency?: number;
  /** Clean completions required before raising concurrency by one. */
  recoveryStreak?: number;
  /** First gap opened between dispatches once throttled. */
  initialIntervalMs?: number;
  /** Ceiling on the dispatch gap, so a run cannot stall indefinitely. */
  maxIntervalMs?: number;
  signal?: AbortSignal | undefined;
  sleep?: (ms: number) => Promise<void>;
}

export interface PoolContext {
  /** Wire this into withBackoff's onRateLimited to throttle the pool. */
  onRateLimited: () => void;
}

/**
 * Run `worker` over `inputs` with bounded, adaptive concurrency.
 * Results arrive through `onResult` in completion order. A worker
 * throwing rejects the pool once in-flight work settles; an abort
 * resolves early without starting new work.
 */
export function runPool<I, O>(
  inputs: readonly I[],
  worker: (input: I, ctx: PoolContext) => Promise<O>,
  onResult: (input: I, result: O) => void,
  opts: PoolOptions = {},
): Promise<void> {
  const max = opts.maxConcurrency ?? 8;
  const recovery = opts.recoveryStreak ?? 20;
  const firstInterval = opts.initialIntervalMs ?? 1000;
  const maxInterval = opts.maxIntervalMs ?? 15_000;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  let target = Math.min(max, opts.initialConcurrency ?? 4);
  let next = 0;
  let active = 0;
  let cleanStreak = 0;
  let failure: unknown = null;
  let intervalMs = 0;
  let gated = false;

  const ctx: PoolContext = {
    onRateLimited: () => {
      target = Math.max(1, Math.floor(target / 2));
      cleanStreak = 0;
      intervalMs = Math.min(maxInterval, intervalMs === 0 ? firstInterval : intervalMs * 2);
    },
  };

  return new Promise<void>((resolve, reject) => {
    const settle = (): void => {
      if (active > 0) return;
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- propagate the worker's own rejection value unchanged
      if (failure !== null) reject(failure);
      else resolve();
    };

    const pump = (): void => {
      if (failure !== null || opts.signal?.aborted) {
        settle();
        return;
      }
      while (active < target && next < inputs.length) {
        if (gated) return; // waiting out the gap; the timer re-pumps
        const input = inputs[next]!;
        next += 1;
        active += 1;
        worker(input, ctx).then(
          (result) => {
            active -= 1;
            cleanStreak += 1;
            if (cleanStreak >= recovery) {
              if (target < max) target += 1;
              // Ease the dispatch gap back down the way it opened.
              intervalMs = intervalMs <= firstInterval ? 0 : Math.floor(intervalMs / 2);
              cleanStreak = 0;
            }
            onResult(input, result);
            pump();
          },
          (err: unknown) => {
            active -= 1;
            failure = failure ?? err;
            pump();
          },
        );
        if (intervalMs > 0) {
          gated = true;
          void sleep(intervalMs).then(() => {
            gated = false;
            pump();
          });
        }
      }
      if (next >= inputs.length) settle();
    };

    pump();
  });
}
