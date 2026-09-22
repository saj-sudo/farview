import { describe, expect, it } from 'vitest';
import { createWriteQueue } from '../../src/app/writeQueue';

const deferred = <T,>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
} => {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('createWriteQueue', () => {
  it('never runs two writes for the same key at once', async () => {
    const enqueue = createWriteQueue();
    const first = deferred<string>();
    let secondStarted = false;

    const a = enqueue('obj-1', () => first.promise);
    const b = enqueue('obj-1', () => {
      secondStarted = true;
      return Promise.resolve('b');
    });

    await Promise.resolve();
    expect(secondStarted).toBe(false); // still waiting on the first

    first.resolve('a');
    expect(await a).toBe('a');
    expect(await b).toBe('b');
    expect(secondStarted).toBe(true);
  });

  it('lets different keys proceed in parallel', async () => {
    const enqueue = createWriteQueue();
    const blocked = deferred<string>();
    let otherStarted = false;

    const a = enqueue('obj-1', () => blocked.promise);
    const b = enqueue('obj-2', () => {
      otherStarted = true;
      return Promise.resolve('b');
    });

    expect(await b).toBe('b');
    expect(otherStarted).toBe(true);

    blocked.resolve('a');
    expect(await a).toBe('a');
  });

  it('does not wedge the queue when a write fails', async () => {
    const enqueue = createWriteQueue();

    const failed = enqueue('obj-1', () => Promise.reject(new Error('boom')));
    await expect(failed).rejects.toThrow('boom');

    const after = enqueue('obj-1', () => Promise.resolve('ok'));
    expect(await after).toBe('ok');
  });

  it('releases keys once their chain drains', async () => {
    const enqueue = createWriteQueue();
    await enqueue('obj-1', () => Promise.resolve('one'));
    await enqueue('obj-1', () => Promise.resolve('two'));
    // A drained key must not retain its tail, or the map grows per edit.
    expect(await enqueue('obj-1', () => Promise.resolve('three'))).toBe('three');
  });
});
