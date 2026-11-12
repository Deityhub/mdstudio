// The real-time channel's contract, shared by the browser and the server: what a socket may ask
// for, what the server sends, and why a socket is closed. Events grow with the features that use
// them (documents for sync, comments for share pages); see docs/SYSTEM_SPEC.md, "Real-time".
import { z } from "zod";
import { ServerDocSchema } from "../sync/protocol";

/** Private-range WebSocket close codes the client reacts to. */
export const CLOSE = {
  /** Signed out, suspended or deleted: refresh the account, and reconnect only if still signed in. */
  sessionEnded: 4001,
  /** Too many sockets on this topic. */
  full: 4002,
  /** The client sent something it must not. */
  badMessage: 4003,
  /** The session this socket was opened with has run out: renew it, then reconnect. */
  expired: 4004,
} as const;

/** An event larger than this is not pushed; a small `sync` hint is sent in its place. */
export const MAX_EVENT_BYTES = 128 * 1024;

export type Topic = { kind: "user" } | { kind: "share"; id: string };

/**
 * What a socket subscribes to, from its `topic` query parameter. A user's own topic is just
 * `user` (the server knows who is asking); a share's is `share:<id>`.
 */
export function parseTopic(raw: string | null): Topic | null {
  if (raw === "user") return { kind: "user" };
  const id = raw?.match(/^share:([A-Za-z0-9_-]{1,64})$/)?.[1];
  return id ? { kind: "share", id } : null;
}

/** A tab's random name, so the server can leave it out of the events its own changes cause. */
export const isClientId = (value: string | null): value is string =>
  !!value && /^[A-Za-z0-9_-]{8,64}$/.test(value);

export const realtimeEventSchema = z.discriminatedUnion("t", [
  /** The socket is open and subscribed. */
  z.object({ t: z.literal("ready") }),
  /** Something changed: pull now. Sent when what changed is too big or too many to send. */
  z.object({ t: z.literal("sync") }),
  /** A cloud draft changed on another device: its whole state, to apply as a pull would. */
  z.object({ t: z.literal("doc"), doc: ServerDocSchema }),
  /** The account's session ended; the socket is closed right after. */
  z.object({
    t: z.literal("bye"),
    reason: z.enum(["signed_out", "suspended", "deleted", "expired"]),
  }),
]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

export function parseEvent(text: string): RealtimeEvent | null {
  try {
    const parsed = realtimeEventSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
