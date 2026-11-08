// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { users } from "../../../infra/db/schema";
import type { PublicUser } from "../auth/service";
import type { Db } from "../db";
import { pushDocs } from "../sync/service";
import { loadPage } from "./page";
import { addPerson } from "./people";
import { DEFAULT_SHARE, publishShare, updateShare } from "./service";

const t0 = 1_700_000_000_000;
let db: Db;
const who = (id: string, over: Partial<PublicUser> = {}): PublicUser => ({
  id,
  email: `${id}@x.co`,
  displayName: null,
  emailVerified: true,
  ...over,
});

async function link(settings: Parameters<typeof updateShare>[3] = {}) {
  await pushDocs(
    db,
    "a",
    [
      {
        id: "a:d1",
        baseVersion: 0,
        title: "Plan",
        content: "# Plan\n\nBody",
        createdAt: t0,
        editedAt: t0,
      },
    ],
    t0,
  );
  const r = await publishShare(db, "a", "d1", 3, DEFAULT_SHARE, t0);
  if (!r.ok) throw new Error(r.error);
  if (Object.keys(settings).length) await updateShare(db, "a", "d1", settings, DEFAULT_SHARE, t0);
  return r.share.slug;
}

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  for (const id of ["a", "b", "c"])
    await db.insert(users).values({ id, email: `${id}@x.co`, createdAt: t0, updatedAt: t0 });
});

describe("loadPage", () => {
  it("a public link gives the same data to everyone, signed in or not, so it can be cached", async () => {
    const slug = await link({ comments: true });
    const anon = await loadPage(db, slug, null, t0);
    const signedIn = await loadPage(db, slug, who("c"), t0);
    expect(anon).toEqual(signedIn);
    expect(anon).toMatchObject({ kind: "public", title: "Plan", comments: true });
    expect(JSON.stringify(anon)).not.toMatch(/isOwner|"a"/);
  });

  it("a private link asks a signed-out reader to sign in, and reveals nothing else about it", async () => {
    const slug = await link({ access: "people" });
    expect(await loadPage(db, slug, null, t0)).toEqual({ kind: "sign_in" });
  });

  it("a private link opens for the owner and the invited, and is not found for anyone else", async () => {
    const slug = await link({ access: "people", comments: true });
    await addPerson(db, "a", "d1", "b@x.co", t0);
    expect(await loadPage(db, slug, who("a"), t0)).toMatchObject({
      kind: "private",
      isOwner: true,
    });
    expect(await loadPage(db, slug, who("b"), t0)).toMatchObject({
      kind: "private",
      isOwner: false,
      comments: true,
    });
    expect(await loadPage(db, slug, who("c"), t0)).toBeNull();
  });

  it("is null for an unknown or expired link", async () => {
    const slug = await link();
    expect(await loadPage(db, "nope", null, t0)).toBeNull();
    expect(await loadPage(db, slug, null, t0 + 4 * 86_400_000)).toBeNull();
  });
});
