type Task<T> = () => Promise<T>;

export type RetryOptions = {
  maxAttempts?: number; // default 3
  delayMs?: number;     // base delay, doubles each attempt (exponential backoff)
};

async function withRetry<T>(task: Task<T>, opts: RetryOptions): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const delayMs = opts.delayMs ?? 500;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await task();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs * 2 ** (attempt - 1)));
      }
    }
  }

  throw lastError;
}

class ConcurrentQueue {
  private running = 0;
  private readonly pending: Array<() => void> = [];

  constructor(
    readonly maxConcurrent: number,
    private readonly retry: RetryOptions = {},
  ) {}

  add<T>(task: Task<T>, retryOverride?: RetryOptions): Promise<T> {
    const opts = retryOverride ?? this.retry;
    return new Promise((resolve, reject) => {
      const run = () => {
        this.running++;
        withRetry(task, opts)
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            if (this.pending.length > 0) this.pending.shift()!();
          });
      };
      if (this.running < this.maxConcurrent) run();
      else this.pending.push(run);
    });
  }
}

export const jobQueue = new ConcurrentQueue(10, { maxAttempts: 3, delayMs: 500 });
