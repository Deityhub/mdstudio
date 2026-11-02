export const LIBRARY_WIDTH = { min: 240, default: 288, max: 480 } as const;

/** A usable library width from whatever was stored or dragged: whole pixels inside the limits. */
export function clampLibraryWidth(value: unknown): number {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return LIBRARY_WIDTH.default;
  return Math.min(LIBRARY_WIDTH.max, Math.max(LIBRARY_WIDTH.min, Math.round(n)));
}

/** The Checks panel starts open from this viewport width (Tailwind 2xl) and closed below it. */
export const CHECKS_OPEN_MIN_WIDTH = 1536;
