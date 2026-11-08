import { expect, test, type APIRequestContext } from "@playwright/test";
import { SITE, mailTo, sentTo, unique } from "./mail-server";
import { type Account, account, shareDraft } from "./review-helpers";

// Reviewing a shared copy: who can open it, comments, and the emails around them. Accounts here
// are real ones on the server that confirms addresses (see playwright.config.ts).
test.use({ baseURL: SITE });

const comment = (a: Account, slug: string, body: string, extra: Record<string, unknown> = {}) =>
  a.request.post(`/api/s/${slug}/comments`, {
    data: { body, line: 3, snippet: "Ship on Friday.", ...extra },
  });

test("the owner sets who can open a link and whether readers may comment", async ({
  playwright,
}) => {
  const owner = await account(playwright, "own");
  const { id } = await shareDraft(owner);
  let listed = await (await owner.request.get("/api/share")).json();
  expect(listed.shares[0]).toMatchObject({ access: "public", comments: false });
  expect(listed.privateLinks).toBe(true);

  const changed = await owner.request.patch(`/api/share/${id}`, {
    data: { access: "people", comments: true },
  });
  expect(changed.status()).toBe(200);
  listed = await (await owner.request.get("/api/share")).json();
  expect(listed.shares[0]).toMatchObject({ access: "people", comments: true });

  for (const bad of [{}, { access: "everyone" }, { comments: "yes" }, { days: 99 }])
    expect(
      (await owner.request.patch(`/api/share/${id}`, { data: bad })).status(),
      JSON.stringify(bad),
    ).toBe(400);
  expect(
    (
      await owner.request.patch(`/api/share/${id}`, {
        data: { comments: false },
        headers: { origin: "https://evil.example" },
      })
    ).status(),
  ).toBe(403);
});

test("a private link is invited by email, and only invited, confirmed people reach its comments", async ({
  playwright,
}) => {
  const owner = await account(playwright, "owner");
  const reviewer = await account(playwright, "reviewer");
  const outsider = await account(playwright, "outsider");
  const { id, slug } = await shareDraft(owner, { access: "people", comments: true });

  // not invited yet: not even the owner's reviewer can see that it exists
  expect((await comment(reviewer, slug, "Hello")).status()).toBe(404);

  const added = await owner.request.post(`/api/share/${id}/people`, {
    data: { email: reviewer.email },
  });
  expect(added.status()).toBe(200);
  const body = await added.json();
  expect(body.people).toEqual([expect.objectContaining({ email: reviewer.email })]);
  expect(body.emailed).toBe(true);
  const invite = await mailTo(reviewer.email, /invited/i);
  expect(invite.text).toContain(`/s/${slug}`);
  // adding the same address again sends nothing more
  await owner.request.post(`/api/share/${id}/people`, { data: { email: reviewer.email } });
  await new Promise((r) => setTimeout(r, 400));
  expect(sentTo(reviewer.email, /invited/i)).toBe(1);

  expect((await comment(reviewer, slug, "Looks good")).status()).toBe(200);
  expect((await comment(outsider, slug, "Let me in")).status()).toBe(404);
  expect((await outsider.request.get(`/api/s/${slug}/comments`)).status()).toBe(404);
  const anon = await playwright.request.newContext({ baseURL: SITE });
  expect((await anon.get(`/api/s/${slug}/comments`)).status()).toBe(401);

  // an address with no account is invited the same way and the answer reveals nothing
  const ghost = await owner.request.post(`/api/share/${id}/people`, {
    data: { email: `nobody-${unique()}@example.com` },
  });
  expect(ghost.status()).toBe(200);

  // other accounts cannot manage someone else's list
  expect((await outsider.request.get(`/api/share/${id}/people`)).status()).toBe(404);
  expect(
    (
      await outsider.request.post(`/api/share/${id}/people`, { data: { email: "x@example.com" } })
    ).status(),
  ).toBe(404);
  const person = body.people[0].id as string;
  expect((await outsider.request.delete(`/api/share/${id}/people/${person}`)).status()).toBe(404);
  expect((await owner.request.delete(`/api/share/${id}/people/${person}`)).status()).toBe(200);
  expect((await comment(reviewer, slug, "Still here?")).status()).toBe(404); // removed
  expect(
    (
      await owner.request.post(`/api/share/${id}/people`, { data: { email: owner.email } })
    ).status(),
  ).toBe(400);
});

test("comments: written, replied to, resolved and removed, as plain text", async ({
  playwright,
}) => {
  const owner = await account(playwright, "o");
  const reviewer = await account(playwright, "r");
  const { id, slug } = await shareDraft(owner, { comments: true });

  const first = await (
    await comment(reviewer, slug, "<img src=x onerror=alert(1)> Needs a date")
  ).json();
  expect(first.comment).toMatchObject({
    body: "<img src=x onerror=alert(1)> Needs a date",
    mine: true,
    outdated: false,
  });
  expect(JSON.stringify(first)).not.toContain(reviewer.email);
  const reply = await comment(owner, slug, "Added", { parentId: first.comment.id });
  expect(reply.status()).toBe(200);
  expect((await comment(reviewer, slug, "x".repeat(2001))).status()).toBe(400);
  expect((await comment(reviewer, slug, "   ")).status()).toBe(400);
  expect(
    (
      await comment(reviewer, slug, "nested", { parentId: (await reply.json()).comment.id })
    ).status(),
  ).toBe(400);

  const seen = await (await reviewer.request.get(`/api/s/${slug}/comments`)).json();
  expect(seen.comments).toHaveLength(2);
  const all = await (await owner.request.get(`/api/share/${id}/comments`)).json();
  expect(all.comments).toHaveLength(2);

  // only the owner resolves, only the author (or the owner) deletes
  const cid = first.comment.id as string;
  expect(
    (
      await reviewer.request.patch(`/api/share/${id}/comments/${cid}`, { data: { resolved: true } })
    ).status(),
  ).toBe(404);
  expect(
    (
      await owner.request.patch(`/api/share/${id}/comments/${cid}`, { data: { resolved: true } })
    ).status(),
  ).toBe(200);
  expect(
    (await (await owner.request.get(`/api/share/${id}/comments`)).json()).comments.find(
      (c: { id: string }) => c.id === cid,
    ).resolved,
  ).toBe(true);
  expect((await owner.request.delete(`/api/s/${slug}/comments/${cid}`)).status()).toBe(404); // the reader route is for your own
  expect((await reviewer.request.delete(`/api/s/${slug}/comments/${cid}`)).status()).toBe(200);
  expect((await (await owner.request.get(`/api/share/${id}/comments`)).json()).comments).toEqual(
    [],
  ); // the reply went too
});

test("comments stay off until allowed, and cross-site posts are refused", async ({
  playwright,
}) => {
  const owner = await account(playwright, "off");
  const reviewer = await account(playwright, "rv");
  const { id, slug } = await shareDraft(owner); // comments off
  expect((await comment(reviewer, slug, "Hello")).status()).toBe(403);
  expect((await reviewer.request.get(`/api/s/${slug}/comments`)).status()).toBe(404);
  await owner.request.patch(`/api/share/${id}`, { data: { comments: true } });
  const cross = await reviewer.request.post(`/api/s/${slug}/comments`, {
    data: { body: "x", line: 1 },
    headers: { origin: "https://evil.example" },
  });
  expect(cross.status()).toBe(403);
  expect((await comment(reviewer, slug, "Fine")).status()).toBe(200);
});

test("the writer is emailed about a comment, once an hour, without its text", async ({
  playwright,
}) => {
  const owner = await account(playwright, "mailed");
  const reviewer = await account(playwright, "writer");
  const { slug } = await shareDraft(owner, { comments: true });
  await comment(reviewer, slug, "A secret remark");
  const mail = await mailTo(owner.email, /New comment/i);
  expect(mail.text).toContain(`/s/${slug}`);
  expect(mail.text).not.toContain("secret remark");
  await comment(reviewer, slug, "A second one");
  await new Promise((r) => setTimeout(r, 500));
  expect(sentTo(owner.email, /New comment/i)).toBe(1);
  // commenting on your own link tells nobody
  await comment(owner, slug, "Note to self");
  await new Promise((r) => setTimeout(r, 400));
  expect(sentTo(owner.email, /New comment/i)).toBe(1);
});
