import { describe, expect, it } from 'vitest';
import { runPool, type PoolContext } from '../../src/pipeline/pool';

function deferredWorkers(_count: number) {
  const resolvers: (() => void)[] = [];
  const contexts: PoolContext[] = [];
  let active = 0;
  let peak = 0;
  const worker = (input: number, ctx: PoolContext): Promise<number> => {
    contexts[input] = ctx;
    active += 1;
    peak = Math.max(peak, active);
    return new Promise((resolve) => {
      resolvers[input] = () => {
        active -= 1;
        resolve(input);
      };
    });
  };
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  return {
    worker,
    resolve: async (i: number) => {
      resolvers[i]!();
      await tick();
    },
    ctx: (i: number) => contexts[i]!,
    startedCount: () => resolvers.filter(Boolean).length,
    peak: () => peak,
    tick,
  };
}

describe('runPool', () => {
  it('never exceeds the concurrency target', async () => {
    const w = deferredWorkers(10);
    const results: number[] = [];
    const done = runPool(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      w.worker,
      (_, r) => results.push(r),
      { initialConcurrency: 3 },
    );
    await w.tick();
    expect(w.startedCount()).toBe(3);
    for (let i = 0; i < 10; i += 1) await w.resolve(i);
    await done;
    expect(w.peak()).toBe(3);
    expect(results).toHaveLength(10);
  });

  it('halves the target on a rate-limit signal', async () => {
    const w = deferredWorkers(10);
    const done = runPool([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], w.worker, () => {}, {
      initialConcurrency: 4,
      // Isolate the concurrency target: dispatch pacing has its own tests.
      initialIntervalMs: 0,
    });
    await w.tick();
    expect(w.startedCount()).toBe(4);
    // A throttled attempt drops the target to 2: finishing two workers
    // leaves 2 active, so nothing new starts…
    w.ctx(0).onRateLimited();
    await w.resolve(0);
    await w.resolve(1);
    expect(w.startedCount()).toBe(4);
    // …until the active count dips below the halved target.
    await w.resolve(2);
    expect(w.startedCount()).toBe(5);
    for (let i = 3; i < 10; i += 1) await w.resolve(i);
    await done;
  });

  it('creeps back up after a clean streak', async () => {
    const w = deferredWorkers(12);
    const done = runPool(
      Array.from({ length: 12 }, (_, i) => i),
      w.worker,
      () => {},
      { initialConcurrency: 2, maxConcurrency: 4, recoveryStreak: 2 },
    );
    await w.tick();
    expect(w.startedCount()).toBe(2);
    // Two clean completions raise the target to 3.
    await w.resolve(0);
    await w.resolve(1);
    expect(w.startedCount()).toBe(5); // 2 replacements + 1 extra slot
    for (let i = 2; i < 12; i += 1) await w.resolve(i);
    await done;
    expect(w.peak()).toBeLessThanOrEqual(4);
  });

  it('stops starting work when aborted, then resolves', async () => {
    const w = deferredWorkers(10);
    const controller = new AbortController();
    const done = runPool(
      Array.from({ length: 10 }, (_, i) => i),
      w.worker,
      () => {},
      { initialConcurrency: 2, signal: controller.signal },
    );
    await w.tick();
    controller.abort();
    await w.resolve(0);
    await w.resolve(1);
    await done;
    expect(w.startedCount()).toBe(2); // nothing new after the abort
  });

  it('rejects once in-flight work settles when a worker throws', async () => {
    const results: number[] = [];
    await expect(
      runPool(
        [1, 2, 3, 4],
        (n) => (n === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(n)),
        (_, r) => results.push(r),
        { initialConcurrency: 2 },
      ),
    ).rejects.toThrow('boom');
  });

  it('handles an empty input list', async () => {
    await expect(
      runPool([], () => Promise.resolve(1), () => {}),
    ).resolves.toBeUndefined();
  });
});

describe('dispatch pacing', () => {
  const paced = async (throttleFirst: boolean) => {
    let clock = 0;
    const sleeps: number[] = [];
    const starts: number[] = [];
    let fired = false;

    await runPool(
      [1, 2, 3, 4],
      (n, ctx) => {
        starts.push(clock);
        if (throttleFirst && !fired) {
          fired = true;
          ctx.onRateLimited();
        }
        return Promise.resolve(n);
      },
      () => {},
      {
        initialConcurrency: 1,
        maxConcurrency: 1,
        initialIntervalMs: 1000,
        sleep: (ms) => {
          sleeps.push(ms);
          clock += ms;
          return Promise.resolve();
        },
      },
    );
    return { sleeps, starts };
  };

  it('spaces dispatches once an attempt is rate limited', async () => {
    const { sleeps, starts } = await paced(true);
    expect(sleeps.length).toBeGreaterThan(0);
    // Concurrency alone cannot satisfy a per-minute quota; the gap can.
    expect(starts[2]! - starts[1]!).toBe(1000);
    expect(starts[3]! - starts[2]!).toBe(1000);
  });

  it('does not pace dispatches when nothing is rate limited', async () => {
    const { sleeps, starts } = await paced(false);
    expect(sleeps).toEqual([]);
    expect(starts).toEqual([0, 0, 0, 0]);
  });
});
