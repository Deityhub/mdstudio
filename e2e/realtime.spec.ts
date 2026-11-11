import { expect, test, type APIRequestContext } from "@playwright/test";
import { CLOSE } from "../src/lib/realtime/protocol";
import { signUp } from "./admin-helpers";

// The socket's door, against the self-hosted server (see src/server/realtime/routes.ts). Events
// themselves are covered where they are sent (sync, comments).
const PORT = 4173;
const tab = () => `tab-${Math.random().toString(36).slice(2, 12)}`;
const url = (topic = "user", client = tab()) =>
  `ws://localhost:${PORT}/api/realtime?topic=${topic}&client=${client}`;

async function cookieOf(request: APIRequestContext) {
  const { cookies } = await request.storageState();
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** A WebSocket from Node, where the headers of the handshake can be chosen. */
function connect(address: string, headers: Record<string, string> = {}) {
  const ws = new WebSocket(address, { headers } as never);
  const messages: string[] = [];
  const opened = new Promise<boolean>((resolve) => {
    ws.onopen = () => resolve(true);
    ws.onerror = () => resolve(false);
  });
  const closed = new Promise<number>((resolve) => {
    ws.onclose = (e) => resolve(e.code);
  });
  ws.onmessage = (e) => void messages.push(String(e.data));
  return { ws, messages, opened, closed };
}

test("a signed-in account can listen on its own topic, and is told when it is ready", async ({
  request,
}) => {
  await signUp(request);
  const { ws, messages, opened } = connect(url(), {
    cookie: await cookieOf(request),
    origin: `http://localhost:${PORT}`,
  });
  expect(await opened).toBe(true);
  await expect.poll(() => messages).toContain('{"t":"ready"}');
  ws.send("ping");
  await expect.poll(() => messages).toContain("pong");
  ws.close();
});

test("the page's own socket gets through the content security policy", async ({ page }) => {
  await signUp(page.request);
  await page.goto("/editor");
  const first = await page.evaluate(
    (address) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(address);
        ws.onmessage = (e) => (resolve(String(e.data)), ws.close());
        ws.onerror = () => resolve("blocked");
      }),
    url(),
  );
  expect(first).toBe('{"t":"ready"}');
});

test("it is refused without a session, from another site, and for a topic it may not have", async ({
  request,
}) => {
  expect(await connect(url()).opened).toBe(false); // signed out
  await signUp(request);
  const cookie = await cookieOf(request);
  const origin = `http://localhost:${PORT}`;
  expect(await connect(url(), { cookie, origin: "https://evil.example" }).opened).toBe(false);
  for (const topic of ["user:someone-else", "doc:1", "share:nosuchlink"])
    expect(await connect(url(topic), { cookie, origin }).opened, topic).toBe(false);
  expect(await connect(url("user", "x"), { cookie, origin }).opened).toBe(false); // bad tab name
});

test("a client may only ping: anything else ends the connection", async ({ request }) => {
  await signUp(request);
  const { ws, opened, closed } = connect(url(), {
    cookie: await cookieOf(request),
    origin: `http://localhost:${PORT}`,
  });
  await opened;
  ws.send("hello");
  expect(await closed).toBe(CLOSE.badMessage);
});

test("one account can hold ten sockets, and an eleventh is turned away", async ({ request }) => {
  await signUp(request);
  const headers = { cookie: await cookieOf(request), origin: `http://localhost:${PORT}` };
  const open = Array.from({ length: 10 }, () => connect(url(), headers));
  for (const c of open) expect(await c.opened).toBe(true);
  const extra = connect(url(), headers);
  await extra.opened;
  expect(await extra.closed).toBe(CLOSE.full);
  for (const c of open) c.ws.close();
});

test("a plain request to the socket address is told to upgrade", async ({ request }) => {
  const res = await request.get("/api/realtime");
  expect(res.status()).toBe(426);
});
