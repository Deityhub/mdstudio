import { useCallback, useEffect, useRef, useState } from "react";

const FACTOR = 3;
const MAX_WAIT = 1000;

/**
 * A value that follows `value`, but no faster than the work it causes allows. The caller says when
 * that work is done (`done()`, from a layout effect after the value was drawn); the time from the
 * value being let through to then is what one update costs, and the next waits three times that
 * (never more than a second). A burst of changes is one update with the latest value, and the work
 * never takes more than about a quarter of the processor. With cheap work it follows at once. Used
 * for the preview and checks of a draft, which are rebuilt from the whole text: when other people's
 * edits arrive many times a second in a long draft, doing that for every one of them leaves no time
 * for the page to respond. A different `resetKey` (another draft) shows the new value at once.
 */
export function useEasedValue<T>(value: T, resetKey: unknown = null): [T, () => void] {
  const [shown, setShown] = useState(value);
  const latest = useRef(value);
  latest.current = value;
  const releasedAt = useRef(-Infinity);
  const lastAt = useRef(-Infinity);
  const cost = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = useRef(resetKey);

  const release = useCallback((next: T) => {
    releasedAt.current = lastAt.current = performance.now();
    setShown(next);
  }, []);

  useEffect(() => {
    if (key.current !== resetKey) {
      key.current = resetKey;
      clearTimeout(timer.current);
      timer.current = undefined;
      release(value);
      return;
    }
    if (Object.is(value, shown) || timer.current) return;
    const wait = Math.max(
      0,
      lastAt.current + Math.min(MAX_WAIT, cost.current * FACTOR) - performance.now(),
    );
    if (wait === 0) return release(value);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      release(latest.current);
    }, wait);
  }, [value, shown, resetKey, release]);

  useEffect(() => () => clearTimeout(timer.current), []);

  /** The value that was let through has been drawn: how long that took is what the next one waits for. */
  const done = useCallback(() => {
    if (releasedAt.current === -Infinity) return;
    const took = performance.now() - releasedAt.current;
    releasedAt.current = -Infinity;
    // a slow update counts at once, a quick one only gradually, so one lucky fast frame does not open the tap
    cost.current = took > cost.current ? took : cost.current * 0.7 + took * 0.3;
  }, []);

  return [shown, done];
}
