// Calls `fn` at most once per `ms`, always delivering the latest args last.
export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number
): (...args: A) => void {
  let last = 0;
  let timer: number | undefined;
  let pending: A | undefined;

  return (...args: A) => {
    const wait = ms - (Date.now() - last);
    if (wait <= 0) {
      last = Date.now();
      fn(...args);
      return;
    }
    pending = args;
    if (timer === undefined) {
      timer = window.setTimeout(() => {
        timer = undefined;
        last = Date.now();
        if (pending) fn(...pending);
        pending = undefined;
      }, wait);
    }
  };
}

export const logError = (err: unknown) => console.error(err);
