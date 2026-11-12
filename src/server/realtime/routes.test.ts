// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { users } from "../../../infra/db/schema";
import { eq } from "drizzle-orm";
import { signup } from "../auth/service";
import type { Db } from "../db";
import { addPerson } from "../share/people";
import { DEFAULT_SHARE, publishShare, updateShare } from "../share/service";
import { addEditor, enableCollab } from "../collab/service";
import { pushDocs } from "../sync/service";
import { authorizeUpgrade } from "./routes";

const password = "a long enough password";
const now = 1_700_000_000_000;
const DAY = 86_400_000;
const client = "tab-abcdefgh";
let db: Db;

const account = async (name: string, verifyByEmail = false) => {
  const r = await signup(db, { email: `${name}@x.co`, password }, now, { verifyByEmail });
  if ("error" in r) throw new Error(r.error);
  return r;
};
const upgrade = (
  token: string | null,
  query = `topic=user&client=${client}`,
  headers: Record<string, string> = {},
) =>
  new Request(`http://site.test/api/realtime?${query}`, {
    headers: {
      upgrade: "websocket",
      origin: "http://site.test",
      ...(token && { cookie: `mdstudio_session=${token}` }),
      ...headers,
    },
  });
const ask = (request: Request, over: { mailEnabled?: boolean; upgradeLimit?: number } = {}) =>
  authorizeUpgrade(request, { db, mailEnabled: false, now, ...over });

beforeEach(() => void (db = createNodeDb(":memory:") as unknown as Db));

describe("who may open a socket", () => {
  it("lets a signed-in account listen to its own topic, until its session ends", async () => {
    const { user, token } = await account("a");
    const result = await ask(upgrade(token));
    expect(result).toEqual({
      ok: true,
      topic: `user:${user.id}`,
      userId: user.id,
      clientId: client,
      expiresAt: expect.any(Number),
    });
    if (result.ok) expect(result.expiresAt).toBeGreaterThan(now);
  });

  it("refuses without a session, with an expired one, and when suspended", async () => {
    const { user, token } = await account("a");
    expect(await ask(upgrade(null))).toMatchObject({ ok: false, status: 401 });
    expect(await ask(upgrade("not-a-token"))).toMatchObject({ ok: false, status: 401 });
    await db.update(users).set({ suspendedAt: now }).where(eq(users.id, user.id));
    expect(await ask(upgrade(token))).toMatchObject({ ok: false, status: 401 });
  });

  it("refuses a page from another site (Origin must be this site)", async () => {
    const { token } = await account("a");
    const evil = upgrade(token, undefined, { origin: "https://evil.example" });
    expect(await ask(evil)).toMatchObject({ ok: false, status: 403 });
    // a client that sends no Origin at all is not a browser page, so it has no cookie to abuse
    const bare = new Request(upgrade(token).url, {
      headers: { upgrade: "websocket", cookie: `mdstudio_session=${token}` },
    });
    expect(await ask(bare)).toMatchObject({ ok: true });
  });

  it("needs a confirmed email on a server that sends mail, like the cloud itself", async () => {
    const { token } = await account("a", true);
    expect(await ask(upgrade(token), { mailEnabled: true })).toMatchObject({
      ok: false,
      status: 403,
      error: "email_unverified",
    });
    expect(await ask(upgrade(token), { mailEnabled: false })).toMatchObject({ ok: true });
  });

  it("refuses a bad topic or tab name, and another account's topic cannot even be asked for", async () => {
    const { token } = await account("a");
    for (const query of [
      `topic=&client=${client}`,
      `topic=user:other&client=${client}`,
      `topic=doc:1&client=${client}`,
      "topic=user",
      "topic=user&client=x",
    ])
      expect(await ask(upgrade(token, query)), query).toMatchObject({ ok: false, status: 400 });
  });

  it("limits how often one account may open sockets", async () => {
    const { token } = await account("a");
    expect(await ask(upgrade(token), { upgradeLimit: 2 })).toMatchObject({ ok: true });
    expect(await ask(upgrade(token), { upgradeLimit: 2 })).toMatchObject({ ok: true });
    expect(await ask(upgrade(token), { upgradeLimit: 2 })).toMatchObject({
      ok: false,
      status: 429,
    });
  });
});

describe("share topics follow who may read the link", () => {
  async function share(access: "public" | "people" = "public") {
    const owner = await account("owner");
    await pushDocs(
      db,
      owner.user.id,
      [
        {
          id: `${owner.user.id}:d1`,
          baseVersion: 0,
          title: "T",
          content: "# T",
          createdAt: now,
          editedAt: now,
        },
      ],
      now,
    );
    const made = await publishShare(db, owner.user.id, "d1", 3, DEFAULT_SHARE, now);
    if (!made.ok) throw new Error(made.error);
    if (access === "people") {
      const u = await updateShare(db, owner.user.id, "d1", { access }, DEFAULT_SHARE, now);
      if (!u.ok) throw new Error(u.error);
    }
    return { owner, slug: made.share.slug };
  }
  const topic = (slug: string) => `topic=share:${slug}&client=${client}`;

  it("lets the owner and any signed-in reader of a public link listen, on the link's own topic", async () => {
    const { owner, slug } = await share();
    const reader = await account("reader");
    const a = await ask(upgrade(owner.token, topic(slug)));
    const b = await ask(upgrade(reader.token, topic(slug)));
    expect(a).toMatchObject({ ok: true, topic: expect.stringMatching(/^share:/) });
    expect(b).toMatchObject({ ok: true });
    if (a.ok && b.ok) expect(a.topic).toBe(b.topic); // the same room for both
  });

  it("is not found for a link that does not exist or has expired", async () => {
    const { owner, slug } = await share(); // published for 3 days
    expect(await ask(upgrade(owner.token, topic("nosuchslug")))).toMatchObject({
      ok: false,
      status: 404,
    });
    // a reader who signs in after it ran out (the owner's own session is only a day long)
    const later = now + 4 * DAY;
    const reader = await signup(db, { email: "late@x.co", password }, later);
    if ("error" in reader) throw new Error(reader.error);
    const result = await authorizeUpgrade(upgrade(reader.token, topic(slug)), {
      db,
      mailEnabled: false,
      now: later,
    });
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("keeps a private link to the people invited to it, and tells everyone else it is not there", async () => {
    const { owner, slug } = await share("people");
    const invited = await account("invited");
    const stranger = await account("stranger");
    const added = await addPerson(db, owner.user.id, "d1", "invited@x.co", now);
    if (!added.ok) throw new Error(added.error);
    expect(await ask(upgrade(owner.token, topic(slug)))).toMatchObject({ ok: true });
    expect(await ask(upgrade(invited.token, topic(slug)))).toMatchObject({ ok: true });
    expect(await ask(upgrade(stranger.token, topic(slug)))).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("does not let a suspended owner's link keep a room open", async () => {
    const { owner, slug } = await share();
    const reader = await account("reader");
    await db.update(users).set({ suspendedAt: now }).where(eq(users.id, owner.user.id));
    expect(await ask(upgrade(reader.token, topic(slug)))).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

describe("a draft's room", () => {
  async function room() {
    const owner = await account("owner");
    await pushDocs(
      db,
      owner.user.id,
      [
        {
          id: `${owner.user.id}:d1`,
          baseVersion: 0,
          title: "Notes",
          content: "# Notes",
          createdAt: now,
          editedAt: now,
        },
      ],
      now,
    );
    const on = await enableCollab(db, owner.user.id, "d1", { docs: 2 }, now);
    if (!on.ok) throw new Error(on.error);
    return owner;
  }
  const doc = (owner: { user: { id: string } }) => `topic=doc:${owner.user.id}:d1&client=${client}`;
  const ask2 = (request: Request, over: Record<string, unknown> = {}) =>
    authorizeUpgrade(request, { db, mailEnabled: false, now, ...over });

  it("opens for the owner, and for a person they invited, as a connection that may write", async () => {
    const owner = await room();
    const bea = await account("bea");
    const added = await addEditor(db, owner.user, "d1", "bea@x.co", 3, now);
    if (!added.ok) throw new Error(added.error);
    const a = await ask2(upgrade(owner.token, doc(owner)));
    const b = await ask2(upgrade(bea.token, doc(owner)));
    expect(a).toMatchObject({
      ok: true,
      topic: `doc:${owner.user.id}:d1`,
      doc: { isOwner: true, canWrite: true },
    });
    expect(b).toMatchObject({
      ok: true,
      topic: `doc:${owner.user.id}:d1`,
      doc: { isOwner: false, name: "bea" },
    });
  });

  it("is not found for anyone else, for an unconfirmed invitee, and when the draft is not live", async () => {
    const owner = await room();
    const cy = await account("cy");
    expect(await ask2(upgrade(cy.token, doc(owner)))).toMatchObject({ ok: false, status: 404 });
    expect(
      await ask2(upgrade(owner.token, `topic=doc:${owner.user.id}:nope&client=${client}`)),
    ).toMatchObject({ ok: false, status: 404 });
    // the owner's account cannot be used to ask for someone else's draft by writing their id
    expect(
      await ask2(upgrade(cy.token, `topic=doc:${cy.user.id}:d1&client=${client}`)),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("gives a short life, so a removal, a suspension or the kill switch takes effect within minutes", async () => {
    const owner = await room();
    const result = await ask2(upgrade(owner.token, doc(owner)));
    if (!result.ok) throw new Error(result.error);
    expect(result.expiresAt).toBe(now + 15 * 60_000);
  });

  it("is closed by the kill switch, and by the owner's limits", async () => {
    const owner = await room();
    expect(await ask2(upgrade(owner.token, doc(owner)), { collabOpen: false })).toMatchObject({
      ok: false,
      status: 503,
      error: "collab_closed",
    });
    const off = async () => ({ collab_enabled: false, collab_people: 3 });
    expect(await ask2(upgrade(owner.token, doc(owner)), { ownerLimits: off })).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("says how many people the room takes, from the owner's limit", async () => {
    const owner = await room();
    const limits = async () => ({ collab_enabled: true, collab_people: 5 });
    const result = await ask2(upgrade(owner.token, doc(owner)), { ownerLimits: limits });
    expect(result).toMatchObject({ ok: true, doc: { people: 5 } });
  });
});
