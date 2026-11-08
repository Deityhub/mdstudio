// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { githubConnections, githubPublications, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { sha256Hex } from "../auth/tokens";
import { pushDocs } from "../sync/service";
import { importTokenKey, sealToken } from "./crypto";
import { fakeGithub } from "./fake";
import {
  getPublications,
  listBranches,
  listRepos,
  publishFile,
  publishGist,
  removePublicationsOf,
} from "./publish";

const urls = { web: "https://github.test", api: "https://api.github.test" };
const t0 = Date.UTC(2026, 10, 12, 8, 5);
const png = "data:image/png;base64,iVBORw0KGgo=";
const TEXT = "# Launch notes\n\nFirst version\n\n![pic](images/pic.png)\n";
let db: Db;
let key: CryptoKey;
let gh: ReturnType<typeof fakeGithub>;

const raw = btoa(String.fromCharCode(...new Uint8Array(32).fill(4)));
const draft = (over: Record<string, unknown> = {}) => ({
  id: "a:d1",
  baseVersion: 0,
  title: "Launch notes",
  content: TEXT,
  createdAt: t0 - 1000,
  editedAt: t0,
  ...over,
});
const connect = async (userId = "a", token = "gho_fake") =>
  db.insert(githubConnections).values({
    userId,
    githubUserId: "7",
    login: "octo",
    scope: "public_repo gist",
    tokenSealed: await sealToken(key, token, userId),
    createdAt: t0,
    updatedAt: t0,
  });
const file = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  repo: "octo/blog",
  branch: "main",
  path: "posts/launch.md",
  mode: "commit" as const,
  images: { "pic.png": png },
  ...over,
});
const publish = (over: Record<string, unknown> = {}, at = t0) =>
  publishFile(db, key, urls, "a", file(over) as never, gh.fetch, at);
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  key = (await importTokenKey(raw))!;
  gh = fakeGithub();
  gh.addRepo("octo/blog", { files: { "README.md": "# blog" } });
  for (const id of ["a", "b"])
    await db.insert(users).values({ id, email: `${id}@x.co`, createdAt: t0, updatedAt: t0 });
  await pushDocs(db, "a", [draft()], t0);
  await connect();
});

describe("publishFile, committing", () => {
  it("commits the cloud text and its images beside it, and remembers where", async () => {
    const r = ok(await publish());
    expect(r.result).toMatchObject({
      kind: "file",
      url: "https://github.test/octo/blog/blob/main/posts/launch.md",
    });
    expect(gh.fileAt("octo/blog", "main", "posts/launch.md")?.content).toBe(TEXT);
    const image = gh.fileAt("octo/blog", "main", "posts/images/pic.png");
    expect(image).toMatchObject({ content: "iVBORw0KGgo=", encoding: "base64" });
    expect(gh.fileAt("octo/blog", "main", "README.md")?.content).toBe("# blog"); // the rest stays
    const [pub] = await getPublications(db, "a", "d1");
    expect(pub).toMatchObject({
      kind: "file",
      repo: "octo/blog",
      branch: "main",
      path: "posts/launch.md",
      hash: await sha256Hex(TEXT),
    });
  });

  it("uses the text in the cloud, not anything sent with the request", async () => {
    ok(await publish({ content: "# Not this" }));
    expect(gh.fileAt("octo/blog", "main", "posts/launch.md")?.content).toBe(TEXT);
  });

  it("puts images that are pasted into the text in files too, so no base64 is committed", async () => {
    await pushDocs(
      db,
      "a",
      [draft({ baseVersion: 1, content: `# T\n\n![x](${png})\n`, editedAt: t0 + 1 })],
      t0 + 1,
    );
    ok(await publish({ images: {} }));
    const text = gh.fileAt("octo/blog", "main", "posts/launch.md")!.content;
    expect(text).toBe("# T\n\n![x](images/inline-1.png)\n");
    expect(gh.fileAt("octo/blog", "main", "posts/images/inline-1.png")?.content).toBe(
      "iVBORw0KGgo=",
    );
  });

  it("sends only the images the text refers to", async () => {
    ok(await publish({ images: { "pic.png": png, "unused.png": png } }));
    expect(gh.fileAt("octo/blog", "main", "posts/images/unused.png")).toBeUndefined();
  });

  it("edits the same file on the next publish, without asking", async () => {
    ok(await publish());
    await pushDocs(
      db,
      "a",
      [draft({ baseVersion: 1, content: "# Two\n", editedAt: t0 + 5 })],
      t0 + 5,
    );
    const r = ok(await publish({}, t0 + 10));
    expect(r.result.kind).toBe("file");
    expect(gh.fileAt("octo/blog", "main", "posts/launch.md")?.content).toBe("# Two\n");
    const [pub] = await getPublications(db, "a", "d1");
    expect(pub!.hash).toBe(await sha256Hex("# Two\n"));
  });

  it("asks before replacing a file it did not publish, and writes nothing meanwhile", async () => {
    gh.commitFile("octo/blog", "main", "posts/launch.md", "someone's own text");
    const head = gh.repos.get("octo/blog")!.branches.get("main");
    expect(await publish()).toEqual({ ok: false, error: "exists" });
    expect(gh.repos.get("octo/blog")!.branches.get("main")).toBe(head);
    ok(await publish({ overwrite: true }));
    expect(gh.fileAt("octo/blog", "main", "posts/launch.md")?.content).toBe(TEXT);
  });

  it("asks again when the file was changed on GitHub since the last publish", async () => {
    ok(await publish());
    gh.commitFile("octo/blog", "main", "posts/launch.md", "edited on github");
    expect(await publish({}, t0 + 5)).toEqual({ ok: false, error: "exists" });
  });

  it("names a missing repository, branch or permission", async () => {
    expect(await publish({ repo: "octo/nope" })).toEqual({ ok: false, error: "repo_not_found" });
    expect(await publish({ branch: "gone" })).toEqual({ ok: false, error: "branch_not_found" });
    gh.addRepo("octo/readonly", { push: false });
    expect(await publish({ repo: "octo/readonly" })).toEqual({ ok: false, error: "no_access" });
  });
});

describe("publishFile, as a pull request", () => {
  it("puts the change on a new branch and opens a pull request, leaving the base alone", async () => {
    const base = gh.repos.get("octo/blog")!.branches.get("main");
    const r = ok(await publish({ mode: "pull_request" }));
    expect(r.result).toMatchObject({
      kind: "file",
      pullUrl: "https://github.com/octo/blog/pull/1",
    });
    expect(gh.repos.get("octo/blog")!.branches.get("main")).toBe(base);
    const branch = "mdstudio/launch-notes-20261112-0805";
    expect(gh.fileAt("octo/blog", branch, "posts/launch.md")?.content).toBe(TEXT);
    expect(gh.repos.get("octo/blog")!.pulls[0]).toMatchObject({
      head: branch,
      base: "main",
      title: "Add posts/launch.md",
    });
  });

  it("does not claim the file is on the base branch until the pull request is merged", async () => {
    ok(await publish({ mode: "pull_request" }));
    // a second publish while the first is still open must not ask about a file that is not there
    ok(await publish({ mode: "pull_request" }, t0 + 60_000));
    expect(gh.repos.get("octo/blog")!.pulls).toHaveLength(2);
  });
});

describe("publishFile, branch names", () => {
  it("adds a number when the pull request branch for that minute is taken", async () => {
    ok(await publish({ mode: "pull_request" }));
    ok(await publish({ mode: "pull_request", path: "posts/other.md" })); // same minute, same title
    const heads = gh.repos.get("octo/blog")!.pulls.map((p) => p.head);
    expect(heads).toEqual([
      "mdstudio/launch-notes-20261112-0805",
      "mdstudio/launch-notes-20261112-0805-2",
    ]);
  });
});

describe("publishFile, refusing", () => {
  it("only publishes the caller's own live cloud drafts", async () => {
    expect(await publish({ id: "nope" })).toEqual({ ok: false, error: "not_found" });
    expect(await publishFile(db, key, urls, "b", file() as never, gh.fetch, t0)).toEqual({
      ok: false,
      error: "not_found",
    });
    await pushDocs(db, "a", [draft({ baseVersion: 1, deleted: true, editedAt: t0 + 1 })], t0 + 1);
    expect(await publish()).toEqual({ ok: false, error: "not_found" });
  });

  it("needs a connection, and forgets one that GitHub no longer honours", async () => {
    await db.delete(githubConnections);
    expect(await publish()).toEqual({ ok: false, error: "not_connected" });
    await connect();
    gh.revoke();
    expect(await publish()).toEqual({ ok: false, error: "not_connected" });
    expect(await db.select().from(githubConnections)).toHaveLength(0);
  });

  it("refuses paths, repositories, branches and images that are not what they should be", async () => {
    for (const bad of [
      { path: "../x.md" },
      { path: "/abs.md" },
      { path: ".git/hooks/x" },
      { repo: "a/b/c" },
      { repo: "octo" },
      { branch: "a..b" },
      { mode: "force" },
      { images: { "../evil.png": png } },
      { images: { "a.png": "data:text/html;base64,AAAA" } },
    ])
      expect(await publish(bad)).toEqual({ ok: false, error: "invalid" });
    expect(gh.calls).toHaveLength(0); // nothing reached GitHub
  });

  it("refuses too many or too large images", async () => {
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`p${i}.png`, png]));
    expect(await publish({ images: many })).toEqual({ ok: false, error: "too_large" });
    const big = `data:image/png;base64,${"A".repeat(6_000_100)}`;
    expect(await publish({ images: { "pic.png": big } })).toEqual({
      ok: false,
      error: "too_large",
    });
  });

  it("reports a branch that moved while it worked as a conflict", async () => {
    const real = gh.fetch;
    let moved = false;
    const racing: typeof fetch = async (input, init) => {
      // someone else commits just before the branch is updated
      if (!moved && init?.method === "PATCH") {
        moved = true;
        gh.commitFile("octo/blog", "main", "other.md", "x");
      }
      return real(input, init);
    };
    const r = await publishFile(db, key, urls, "a", file() as never, racing, t0);
    expect(r).toEqual({ ok: false, error: "conflict" });
  });

  it("never returns or sends the token anywhere but GitHub", async () => {
    const r = JSON.stringify(await publish());
    expect(r).not.toContain("gho_");
    expect(JSON.stringify(await db.select().from(githubPublications))).not.toContain("gho_");
  });
});

describe("publishGist", () => {
  it("makes a secret gist by default, and updates the same one afterwards", async () => {
    const first = ok(await publishGist(db, key, urls, "a", { id: "d1" }, gh.fetch, t0));
    expect(first.result).toMatchObject({
      kind: "gist",
      url: expect.stringContaining("gist.github.com"),
    });
    const [id] = [...gh.gists.keys()];
    expect(gh.gists.get(id!)).toMatchObject({ public: false, files: { "launch-notes.md": TEXT } });

    await pushDocs(
      db,
      "a",
      [draft({ baseVersion: 1, content: "# Two\n", editedAt: t0 + 5 })],
      t0 + 5,
    );
    ok(
      await publishGist(db, key, urls, "a", { id: "d1", description: "Notes" }, gh.fetch, t0 + 10),
    );
    expect(gh.gists.size).toBe(1);
    expect(gh.gists.get(id!)).toMatchObject({
      description: "Notes",
      files: { "launch-notes.md": "# Two\n" },
    });
    expect((await getPublications(db, "a", "d1")).map((p) => p.kind)).toEqual(["gist"]);
  });

  it("can be public, takes a file name, and starts a new gist when the old one is gone", async () => {
    ok(
      await publishGist(
        db,
        key,
        urls,
        "a",
        { id: "d1", public: true, filename: "notes.md" },
        gh.fetch,
        t0,
      ),
    );
    expect([...gh.gists.values()][0]).toMatchObject({ public: true, files: { "notes.md": TEXT } });
    gh.pretend.gistsGone = true;
    ok(
      await publishGist(
        db,
        key,
        urls,
        "a",
        { id: "d1", public: true, filename: "notes.md" },
        gh.fetch,
        t0 + 1,
      ),
    );
    expect(gh.gists.size).toBe(2);
  });

  it("refuses odd file names and drafts that are not the caller's", async () => {
    expect(
      await publishGist(db, key, urls, "a", { id: "d1", filename: "../x" }, gh.fetch, t0),
    ).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await publishGist(db, key, urls, "b", { id: "d1" }, gh.fetch, t0)).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("keeps a file and a gist record apart", async () => {
    ok(await publish());
    ok(await publishGist(db, key, urls, "a", { id: "d1" }, gh.fetch, t0));
    expect((await getPublications(db, "a", "d1")).map((p) => p.kind).sort()).toEqual([
      "file",
      "gist",
    ]);
  });
});

describe("repositories and branches", () => {
  it("lists the repositories the writer can push to, most recent first", async () => {
    gh.addRepo("octo/readonly", { push: false });
    gh.addRepo("octo/secret", { private: true });
    const r = ok(await listRepos(db, key, urls, "a", gh.fetch));
    expect(r.repos).toEqual([
      { fullName: "octo/blog", private: false, defaultBranch: "main" },
      { fullName: "octo/secret", private: true, defaultBranch: "main" },
    ]);
  });

  it("lists a repository's branches, and says when it is not there", async () => {
    gh.repos.get("octo/blog")!.branches.set("dev", "x");
    expect(ok(await listBranches(db, key, urls, "a", "octo/blog", gh.fetch))).toMatchObject({
      branches: ["main", "dev"],
      defaultBranch: "main",
    });
    expect(await listBranches(db, key, urls, "a", "octo/nope", gh.fetch)).toEqual({
      ok: false,
      error: "repo_not_found",
    });
    expect(await listBranches(db, key, urls, "a", "bad repo", gh.fetch)).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("what is remembered", () => {
  it("is only the owner's, and goes when the draft does", async () => {
    ok(await publish());
    expect(await getPublications(db, "b", "d1")).toEqual([]);
    await pushDocs(db, "a", [draft({ baseVersion: 1, deleted: true, editedAt: t0 + 1 })], t0 + 1);
    expect(await db.select().from(githubPublications)).toHaveLength(0);
  });

  it("can be cleared for a draft directly", async () => {
    ok(await publish());
    await removePublicationsOf(db, "a:d1");
    expect(await getPublications(db, "a", "d1")).toEqual([]);
  });
});
