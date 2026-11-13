// The real-time socket's door: GET /api/realtime?topic=user|share:<slug>&client=<tab id>, as a
// WebSocket upgrade. Everything is decided here, once, when the socket opens: who is asking, whether
// they may listen to that topic, and whether they are asking too often. After that the socket can
// only receive. On Workers the open socket then lives in a Durable Object (infra/realtime), on Node in
// the process's own hub. See docs/SYSTEM_SPEC.md, "Real-time".
import { eq } from "drizzle-orm";
import { documents } from "../../../infra/db/schema";
import { CLOSE, isClientId, parseTopic } from "@/lib/realtime/protocol";
import { hit } from "../auth/limits";
import { readToken, sameOrigin } from "../auth/http";
import { userForToken } from "../auth/service";
import { type Db, getDb } from "../db";
import { getBinding, onWorkers } from "../env";
import { limitsFor } from "../limits/request";
import { getMailer } from "../mail";
import { getSettings } from "../settings/service";
import { roomName, workersHost } from "../collab/host";
import { docAccess } from "../collab/service";
import { viewShare } from "../share/service";
import { nodeHub } from "./hub";
import { incoming } from "./rules";

const HOUR = 60 * 60 * 1000;
/** Sockets one account may open an hour: a few tabs, and reconnects after a dropped network. */
const UPGRADES_PER_HOUR = 120;

/** What the room of a draft needs to know about the person who opened it. */
export type DocConnection = {
  docId: string;
  ownerId: string;
  isOwner: boolean;
  canWrite: boolean;
  name: string;
  avatar: string | null;
  /** People the owner's limits allow in this draft, which bounds the room. */
  people: number;
};
export type UpgradeAuth =
  | {
      ok: true;
      topic: string;
      userId: string;
      clientId: string;
      expiresAt: number;
      doc?: DocConnection;
    }
  | { ok: false; status: number; error: string };

/** A room connection lives this long at most, so ending someone's access takes effect within minutes. */
const DOC_SOCKET_MS = 15 * 60_000;

const refuse = (status: number, error: string) => ({ ok: false, status, error }) as const;

export async function authorizeUpgrade(
  request: Request,
  deps: {
    db: Db;
    mailEnabled: boolean;
    now?: number;
    upgradeLimit?: number;
    /** The server-wide kill switch for live editing (open unless said otherwise). */
    collabOpen?: boolean | (() => Promise<boolean>);
    /** The limits of a draft's owner that decide whether and how big a room may be. */
    ownerLimits?: (ownerId: string) => Promise<{ collab_enabled: boolean; collab_people: number }>;
  },
): Promise<UpgradeAuth> {
  const { db, now = Date.now() } = deps;
  // a page on another site must not borrow the visitor's cookie to listen in
  if (!sameOrigin(request)) return refuse(403, "forbidden");
  const token = readToken(request);
  const session = token ? await userForToken(db, token, now) : null;
  if (!session) return refuse(401, "unauthorized");
  const { user } = session;
  // the same rule as the cloud itself: a confirmed address, where mail can confirm one
  if (!user.emailVerified && deps.mailEnabled) return refuse(403, "email_unverified");

  const params = new URL(request.url).searchParams;
  const topic = parseTopic(params.get("topic"));
  const clientId = params.get("client");
  if (!topic || !isClientId(clientId)) return refuse(400, "bad_request");

  const rate = await hit(db, `rt:${user.id}`, deps.upgradeLimit ?? UPGRADES_PER_HOUR, HOUR, now);
  if (!rate.allowed) return refuse(429, "too_many_requests");

  let key = `user:${user.id}`;
  if (topic.kind === "share") {
    // the same rules as reading the link: a private one is for its owner and invited people only
    const viewed = await viewShare(db, topic.id, user, now);
    if (viewed.status !== "ok") return refuse(404, "not_found");
    key = `share:${topic.id}`; // the link's address, which everyone who may listen knows
  }
  if (topic.kind === "doc") {
    const open = typeof deps.collabOpen === "function" ? await deps.collabOpen() : deps.collabOpen;
    if (open === false) return refuse(503, "collab_closed");
    const access = await docAccess(db, user, topic.ownerId, topic.id);
    if (!access.ok) return refuse(404, "not_found");
    const limits = (await deps.ownerLimits?.(topic.ownerId)) ?? {
      collab_enabled: true,
      collab_people: 3,
    };
    if (!limits.collab_enabled) return refuse(404, "not_found");
    return {
      ok: true,
      topic: `doc:${access.docId}`,
      userId: user.id,
      clientId,
      expiresAt: Math.min(session.expiresAt, now + DOC_SOCKET_MS),
      doc: {
        docId: access.docId,
        ownerId: access.ownerId,
        isOwner: access.isOwner,
        canWrite: true,
        name: user.displayName?.trim() || user.email.split("@")[0] || "Someone",
        avatar: user.avatarUrl ?? null,
        people: limits.collab_people,
      },
    };
  }
  return { ok: true, topic: key, userId: user.id, clientId, expiresAt: session.expiresAt };
}

type Hooks = Record<string, (...args: never[]) => unknown>;
/** nitro reads WebSocket hooks off the response (and ignores its status), so a Node answer is hooks. */
const nodeResponse = (hooks: Hooks) => Object.assign(new Response(null), { crossws: hooks });

/** What the room of a draft is seeded with when it was never set up: the draft's text as the server has it. */
const draftText = async (db: Db, docId: string) =>
  (
    await db.select({ content: documents.content }).from(documents).where(eq(documents.id, docId))
  )[0]?.content ?? "";

/** A connection to a draft's room: a Durable Object on Workers, this process on Node. */
async function docSocket(
  request: Request,
  db: Db,
  doc: DocConnection,
  auth: Extract<UpgradeAuth, { ok: true }>,
  rooms:
    | { idFromName: (name: string) => unknown; get: (id: unknown) => { fetch: typeof fetch } }
    | undefined,
  workers: boolean,
  no: (status: number, error: string) => Response,
): Promise<Response> {
  if (workers) {
    if (!rooms) return no(404, "not_found");
    // who is asking, in headers the room trusts (it is reachable only through this binding)
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    headers.set("x-rt-topic", auth.topic);
    headers.set("x-rt-user", auth.userId);
    headers.set("x-rt-client", auth.clientId);
    headers.set("x-rt-expires", String(auth.expiresAt));
    headers.set("x-rt-name", encodeURIComponent(doc.name));
    headers.set("x-rt-avatar", encodeURIComponent(doc.avatar ?? ""));
    headers.set("x-rt-write", doc.canWrite ? "1" : "0");
    headers.set("x-rt-people", String(doc.people));
    const stub = rooms.get(rooms.idFromName(roomName(doc.docId)));
    let response = await stub.fetch(new Request(request, { headers }));
    if (response.status === 409) {
      // the room was never set up: start it from the draft's text, once, and try again
      await workersHost(rooms as Parameters<typeof workersHost>[0]).seed(
        doc.docId,
        await draftText(db, doc.docId),
      );
      response = await stub.fetch(new Request(request, { headers }));
    }
    return response;
  }
  const host = (await import("@/server/node-collab")).nodeCollab(db);
  await host.ensureSeeded(doc.docId, () => draftText(db, doc.docId));
  return nodeResponse(
    host.hooks({
      docId: doc.docId,
      userId: auth.userId,
      clientId: auth.clientId,
      name: doc.name,
      avatar: doc.avatar,
      canWrite: doc.canWrite,
      people: doc.people,
      expiresAt: auth.expiresAt,
    }) as unknown as Hooks,
  );
}

export async function realtimeHandler(request: Request): Promise<Response> {
  const workers = onWorkers(request);
  const no = (status: number, error: string) => {
    const response = Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
    // on Node the refusal has to be said from the upgrade hook
    return workers ? response : nodeResponse({ upgrade: () => response });
  };

  type Namespace = {
    idFromName: (name: string) => unknown;
    get: (id: unknown) => { fetch: typeof fetch };
  };
  const binding = getBinding(request, "REALTIME") as Namespace | undefined;
  const rooms = getBinding(request, "COLLAB") as Namespace | undefined;
  // Workers without the Durable Objects (a build made without them): no sockets, clients keep polling
  if (workers && !binding && !rooms) return no(404, "not_found");

  const db = await getDb(request);
  const auth = await authorizeUpgrade(request, {
    db,
    mailEnabled: (await getMailer(request)) !== null,
    // read only when someone asks for a room
    collabOpen: async () => (await getSettings(db)).collabOpen,
    ownerLimits: async (ownerId) => {
      const limits = await limitsFor(request, db, ownerId);
      return { collab_enabled: limits.collab_enabled, collab_people: limits.collab_people };
    },
  });
  if (!auth.ok) return no(auth.status, auth.error);

  if (auth.doc) return docSocket(request, db, auth.doc, auth, rooms, workers, no);
  if (workers && !binding) return no(404, "not_found");

  if (workers && binding) {
    // hand the upgrade to the topic's Durable Object, with who is asking said in headers it trusts
    // (it is reachable only through this binding), and without the visitor's cookie
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    headers.set("x-rt-topic", auth.topic);
    headers.set("x-rt-user", auth.userId);
    headers.set("x-rt-client", auth.clientId);
    headers.set("x-rt-expires", String(auth.expiresAt));
    return binding.get(binding.idFromName(auth.topic)).fetch(new Request(request, { headers }));
  }

  const attachment = { userId: auth.userId, clientId: auth.clientId, expiresAt: auth.expiresAt };
  const leave = new WeakMap<object, () => void>();
  type NodePeer = { send: (d: string) => void; close: (c?: number, r?: string) => void };
  return nodeResponse({
    open: (peer: NodePeer) => {
      const joined = nodeHub.connect(
        auth.topic,
        { send: (d) => peer.send(d), close: (c, r) => peer.close(c, r) },
        attachment,
      );
      if (!joined.ok) return peer.close(CLOSE.full, "full");
      leave.set(peer, joined.disconnect);
      peer.send(JSON.stringify({ t: "ready" }));
    },
    message: (peer: NodePeer, message: { text: () => string }) => {
      if (incoming(message.text()) === "ping") peer.send("pong");
      else peer.close(CLOSE.badMessage, "bad message");
    },
    close: (peer: NodePeer) => leave.get(peer)?.(),
    error: (peer: NodePeer) => leave.get(peer)?.(),
  } as unknown as Hooks);
}
