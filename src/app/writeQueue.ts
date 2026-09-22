/**
 * The API is last-write-wins with no ETags and no conditional requests,
 * so two mutations of the same object must never be in flight together:
 * the response that lands second can carry the older state. Writes are
 * chained per object id; unrelated objects still proceed in parallel.
 */

export type WriteQueue = <T>(key: string, task: () => Promise<T>) => Promise<T>;

export function createWriteQueue(): WriteQueue {
  const tails = new Map<string, Promise<unknown>>();

  return <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve();
    // Run whether or not the previous write succeeded: a failed edit is
    // reverted by its caller and must not wedge the object's queue.
    const run = previous.then(task, task);
    const tail = run.catch(() => undefined);
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return run;
  };
}
