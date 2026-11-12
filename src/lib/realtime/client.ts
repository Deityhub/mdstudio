// One real-time socket: connects, reports when it is subscribed, hands events to its owner and
// reconnects by itself with a growing wait. It does not know what the events mean. While it is not
// connected the owner keeps polling, so a broken socket costs speed, never correctness.
import { CLOSE, type RealtimeEvent, parseEvent } from "./protocol";
import { tabId } from "./tab";

export type SocketLike = {
  send(data: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
};

type Options = {
  /** `user`, or `share:<slug>`. */
  topic: string;
  onEvent: (event: RealtimeEvent) => void;
  /** True once the server has subscribed this socket; false whenever it is gone again. */
  onConnected: (connected: boolean) => void;
  /** The session this socket belonged to ended or ran out; resolve once the account was looked at again. */
  onEnded?: (code: number) => Promise<unknown> | unknown;
  /** Makes the socket from its address; tests pass a fake. */
  createSocket?: (url: string) => SocketLike;
};

const MIN_WAIT = 1000;
const MAX_WAIT = 60_000;
const PING_EVERY = 25_000;
const PONG_WITHIN = 10_000;

const socketUrl = (topic: string, clientId: string) =>
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/realtime?` +
  new URLSearchParams({ topic, client: clientId });

export function createRealtime(opts: Options) {
  const open = opts.createSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);

  let socket: SocketLike | null = null;
  let running = false;
  let connected = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  let pong: ReturnType<typeof setTimeout> | undefined;

  const setConnected = (next: boolean) => {
    if (connected === next) return;
    connected = next;
    opts.onConnected(next);
  };

  function release() {
    clearInterval(ping);
    clearTimeout(pong);
    ping = pong = undefined;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = null;
      socket = null;
    }
  }

  /** The wait before the next try: 1 s, 2 s, 4 s ... up to a minute, with a little randomness. */
  const backoff = () => Math.min(MAX_WAIT, MIN_WAIT * 2 ** attempt++) * (0.5 + Math.random() / 2);

  function schedule(wait: number) {
    if (!running) return;
    clearTimeout(retry);
    retry = setTimeout(connect, wait);
  }

  async function lost(code: number | null) {
    release();
    setConnected(false);
    if (!running) return;
    if (code === CLOSE.sessionEnded || code === CLOSE.expired) {
      // the account may be signed out now (the owner then stops us) or only need a fresh session
      await opts.onEnded?.(code);
      schedule(MIN_WAIT);
    } else if (code === CLOSE.full || code === CLOSE.badMessage) schedule(MAX_WAIT);
    else schedule(backoff());
  }

  function connect() {
    retry = undefined;
    if (!running || socket) return;
    const s = open(socketUrl(opts.topic, tabId));
    socket = s;
    s.onopen = () => {
      ping = setInterval(() => {
        s.send("ping");
        clearTimeout(pong);
        // nothing came back: the connection is dead even if the browser has not noticed
        pong = setTimeout(() => {
          s.close();
          void lost(null);
        }, PONG_WITHIN);
      }, PING_EVERY);
    };
    s.onmessage = (event) => {
      clearTimeout(pong);
      pong = undefined;
      if (typeof event.data !== "string" || event.data === "pong") return;
      const parsed = parseEvent(event.data);
      if (!parsed) return;
      if (parsed.t === "ready") {
        attempt = 0;
        setConnected(true);
      } else opts.onEvent(parsed);
    };
    s.onclose = (event) => void lost(event.code); // also follows an error, so that needs no handler
  }

  return {
    start() {
      if (running) return;
      running = true;
      attempt = 0;
      connect();
    },
    stop() {
      running = false;
      clearTimeout(retry);
      const s = socket;
      release();
      s?.close();
      setConnected(false);
    },
  };
}
