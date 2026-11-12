// Edits one draft with many simulated people at once, through real sockets, and checks the result.
// It is for sizing the cost of live editing on a server you run, not part of the test suite:
//
//   MAX_COLLAB_PEOPLE=12 PORT=4180 DATA_DIR=/tmp/load node .output/server/index.mjs
//   bun scripts/collab-load.ts --url http://localhost:4180 --editors 8 --seconds 30
//
// Each editor types at a human pace (about 6 keystrokes a second, with pauses) at random places, the
// way the browser sends it (edits batched for 50 ms, merged). At the end every copy must be the same.
// It prints what the room had to carry: frames and bytes, per editor and in all. On Cloudflare, the
// incoming frames are the billed requests (20 to 1), so frames in / 20 is what to compare with the plan.
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const BASE = arg("url", "http://localhost:4173");
const EDITORS = Number(arg("editors", "6"));
const SECONDS = Number(arg("seconds", "30"));
const KEYS_PER_SECOND = Number(arg("rate", "6"));
const BATCH_MS = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (n: number) => Math.floor(Math.random() * n);
const tag = Date.now().toString(36);

async function signUp(name: string) {
  const email = `load-${name}-${tag}@example.com`;
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, password: "a long enough password" }),
  });
  if (!res.ok) throw new Error(`sign-up failed (${res.status}): ${await res.text()}`);
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const me = (await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })).json()) as {
    user: { id: string };
  };
  return { email, cookie, id: me.user.id };
}
type Person = Awaited<ReturnType<typeof signUp>>;
const api = (who: Person, path: string, method = "GET", body?: unknown) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { cookie: who.cookie, origin: BASE, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const stats = { framesOut: 0, bytesOut: 0, framesIn: 0, bytesIn: 0 };

function editor(owner: Person, draft: string, who: Person) {
  const doc = new Y.Doc();
  const text = doc.getText("md");
  const ws = new WebSocket(
    `${BASE.replace("http", "ws")}/api/realtime?topic=doc:${owner.id}:${draft}&client=tab-${Math.random().toString(36).slice(2, 12)}`,
    { headers: { cookie: who.cookie, origin: BASE } } as never,
  );
  ws.binaryType = "arraybuffer";
  let queued: Uint8Array[] = [];
  let ready = false;
  let synced = false;
  const frame = (write: (e: encoding.Encoder) => void) => {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, 0);
    write(e);
    return encoding.toUint8Array(e);
  };
  const send = (data: Uint8Array) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    stats.framesOut++;
    stats.bytesOut += data.length;
    ws.send(data);
  };
  ws.onmessage = (e) => {
    if (typeof e.data === "string") {
      if (e.data.includes('"ready"')) {
        ready = true;
        send(frame((w) => syncProtocol.writeSyncStep1(w, doc)));
      }
      return;
    }
    const bytes = new Uint8Array(e.data as ArrayBuffer);
    stats.framesIn++;
    stats.bytesIn += bytes.length;
    const d = decoding.createDecoder(bytes);
    if (decoding.readVarUint(d) !== 0) return;
    const reply = encoding.createEncoder();
    encoding.writeVarUint(reply, 0);
    if (syncProtocol.readSyncMessage(d, reply, doc, ws) === syncProtocol.messageYjsSyncStep2)
      synced = true;
    if (encoding.length(reply) > 1) send(encoding.toUint8Array(reply));
  };
  doc.on("update", (u: Uint8Array, origin: unknown) => {
    if (origin !== ws && ready) queued.push(u);
  });
  const batch = setInterval(() => {
    if (!queued.length) return;
    const merged = queued.length === 1 ? queued[0]! : Y.mergeUpdates(queued);
    queued = [];
    send(frame((w) => syncProtocol.writeUpdate(w, merged)));
  }, BATCH_MS);
  return {
    text,
    close: () => {
      clearInterval(batch);
      ws.close();
    },
    get synced() {
      return synced;
    },
    type() {
      const len = text.length;
      if (Math.random() < 0.2 && len > 10) text.delete(rand(len - 3), 1 + rand(2));
      else text.insert(rand(len + 1), "abcdefghij klmnop"[rand(17)]!);
    },
  };
}

const owner = await signUp("owner");
const others = await Promise.all(Array.from({ length: EDITORS - 1 }, (_, i) => signUp(`p${i}`)));
const draft = `l${tag}`.slice(0, 16);
const push = await api(owner, "/api/sync/push", "POST", {
  docs: [
    {
      id: `${owner.id}:${draft}`,
      baseVersion: 0,
      title: "Load",
      content: "# Load test\n\nStart of the draft.\n",
      createdAt: Date.now(),
      editedAt: Date.now(),
    },
  ],
});
if (!push.ok) throw new Error(`push failed (${push.status})`);
const on = await api(owner, `/api/collab/${draft}`, "POST");
if (!on.ok) throw new Error(`start failed (${on.status}): ${await on.text()}`);
for (const p of others) {
  const r = await api(owner, `/api/collab/${draft}/editors`, "POST", { email: p.email });
  if (!r.ok)
    throw new Error(`invite failed (${r.status}): ${await r.text()}. Raise MAX_COLLAB_PEOPLE.`);
}

const editors = [editor(owner, draft, owner), ...others.map((p) => editor(owner, draft, p))];
for (let i = 0; i < 50 && !editors.every((e) => e.synced); i++) await sleep(100);
if (!editors.every((e) => e.synced)) throw new Error("not every editor joined the room");
console.log(
  `${EDITORS} editors in one draft for ${SECONDS} s at about ${KEYS_PER_SECOND} keys/s each`,
);

const started = Date.now();
stats.framesOut = stats.framesIn = stats.bytesOut = stats.bytesIn = 0;
await Promise.all(
  editors.map(async (e) => {
    while (Date.now() - started < SECONDS * 1000) {
      e.type();
      await sleep((1000 / KEYS_PER_SECOND) * (0.4 + Math.random() * 1.2));
    }
  }),
);
await sleep(2500); // the last frames arrive
const same = editors.every((e) => e.text.toString() === editors[0]!.text.toString());
const length = editors[0]!.text.length;
editors.forEach((e) => e.close());

const flushed = await api(owner, `/api/collab/doc/${owner.id}/${draft}/flush`, "POST");
const saved = (
  (await (await api(owner, "/api/sync/pull?since=0")).json()) as {
    docs: { id: string; content: string }[];
  }
).docs.find((d) => d.id === `${owner.id}:${draft}`)?.content;
const matches = saved === editors[0]!.text.toString();

const per = (n: number) => (n / SECONDS).toFixed(1);
console.log(`
converged: ${same ? "yes" : "NO"}   text copy on the server matches: ${matches ? "yes" : "NO"} (flush ${flushed.status})   length: ${length} characters
frames from the editors to the room: ${stats.framesOut} (${per(stats.framesOut)}/s, ${(stats.bytesOut / 1024).toFixed(1)} KB)
frames from the room to the editors: ${stats.framesIn} (${per(stats.framesIn)}/s, ${(stats.bytesIn / 1024).toFixed(1)} KB)
per editor, to the room: ${(stats.framesOut / EDITORS / SECONDS).toFixed(1)} frames/s
Cloudflare Durable Object requests for this hour of work at this pace: about ${Math.round(((stats.framesOut / SECONDS) * 3600) / 20).toLocaleString()} (the free plan allows 100,000 a day)`);
process.exit(same && matches ? 0 : 1);
