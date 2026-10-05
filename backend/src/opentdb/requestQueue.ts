function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * OpenTDB allows 1 request per 5s per IP. All calls go through this queue so
 * concurrent round/category fetches never exceed that, regardless of how many
 * players/rounds trigger requests around the same time.
 */
export class OpenTdbQueue {
  private lastRequestAt = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly minSpacingMs = 5200;

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = Math.max(0, this.lastRequestAt + this.minSpacingMs - Date.now());
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();
      return fn();
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}

export const openTdbQueue = new OpenTdbQueue();
export { sleep };
