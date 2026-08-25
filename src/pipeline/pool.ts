/**
 * Adaptive concurrency pool for object enrichment (spec §5.4). The
 * per-endpoint RateLimit header is not surfaced by the SDK's error
 * type, so adaptation works from the signal we do have: start a few
 * workers, halve the target on any rate-limited attempt, and creep
 * back up after a stretch of clean completions. Revisit if the SDK
 * ever exposes response headers.
 */

export interface PoolOptions {
  initialConcurrency?: number;
  maxConcurrency?: number;
  /** Clean completions required before raising concurrency by one. */
  recoveryStreak?: number;
  signal?: AbortSignal | undefined;
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
  let target = Math.min(max, opts.initialConcurrency ?? 4);
  let next = 0;
  let active = 0;
  let cleanStreak = 0;
  let failure: unknown = null;

  const ctx: PoolContext = {
    onRateLimited: () => {
      target = Math.max(1, Math.floor(target / 2));
      cleanStreak = 0;
    },
  };

  return new Promise<void>((resolve, reject) => {
    const settle = (): void => {
      if (active > 0) return;
      if (failure !== null) reject(failure);
      else resolve();
    };

    const pump = (): void => {
      if (failure !== null || opts.signal?.aborted) {
        settle();
        return;
      }
      while (active < target && next < inputs.length) {
        const input = inputs[next]!;
        next += 1;
        active += 1;
        worker(input, ctx).then(
          (result) => {
            active -= 1;
            cleanStreak += 1;
            if (cleanStreak >= recovery && target < max) {
              target += 1;
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
      }
      if (next >= inputs.length) settle();
    };

    pump();
  });
}
