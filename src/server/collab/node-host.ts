// Live editing on a self-hosted server: the rooms live in this process and keep their state in
// the database (base64 in collab_snapshots and collab_updates). It is the hosted Durable Object's
// counterpart, with the same room logic and the same rules; one process, so there is nothing to
// coordinate. Imported only on Node (see src/server/node-collab.ts).
import { asc, eq } from "drizzle-orm";
import { collabSnapshots, collabUpdates } from "../../../infra/db/schema";
import { CLOSE } from "@/lib/realtime/protocol";
import type { Db } from "../db";
import type { CollabHost } from "./host";
import { type Effects, type Room, createRoom } from "./room";
import type { CollabStore } from "./store";

const b64 = (data: Uint8Array) => Buffer.from(data).toString("base64");
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, "base64"));

/** A room's state in the database. A crash between folding and clearing leaves both, which is harmless: Yjs applies an update twice the same as once. */
function dbStore(db: Db, docId: string): CollabStore {
  return {
    async load() {
      const [snapshot] = await db
        .select()
        .from(collabSnapshots)
        .where(eq(collabSnapshots.documentId, docId));
      const updates = await db
        .select()
        .from(collabUpdates)
        .where(eq(collabUpdates.documentId, docId))
        .orderBy(asc(collabUpdates.id));
      return {
        snapshot: snapshot ? unb64(snapshot.data) : null,
        updates: updates.map((u) => unb64(u.data)),
      };
    },
    async append(update) {
      await db.insert(collabUpdates).values({ documentId: docId, data: b64(update) });
    },
    async compact(snapshot) {
      await db
        .insert(collabSnapshots)
        .values({ documentId: docId, data: b64(snapshot) })
        .onConflictDoUpdate({ target: collabSnapshots.documentId, set: { data: b64(snapshot) } });
      await db.delete(collabUpdates).where(eq(collabUpdates.documentId, docId));
    },
    async clear() {
      await db.delete(collabUpdates).where(eq(collabUpdates.documentId, docId));
      await db.delete(collabSnapshots).where(eq(collabSnapshots.documentId, docId));
    },
  };
}

/** Who opened a room and what they may do, decided by the door (src/server/realtime/routes.ts). */
export type NodeConnection = {
  docId: string;
  userId: string;
  clientId: string;
  name: string;
  avatar: string | null;
  canWrite: boolean;
  /** People the owner's limits allow in the draft; the room takes four connections each. */
  people: number;
  expiresAt: number;
};

type Member = {
  peer: { send(data: string | Uint8Array): void; close(code: number, reason: string): void };
  userId: string;
  timer: ReturnType<typeof setTimeout>;
};
type Live = {
  docId: string;
  room: Room;
  members: Map<string, Member>;
  flushTimer?: ReturnType<typeof setTimeout> | undefined;
};
type State = { id: string; live?: Live; ready?: Promise<void> };
type Peer = Member["peer"];
type Incoming = { uint8Array(): Uint8Array };

/** What crossws calls for one connection. */
export type NodeHooks = {
  open(peer: Peer): Promise<void>;
  message(peer: Peer, message: Incoming): Promise<void>;
  close(peer: Peer): Promise<void>;
  error(peer: Peer): Promise<void>;
};

export type NodeCollabHost = CollabHost & {
  /** Starts the room from the draft's text if it was never set up. */
  ensureSeeded(docId: string, load: () => Promise<string>): Promise<void>;
  /** The WebSocket hooks for one connection (crossws). */
  hooks(connection: NodeConnection): NodeHooks;
};

const hosts = new WeakMap<Db, NodeCollabHost>();
const isPing = (b: Uint8Array) =>
  b.length === 4 && b[0] === 112 && b[1] === 105 && b[2] === 110 && b[3] === 103;

export function nodeCollab(db: Db, opts: { fresh?: boolean } = {}): NodeCollabHost {
  const cached = hosts.get(db);
  if (cached && !opts.fresh) return cached;

  const rooms = new Map<string, Live>();
  const loading = new Map<string, Promise<Live>>();
  let seq = 0;

  function loadRoom(docId: string): Promise<Live> {
    const live = rooms.get(docId);
    if (live) return Promise.resolve(live);
    let pending = loading.get(docId);
    if (!pending) {
      pending = (async () => {
        const room = createRoom({ store: dbStore(db, docId) });
        await room.open();
        const made: Live = { docId, room, members: new Map() };
        rooms.set(docId, made);
        return made;
      })().finally(() => loading.delete(docId));
      loading.set(docId, pending);
    }
    return pending;
  }

  /** A room nobody is in is written down in full and let go of, so idle drafts cost no memory. */
  async function release(live: Live) {
    if (live.members.size > 0 || rooms.get(live.docId) !== live) return;
    clearTimeout(live.flushTimer);
    live.flushTimer = undefined;
    await live.room.flush({ compact: true });
    if (live.members.size === 0) rooms.delete(live.docId);
  }

  function deliver(live: Live, fx: Effects) {
    for (const s of fx.send) live.members.get(s.to)?.peer.send(s.data);
    for (const b of fx.broadcast)
      for (const [id, m] of live.members) if (id !== b.except) m.peer.send(b.data);
  }

  /** Ends one connection from our side, and tells the rest its cursor is gone. */
  function endMember(live: Live, id: string, code: number, reason: string) {
    const member = live.members.get(id);
    if (!member) return;
    clearTimeout(member.timer);
    live.members.delete(id);
    deliver(live, live.room.leave(id));
    member.peer.close(code, reason);
  }

  function planFlush(live: Live) {
    const at = live.room.nextFlushAt();
    if (at === null || live.flushTimer) return;
    live.flushTimer = setTimeout(
      async () => {
        live.flushTimer = undefined;
        try {
          await live.room.flush();
        } catch (error) {
          console.error("live editing: could not write a room", error);
        }
        planFlush(live);
      },
      Math.max(0, at - Date.now()),
    );
  }

  const host: NodeCollabHost = {
    async ensureSeeded(docId, load) {
      const live = await loadRoom(docId);
      if (!live.room.exists()) await live.room.seed(await load());
      await release(live);
    },

    async seed(docId, text) {
      const live = await loadRoom(docId);
      const seeded = await live.room.seed(text);
      await release(live);
      return seeded;
    },

    async text(docId) {
      const live = await loadRoom(docId);
      const text = live.room.exists() ? live.room.text() : null;
      await release(live);
      return text;
    },

    async destroy(docId) {
      const live = await loadRoom(docId);
      for (const id of [...live.members.keys()]) endMember(live, id, CLOSE.gone, "ended");
      clearTimeout(live.flushTimer);
      await live.room.destroy();
      rooms.delete(docId);
    },

    async kick(docId, userId) {
      const live = rooms.get(docId);
      if (!live) return;
      for (const [id, m] of [...live.members])
        if (m.userId === userId) endMember(live, id, CLOSE.gone, "removed");
      await release(live);
    },

    hooks(connection) {
      const states = new WeakMap<object, State>();

      async function join(peer: Peer, state: State) {
        const live = await loadRoom(connection.docId);
        state.live = live;
        if (!live.room.exists()) return void peer.close(CLOSE.gone, "not set up");
        const joined = live.room.join(
          {
            id: state.id,
            userId: connection.userId,
            name: connection.name,
            avatar: connection.avatar,
            canWrite: connection.canWrite,
          },
          { maxPeers: connection.people * 4 },
        );
        if (!joined.ok) return void peer.close(CLOSE.full, "full");
        live.members.set(state.id, {
          peer,
          userId: connection.userId,
          // a connection lives a few minutes at most, so a removal or the kill switch takes effect
          timer: setTimeout(
            () => endMember(live, state.id, CLOSE.expired, "expired"),
            Math.max(0, connection.expiresAt - Date.now()),
          ),
        });
        peer.send(JSON.stringify({ t: "ready", epoch: live.room.epoch() }));
        deliver(live, joined.effects);
      }

      return {
        async open(peer: Peer) {
          const state: State = { id: `${connection.clientId}.${++seq}` };
          states.set(peer, state);
          state.ready = join(peer, state);
          await state.ready;
        },

        async message(peer: Peer, message: Incoming) {
          const state = states.get(peer);
          await state?.ready;
          const live = state?.live;
          if (!state || !live?.members.has(state.id)) return;
          const bytes = message.uint8Array();
          if (isPing(bytes)) return void peer.send("pong");
          const fx = live.room.receive(state.id, bytes);
          deliver(live, fx);
          if (fx.close) endMember(live, state.id, fx.close.code, fx.close.reason);
          if (fx.reload) deliver(live, await live.room.reload());
          planFlush(live);
        },

        async close(peer: Peer) {
          const state = states.get(peer);
          states.delete(peer);
          await state?.ready;
          const live = state?.live;
          if (!state || !live) return;
          const member = live.members.get(state.id);
          if (member) {
            clearTimeout(member.timer);
            live.members.delete(state.id);
            deliver(live, live.room.leave(state.id));
          }
          await release(live);
        },

        // an error ends the connection the same way a close does
        error(peer: Peer) {
          return this.close(peer);
        },
      };
    },
  };
  if (!opts.fresh) hosts.set(db, host);
  return host;
}
