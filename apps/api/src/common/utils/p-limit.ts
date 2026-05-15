type Task<T> = () => PromiseLike<T> | T;

export default function pLimit(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError('Expected concurrency to be an integer greater than 0');
  }

  const queue: Array<() => void> = [];
  let activeCount = 0;

  const next = () => {
    activeCount -= 1;
    const run = queue.shift();
    if (run) run();
  };

  const run = async <T>(
    task: Task<T>,
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: unknown) => void,
  ) => {
    activeCount += 1;
    try {
      resolve(await task());
    } catch (error) {
      reject(error);
    } finally {
      next();
    }
  };

  return <T>(task: Task<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const enqueue = () => run(task, resolve, reject);
      if (activeCount < concurrency) {
        enqueue();
      } else {
        queue.push(enqueue);
      }
    });
}
