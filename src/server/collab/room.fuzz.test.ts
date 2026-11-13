// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRoom } from "./room";
import { memoryStore } from "./store";
import { Network } from "./testing";

/** A small seeded random generator, so a failure can be replayed from its seed. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function session(seed: number, opts: { editors: number; steps: number; offline: boolean }) {
  const rnd = random(seed);
  const store = memoryStore();
  let now = 1_700_000_000_000;
  let room = createRoom({ store, now: () => now, maxPeers: 20, maxPerUser: 20 });
  await room.open();
  await room.seed("# Title\n\nFirst paragraph.\n\nSecond paragraph.\n");
  const net = new Network(room);
  const people = [];
  for (let i = 0; i < opts.editors; i++) people.push(await net.add(`p${i}`));

  for (let step = 0; step < opts.steps; step++) {
    now += 100;
    const p = people[Math.floor(rnd() * people.length)]!;
    const roll = rnd();
    if (opts.offline && roll < 0.08) {
      if (p.online) p.goOffline();
      else p.goOnline();
    } else if (roll < 0.7 || p.text.length < 5)
      p.insert(
        Math.floor(rnd() * (p.text.length + 1)),
        "abcdefghij".slice(0, 1 + Math.floor(rnd() * 8)),
      );
    else p.delete(Math.floor(rnd() * p.text.length), 1 + Math.floor(rnd() * 6));
    if (rnd() < 0.02) await room.flush();
    // now and then the room is restarted, as a Durable Object is after hibernating
    if (rnd() < 0.01) {
      await room.flush();
      room = createRoom({ store, now: () => now, maxPeers: 20, maxPerUser: 20 });
      await room.open();
      net.restart(room);
    }
  }
  for (const p of people) if (!p.online) p.goOnline();
  // one more handshake each, as a provider does when it is ready
  for (const p of people) {
    p.goOffline();
    p.goOnline();
  }
  return { room, people };
}

describe("convergence", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    it(`everyone ends with the same text (seed ${seed}, online)`, async () => {
      const { room, people } = await session(seed, { editors: 4, steps: 300, offline: false });
      for (const p of people) expect(p.text.toString()).toBe(room.text());
    });
  }

  for (const seed of [21, 22, 23, 24, 25, 26, 27, 28]) {
    it(`everyone ends with the same text after going offline and back (seed ${seed})`, async () => {
      const { room, people } = await session(seed, { editors: 5, steps: 400, offline: true });
      for (const p of people) expect(p.text.toString()).toBe(room.text());
    });
  }

  it("a room restarted from its storage has exactly the text the editors converged on", async () => {
    const store = memoryStore();
    const room = createRoom({ store, now: () => 1, maxPeers: 10, maxPerUser: 10 });
    await room.open();
    await room.seed("start");
    const net = new Network(room);
    const [a, b] = [await net.add("a"), await net.add("b")];
    for (let i = 0; i < 50; i++) (i % 2 ? a : b).insert(0, `${i},`);
    await room.flush({ compact: true });
    const again = createRoom({ store, now: () => 2 });
    await again.open();
    expect(again.text()).toBe(a.text.toString());
    expect(again.text()).toBe(b.text.toString());
  });
});
