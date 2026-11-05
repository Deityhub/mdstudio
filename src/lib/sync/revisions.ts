// Browser side of the server's version history for a cloud draft.
import type { Revision } from "../storage/history";
import { remoteId } from "./protocol";

export type CloudRevision = {
  id: string;
  version: number;
  title: string;
  reason: string;
  size: number;
  createdAt: number;
};

const path = (userId: string, docId: string) =>
  `/api/documents/${encodeURIComponent(remoteId(userId, docId))}/revisions`;

/** The versions the cloud keeps for a draft, newest first, and how many it keeps at most. */
export async function listCloudRevisions(
  userId: string,
  docId: string,
): Promise<{ revisions: CloudRevision[]; max: number } | null> {
  try {
    const res = await fetch(path(userId, docId));
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** One version with its text, in the shape the History panel already compares and restores. */
export async function fetchCloudRevision(
  userId: string,
  docId: string,
  revision: CloudRevision,
): Promise<Revision | null> {
  try {
    const res = await fetch(`${path(userId, docId)}/${encodeURIComponent(revision.id)}`);
    if (!res.ok) return null;
    const { revision: r } = (await res.json()) as {
      revision: { id: string; title: string; content: string; createdAt: number };
    };
    return { id: r.id, docId, at: r.createdAt, title: r.title, content: r.content, kind: "cloud" };
  } catch {
    return null;
  }
}
