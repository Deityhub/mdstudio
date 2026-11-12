// The real-time socket's door: GET /api/realtime?topic=user|share:<slug>&client=<tab id>, as a
// WebSocket upgrade. Everything is decided here, once, when the socket opens: who is asking, whether
// they may listen to that topic, and whether they are asking too often. After that the socket can
// only receive. On Workers the open socket then lives in a Durable Object (infra/realtime), on Node in
// the process's own hub. See docs/SYSTEM_SPEC.md, "Real-time".
import { CLOSE, isClientId, parseTopic } from "@/lib/realtime/protocol";
import { hit } from "../auth/limits";
import { readToken, sameOrigin } from "../auth/http";
import { userForToken } from "../auth/service";
import { type Db, getDb } from "../db";
import { getBinding, onWorkers } from "../env";
import { getMailer } from "../mail";
import { viewShare } from "../share/service";
import { nodeHub } from "./hub";
import { incoming } from "./rules";

const HOUR = 60 * 60 * 1000;
/** Sockets one account may open an hour: a few tabs, and reconnects after a dropped network. */
const UPGRADES_PER_HOUR = 120;

export type UpgradeAuth =
  | { ok: true; topic: string; userId: string; clientId: string; expiresAt: number }
  | { ok: false; status: number; error: string };

const refuse = (status: number, error: string) => ({ ok: false, status, error }) as const;

export async function authorizeUpgrade(
  request: Request,
  deps: { db: Db; mailEnabled: boolean; now?: number; upgradeLimit?: number },
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
  return { ok: true, topic: key, userId: user.id, clientId, expiresAt: session.expiresAt };
}

type Hooks = Record<string, (...args: never[]) => unknown>;
/** nitro reads WebSocket hooks off the response (and ignores its status), so a Node answer is hooks. */
const nodeResponse = (hooks: Hooks) => Object.assign(new Response(null), { crossws: hooks });

export async function realtimeHandler(request: Request): Promise<Response> {
  const workers = onWorkers(request);
  const no = (status: number, error: string) => {
    const response = Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
    // on Node the refusal has to be said from the upgrade hook
    return workers ? response : nodeResponse({ upgrade: () => response });
  };

  const binding = getBinding(request, "REALTIME") as
    | { idFromName: (name: string) => unknown; get: (id: unknown) => { fetch: typeof fetch } }
    | undefined;
  // Workers without the Durable Object (a build made without it): no sockets, clients keep polling
  if (workers && !binding) return no(404, "not_found");

  const db = await getDb(request);
  const auth = await authorizeUpgrade(request, {
    db,
    mailEnabled: (await getMailer(request)) !== null,
  });
  if (!auth.ok) return no(auth.status, auth.error);

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
