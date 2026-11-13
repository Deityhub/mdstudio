// The wire contract of /api/sync/*, shared by the server (src/server/sync) and the browser engine.
import { z } from "zod";

/** What a draft id from the browser may look like before it is made into one of the caller's own. */
export const LOCAL_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_PUSH_DOCS = 50;
export const MAX_CONTENT = 1_000_000;

export const PushItemSchema = z.object({
  id: z.string().min(1).max(100),
  /** The server version this edit was made on; 0 for a draft the server has never seen. */
  baseVersion: z.number().int().min(0),
  title: z.string().max(500),
  name: z.string().max(500).nullish(),
  folder: z.string().max(500).nullish(),
  content: z.string().max(MAX_CONTENT),
  createdAt: z.number().int().min(0),
  /** When the text was last edited on the device, in its clock. The later edit wins a conflict. */
  editedAt: z.number().int().min(0),
  deleted: z.boolean().optional(),
});
export type PushItem = z.infer<typeof PushItemSchema>;

/** A draft as the server keeps it: what a pull returns and the real-time channel carries to other devices. */
export const ServerDocSchema = z.object({
  id: z.string().min(1).max(100),
  version: z.number().int().min(1),
  title: z.string().max(500),
  name: z.string().max(500).nullable(),
  folder: z.string().max(500).nullable(),
  content: z.string().max(MAX_CONTENT),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0),
  /** The edit time the server kept (see PushItem.editedAt). */
  editedAt: z.number().int().min(0),
  deleted: z.boolean(),
  /** Being edited live with other people: its text is the room's, and a device must not push or apply text. */
  collab: z.boolean().optional(),
});
export type ServerDoc = z.infer<typeof ServerDocSchema>;

export type PushResult =
  | { id: string; status: "ok"; version: number; updatedAt: number }
  | { id: string; status: "conflict"; server: ServerDoc }
  /** The draft is edited live: its text is not taken from a device. */
  | { id: string; status: "collab"; server: ServerDoc }
  | { id: string; status: "limit_reached"; limit: number }
  | { id: string; status: "rejected" };

/** `limit` is how many drafts one account may keep in the cloud. */
export type PullPage = { docs: ServerDoc[]; cursor: number; hasMore: boolean; limit?: number };

/** Cloud drafts per account unless the server sets MAX_CLOUD_DOCS. */
export const DEFAULT_CLOUD_LIMIT = 5;

/**
 * Browser drafts have short ids that two people can pick by chance, while the server keeps one
 * namespace. Every id is therefore sent as `<userId>:<id>`, and the server only accepts ids that
 * start with the signed-in user's own prefix.
 */
export const remoteId = (userId: string, id: string) => `${userId}:${id}`;
export const localId = (userId: string, remote: string) =>
  remote.startsWith(`${userId}:`) ? remote.slice(userId.length + 1) : null;

/** The text the sync hash covers; the same on both sides so equal drafts compare equal. */
export async function fieldsHash(f: {
  title: string;
  name?: string | null | undefined;
  folder?: string | null | undefined;
  content: string;
}) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([f.title, f.name ?? null, f.folder ?? null, f.content]),
    ),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
