import { useEffect, useRef } from "react";

/**
 * Keeps a scrolling box showing its newest content while `active` (text is streaming in), unless the
 * reader scrolls up to look at something earlier, and resumes when they scroll back to the bottom.
 * Spread `onScroll` and `ref` on the scrolling element; `dep` is whatever changes as content arrives.
 */
export function useStickToBottom<T extends HTMLElement>(active: boolean, dep: unknown) {
  const ref = useRef<T>(null);
  const pinned = useRef(true);
  const onScroll = () => {
    const el = ref.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  useEffect(() => {
    if (active) pinned.current = true;
  }, [active]);
  useEffect(() => {
    const el = ref.current;
    if (!active || !pinned.current || !el) return;
    const frame = requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }));
    return () => cancelAnimationFrame(frame);
  }, [active, dep]);
  return { ref, onScroll };
}
