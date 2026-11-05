// Sends one email through the best of several providers. Each free tier has its own daily and
// monthly allowance, so the chain keeps count (in the same table as the rate limits), prefers the
// provider with the most room left, skips any that is full, and falls through to the next when one
// fails. A provider that fails is left alone for a few minutes so a dead one costs nothing twice.
import { hit, readCount, blockedFor, setCount } from "../auth/limits";
import type { Db } from "../db";
import { type Mail, type Mailer, ProviderError } from "./types";

export type Caps = { daily: number; monthly: number };
export type ConfiguredProvider = { id: string; caps: Caps; send: Mailer };

const COOL_DOWN_MS = 5 * 60_000;
const FOREVER = Number.MAX_SAFE_INTEGER;

const parts = (now: number) => {
  const d = new Date(now);
  return {
    day: d.toISOString().slice(0, 10),
    month: d.toISOString().slice(0, 7),
    endOfDay: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1),
    endOfMonth: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
  };
};
const keys = (id: string, now: number) => {
  const p = parts(now);
  return {
    day: `mail:${id}:d:${p.day}`,
    month: `mail:${id}:m:${p.month}`,
    cool: `mail:${id}:cool`,
    endOfDay: p.endOfDay,
    endOfMonth: p.endOfMonth,
  };
};

export async function sendWithChain(
  db: Db,
  providers: ConfiguredProvider[],
  mail: Mail,
  now = Date.now(),
): Promise<string> {
  const ready: { p: ConfiguredProvider; room: number; order: number }[] = [];
  for (const [order, p] of providers.entries()) {
    const k = keys(p.id, now);
    if ((await blockedFor(db, k.cool, 0, now)) !== null) continue;
    const room = Math.min(
      p.caps.daily - (await readCount(db, k.day, now)),
      p.caps.monthly - (await readCount(db, k.month, now)),
    );
    if (room > 0) ready.push({ p, room, order });
  }
  if (!ready.length) throw new Error("No mail provider has room left, or none is configured");
  ready.sort((a, b) => b.room - a.room || a.order - b.order);

  const failed: string[] = [];
  for (const { p } of ready) {
    const k = keys(p.id, now);
    try {
      await p.send(mail);
      // counted only once it went out, so a failure never uses up an allowance
      await hit(db, k.day, FOREVER, k.endOfDay - now, now);
      await hit(db, k.month, FOREVER, k.endOfMonth - now, now);
      return p.id;
    } catch (error) {
      const status = error instanceof ProviderError ? error.status : undefined;
      failed.push(status ? `${p.id} (${status})` : p.id);
      console.error(`Mail provider ${p.id} failed${status ? ` with ${status}` : ""}`);
      // 429 means its allowance is gone, whatever we counted; anything else, give it a rest
      if (status === 429 && Number.isFinite(p.caps.daily))
        await setCount(db, k.day, p.caps.daily, k.endOfDay);
      else await hit(db, k.cool, 0, COOL_DOWN_MS, now);
    }
  }
  throw new Error(`Couldn't send the email: ${failed.join(", ")}`);
}
