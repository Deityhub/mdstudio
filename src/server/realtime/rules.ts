// The rules both hubs share, so the Durable Object (hosted) and the in-process hub (self-hosted)
// cannot drift apart: how many sockets a topic takes, who an event goes to, and what a socket
// may say. Pure, so they are tested without either runtime.

/** What a socket is remembered by: the account, the tab, and when its session runs out. */
export type Attachment = { userId: string; clientId: string; expiresAt: number };

export const SOCKET_CAPS = { user: 10, share: 50 } as const;

export const topicKind = (topic: string): keyof typeof SOCKET_CAPS =>
  topic.startsWith("share:") ? "share" : "user";

export const hasRoom = (topic: string, open: number) => open < SOCKET_CAPS[topicKind(topic)];

/**
 * Splits a topic's sockets into those an event goes to (everyone but the tab that caused it) and
 * those whose session has run out, which are closed instead.
 */
export function fanout<T extends { attachment: Attachment }>(
  sockets: T[],
  { exclude, now }: { exclude?: string | undefined; now: number },
) {
  const send: T[] = [];
  const expired: T[] = [];
  for (const socket of sockets) {
    if (socket.attachment.expiresAt <= now) expired.push(socket);
    else if (socket.attachment.clientId !== exclude) send.push(socket);
  }
  return { send, expired };
}

/** Clients send nothing but a keep-alive ping; anything else ends the connection. */
export const incoming = (message: unknown): "ping" | "close" =>
  message === "ping" ? "ping" : "close";
