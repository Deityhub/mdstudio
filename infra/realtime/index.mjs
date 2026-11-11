// The hosted real-time hub: one Durable Object per topic ("user:<id>", "share:<id>"), holding that
// topic's open WebSockets. It is a separate Worker because the app's build cannot export a Durable
// Object class; the app binds to it (infra/worker-config.ts). Sockets use the Hibernation API, so
// an idle topic costs nothing: the object is evicted while the connections stay open, and wakes
// for a message or a publish. The same rules as the self-hosted hub (src/server/realtime/rules.ts).
//
//   upgrade   forwarded by the app after it has checked who is asking (x-rt-* headers)
//   publish   POST /publish { event, exclude? } from the app after a change is saved
import { DurableObject } from "cloudflare:workers";
import { CLOSE, MAX_EVENT_BYTES } from "../../src/lib/realtime/protocol";
import { fanout, hasRoom, incoming } from "../../src/server/realtime/rules";

export class RealtimeHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // a client's keep-alive is answered by the runtime without waking the object
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/publish") return this.publish(request);
    if (request.headers.get("upgrade") !== "websocket")
      return new Response("expected a WebSocket", { status: 426 });

    const topic = request.headers.get("x-rt-topic");
    const userId = request.headers.get("x-rt-user");
    const clientId = request.headers.get("x-rt-client");
    const expiresAt = Number(request.headers.get("x-rt-expires"));
    if (!topic || !userId || !clientId || !Number.isFinite(expiresAt))
      return new Response("missing details", { status: 400 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    // said through the socket, as the self-hosted hub does, so the browser can tell "full" from a
    // network failure (a refused handshake shows no reason)
    if (!hasRoom(topic, this.ctx.getWebSockets().length - 1)) {
      server.close(CLOSE.full, "full");
      return new Response(null, { status: 101, webSocket: client });
    }
    server.serializeAttachment({ userId, clientId, expiresAt });
    server.send(JSON.stringify({ t: "ready" }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async publish(request) {
    const text = await request.text();
    if (text.length > MAX_EVENT_BYTES * 2) return new Response("too large", { status: 413 });
    const { event, exclude } = JSON.parse(text);
    const sockets = this.ctx
      .getWebSockets()
      .map((ws) => ({ ws, attachment: ws.deserializeAttachment() }))
      .filter((s) => s.attachment); // one turned away as full has none
    const { send, expired } = fanout(sockets, { exclude, now: Date.now() });
    for (const { ws } of expired) ws.close(CLOSE.expired, "expired");
    const data = JSON.stringify(event);
    for (const { ws } of send) {
      try {
        ws.send(data);
      } catch {
        // a socket that cannot be written to is gone
      }
    }
    // after a bye the account's sockets are closed, so a signed-out tab cannot keep listening
    if (event.t === "bye")
      for (const { ws } of sockets) {
        if (expired.some((e) => e.ws === ws)) continue;
        try {
          ws.close(CLOSE.sessionEnded, event.reason);
        } catch {
          // already closed
        }
      }
    return new Response(null, { status: 204 });
  }

  webSocketMessage(ws, message) {
    if (incoming(message) !== "ping") ws.close(CLOSE.badMessage, "bad message");
  }

  webSocketClose(ws, code) {
    // without this the close handshake is never finished
    ws.close(code && code >= 1000 && code < 5000 && code !== 1005 ? code : 1000);
  }
}

// Nothing is served from this Worker itself: it exists to hold the Durable Object.
export default { fetch: () => new Response("not found", { status: 404 }) };
