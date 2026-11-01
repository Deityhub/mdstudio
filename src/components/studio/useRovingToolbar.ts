import { useCallback, useEffect, type KeyboardEvent, type RefObject } from "react";

/**
 * WAI-ARIA toolbar keyboard model: one tab stop, Left/Right/Home/End move between the enabled
 * buttons (wrapping). Runs after every render because the buttons change with editor state.
 */
export function useRovingToolbar(ref: RefObject<HTMLElement | null>) {
  const buttons = useCallback(
    () => [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])],
    [ref],
  );
  const setStop = useCallback(
    (stop: HTMLElement | undefined) => {
      for (const b of buttons()) b.tabIndex = b === stop ? 0 : -1;
    },
    [buttons],
  );

  useEffect(() => {
    const all = buttons();
    const current =
      all.find((b) => b === document.activeElement) ?? all.find((b) => b.tabIndex === 0) ?? all[0];
    setStop(current);
  });

  return useCallback(
    (e: KeyboardEvent) => {
      // menus render in a portal but their events still bubble through React; ignore those
      if (!(e.target instanceof Node) || !ref.current?.contains(e.target)) return;
      const all = buttons();
      const at = all.findIndex((b) => b === document.activeElement);
      if (at < 0) return;
      const next =
        e.key === "ArrowRight"
          ? (at + 1) % all.length
          : e.key === "ArrowLeft"
            ? (at - 1 + all.length) % all.length
            : e.key === "Home"
              ? 0
              : e.key === "End"
                ? all.length - 1
                : -1;
      if (next < 0) return;
      e.preventDefault();
      setStop(all[next]);
      all[next]?.focus();
    },
    [buttons, ref, setStop],
  );
}
