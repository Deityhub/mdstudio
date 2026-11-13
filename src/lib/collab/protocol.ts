// What the browser and the server agree on for live editing (see src/server/collab). No Yjs
// import here, so the app Worker can read these constants without bundling it.

/** The name of the shared text inside every room's document. */
export const TEXT_KEY = "md";

/** The first byte of a binary frame, as y-protocols frames them. */
export const MSG_SYNC = 0;
export const MSG_AWARENESS = 1;

/** Per-connection limits: one frame, how fast, and how much a room may hold. */
export const MAX_FRAME_BYTES = 256 * 1024;
export const MAX_AWARENESS_BYTES = 1024;
export const RATE_FRAMES_PER_SECOND = 30;
export const RATE_BYTES_PER_SECOND = 512 * 1024;
/** Updates that wait for earlier ones that never came may hold at most this much memory. */
export const MAX_PENDING_BYTES = 512 * 1024;
/** About 1.2 million characters of Markdown, far under a Durable Object's memory. */
export const MAX_STATE_BYTES = 3 * 1024 * 1024;

/** WebSocket close codes a room uses (standard ones, so a browser reports them as they are). */
export const ROOM_CLOSE = {
  malformed: 1007,
  policy: 1008,
  tooBig: 1009,
} as const;

/** How long updates may wait before they are written, and when the log is folded into a snapshot. */
export const FLUSH_AFTER_MS = 5000;
export const COMPACT_AFTER_UPDATES = 100;
export const COMPACT_AFTER_BYTES = 256 * 1024;

/** Colours for remote cursors, picked by a hash of the account so a person keeps theirs. */
export const CURSOR_COLORS = [
  "#2563eb",
  "#db2777",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#dc2626",
  "#65a30d",
] as const;

export function colorFor(userId: string) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return CURSOR_COLORS[h % CURSOR_COLORS.length]!;
}
