import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { expect, type APIRequestContext } from "@playwright/test";
import { SITE } from "./mail-server";
import { account as mailAccount } from "./review-helpers";

const MAIN = "http://localhost:4173";
const MSG_SYNC = 0;
export const TEXT = "md";

export const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** A signed-in account on a server (the main one confirms everyone), as an API context and a cookie. */
export async function account(
  playwright: typeof import("@playwright/test").playwright,
  name: string,
  /** The server that sends mail, where an account must confirm its address (and where a server-wide switch is safe to throw). */
  onMailServer = false,
) {
  if (onMailServer) {
    const made = await mailAccount(playwright, name);
    const { cookies } = await made.request.storageState();
    return { ...made, base: SITE, cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") };
  }
  const request = await playwright.request.newContext({ baseURL: MAIN });
  const email = `${name}-${unique()}@example.com`;
  const res = await request.post("/api/auth/signup", {
    data: { email, password: "a long enough password" },
  });
  expect(res.status()).toBe(200);
  const me = (await (await request.get("/api/auth/me")).json()).user as { id: string };
  const { cookies } = await request.storageState();
  return {
    request,
    email,
    id: me.id,
    base: MAIN,
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
  };
}
export type Account = Awaited<ReturnType<typeof account>>;

/** Puts a cloud draft on the server, as a device would, and returns its id. */
export async function cloudDraft(owner: Account, content = "# Notes\n\nStart") {
  const id = `d${Math.random().toString(36).slice(2, 8)}`;
  const res = await owner.request.post("/api/sync/push", {
    data: {
      docs: [
        {
          id: `${owner.id}:${id}`,
          baseVersion: 0,
          title: "Notes",
          content,
          createdAt: Date.now(),
          editedAt: Date.now(),
        },
      ],
    },
  });
  expect(res.status()).toBe(200);
  return id;
}

/** A browser's provider: a Yjs document on a socket to a draft's room. */
export class Collab {
  readonly doc: Y.Doc;
  readonly text: Y.Text;
  readonly texts: string[] = [];
  readonly opened: Promise<boolean>;
  readonly closed: Promise<number>;
  private readonly ws: WebSocket;

  constructor(
    owner: Account | string,
    draft: string,
    as: Account,
    opts: { doc?: Y.Doc; headers?: Record<string, string> } = {},
  ) {
    // a browser that kept its document (IndexedDB) while it was offline brings it back
    this.doc = opts.doc ?? new Y.Doc();
    this.text = this.doc.getText(TEXT);
    const ownerId = typeof owner === "string" ? owner : owner.id;
    const topic = `doc:${ownerId}:${draft}`;
    const client = `tab-${unique()
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 12)}`;
    this.ws = new WebSocket(
      `${as.base.replace("http", "ws")}/api/realtime?topic=${topic}&client=${client}`,
      { headers: { cookie: as.cookie, origin: as.base, ...(opts.headers ?? {}) } } as never,
    );
    this.ws.binaryType = "arraybuffer";
    this.opened = new Promise((resolve) => {
      this.ws.onopen = () => {
        resolve(true);
        this.send(this.frame((e) => syncProtocol.writeSyncStep1(e, this.doc)));
      };
      this.ws.onerror = () => resolve(false);
    });
    this.closed = new Promise((resolve) => {
      this.ws.onclose = (e) => resolve(e.code);
    });
    this.ws.onmessage = (e) => {
      if (typeof e.data === "string") return void this.texts.push(e.data);
      const d = decoding.createDecoder(new Uint8Array(e.data as ArrayBuffer));
      if (decoding.readVarUint(d) !== MSG_SYNC) return;
      const reply = encoding.createEncoder();
      encoding.writeVarUint(reply, MSG_SYNC);
      syncProtocol.readSyncMessage(d, reply, this.doc, this);
      if (encoding.length(reply) > 1) this.send(encoding.toUint8Array(reply));
    };
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== this) this.send(this.frame((e) => syncProtocol.writeUpdate(e, update)));
    });
  }

  private frame(write: (e: encoding.Encoder) => void) {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_SYNC);
    write(e);
    return encoding.toUint8Array(e);
  }
  private send(data: Uint8Array) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
  }

  /** Types into the shared text at a position. */
  insert(at: number, s: string) {
    this.text.insert(Math.min(at, this.text.length), s);
  }
  close() {
    this.ws.close();
  }
}

export const textOf = (c: Collab) => c.text.toString();

/** The text copy of a draft the server holds, as a pull returns it. */
export async function serverDoc(owner: Account, draft: string) {
  const { docs } = await (await owner.request.get("/api/sync/pull?since=0")).json();
  return (
    docs as { id: string; content: string; collab: boolean; version: number; deleted: boolean }[]
  ).find((d) => d.id === `${owner.id}:${draft}`)!;
}

export async function startLive(owner: Account, draft: string) {
  const res = await owner.request.post(`/api/collab/${draft}`);
  expect(res.status(), await res.text()).toBe(200);
}
export async function invite(owner: Account, draft: string, email: string) {
  const res = await owner.request.post(`/api/collab/${draft}/editors`, { data: { email } });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).editors as { id: string; email: string }[];
}
export type Req = APIRequestContext;
