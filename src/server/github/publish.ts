// Publishing a cloud draft to GitHub, independent of HTTP. The text published is the draft's copy in
// the cloud (the editor syncs first); images come with the request because they live in the
// browser. Everything goes in one commit through git's own objects (blobs, a tree, a commit and a
// branch update), so the file and its images land together or not at all. The token is opened only
// here and only ever sent to GitHub.
import { and, eq } from "drizzle-orm";
import { githubConnections, githubPublications } from "../../../infra/db/schema";
import {
  type FilePublish,
  type GistPublish,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  type Publication,
  type PublishResult,
  type RepoInfo,
  imageFile,
  imagePath,
  publishBranch,
  validBranch,
  validPath,
  validRepo,
} from "@/lib/github/protocol";
import { slugify } from "@/lib/markdown/markdown";
import { dataUriParts, extractDataImages, imageExt, pointImagesAt } from "@/lib/storage/archive";
import { LOCAL_ID, remoteId } from "@/lib/sync/protocol";
import { sha256Hex } from "../auth/tokens";
import type { Db } from "../db";
import { cloudDraft } from "../share/service";
import { type GithubUrls, apiHeaders } from "./client";
import { githubToken } from "./connect";

export type PublishError =
  | "not_found"
  | "invalid"
  | "not_connected"
  | "repo_not_found"
  | "branch_not_found"
  | "no_access"
  | "exists"
  | "conflict"
  | "too_large"
  | "github_failed";
type Fail = { ok: false; error: PublishError };

/** GitHub refused the token: it was revoked or has expired. */
class Unauthorized extends Error {}

const isImageUri = (uri: string) => {
  const parts = dataUriParts(uri);
  return !!parts && !!imageExt(parts.mime);
};

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

// GitHub's answers are read field by field after the status is checked, so they are left loose
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reply = { status: number; data: any };
function github(urls: GithubUrls, token: string, fetchFn: typeof fetch) {
  return async (method: string, path: string, body?: unknown): Promise<Reply> => {
    const res = await fetchFn(`${urls.api}${path}`, {
      method,
      headers: { ...apiHeaders(token), ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 401) throw new Unauthorized();
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null };
  };
}
type Call = ReturnType<typeof github>;

/** Opens the token, runs `work`, and turns GitHub refusing it or being unreachable into answers. */
async function withGithub<T>(
  db: Db,
  key: CryptoKey,
  urls: GithubUrls,
  userId: string,
  fetchFn: typeof fetch,
  work: (call: Call) => Promise<T | Fail>,
): Promise<T | Fail> {
  const token = await githubToken(db, key, userId);
  if (!token) return { ok: false, error: "not_connected" };
  try {
    return await work(github(urls, token, fetchFn));
  } catch (error) {
    if (error instanceof Unauthorized) {
      // revoked at GitHub: forget it, so the writer is asked to connect again
      await db.delete(githubConnections).where(eq(githubConnections.userId, userId));
      return { ok: false, error: "not_connected" };
    }
    console.error("GitHub request failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "github_failed" };
  }
}

// ---- what is remembered ----------------------------------------------------------------------

export async function getPublications(db: Db, userId: string, localId: string) {
  if (!LOCAL_ID.test(localId)) return [];
  const rows = await db
    .select()
    .from(githubPublications)
    .where(eq(githubPublications.documentId, remoteId(userId, localId)));
  return rows
    .map((r): Publication => ({
      kind: r.kind === "gist" ? "gist" : "file",
      repo: r.repo,
      branch: r.branch,
      path: r.path,
      gistId: r.gistId,
      url: r.url,
      hash: r.contentHash,
      publishedAt: r.publishedAt,
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

/** A draft that is deleted, or leaves the cloud, takes this with it. */
export const removePublicationsOf = (db: Db, documentId: string) =>
  db.delete(githubPublications).where(eq(githubPublications.documentId, documentId));

type Remember = {
  documentId: string;
  kind: "file" | "gist";
  repo?: string;
  branch?: string;
  path?: string;
  gistId?: string;
  fileSha?: string;
  commitSha?: string;
  url: string;
  contentHash: string;
  now: number;
};
async function remember(db: Db, r: Remember) {
  const set = {
    repo: r.repo ?? null,
    branch: r.branch ?? null,
    path: r.path ?? null,
    gistId: r.gistId ?? null,
    ...(r.fileSha !== undefined && { fileSha: r.fileSha }),
    commitSha: r.commitSha ?? null,
    url: r.url,
    contentHash: r.contentHash,
    publishedAt: r.now,
    updatedAt: r.now,
  };
  await db
    .insert(githubPublications)
    .values({ id: crypto.randomUUID(), documentId: r.documentId, kind: r.kind, ...set })
    .onConflictDoUpdate({
      target: [githubPublications.documentId, githubPublications.kind],
      set,
    });
}

const lastOf = async (db: Db, documentId: string, kind: "file" | "gist") =>
  (
    await db
      .select()
      .from(githubPublications)
      .where(and(eq(githubPublications.documentId, documentId), eq(githubPublications.kind, kind)))
  )[0];

// ---- repositories and branches ---------------------------------------------------------------

/** The repositories the writer can push to, most recently pushed first (up to 200). */
export const listRepos = (
  db: Db,
  key: CryptoKey,
  urls: GithubUrls,
  userId: string,
  fetchFn: typeof fetch = fetch,
) =>
  withGithub<{ ok: true; repos: RepoInfo[] }>(db, key, urls, userId, fetchFn, async (call) => {
    const repos: RepoInfo[] = [];
    for (let page = 1; page <= 2; page++) {
      const r = await call(
        "GET",
        `/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member&page=${page}`,
      );
      if (r.status !== 200) return { ok: false, error: "github_failed" };
      for (const x of r.data as {
        full_name: string;
        private: boolean;
        default_branch: string;
        permissions?: { push?: boolean };
      }[])
        if (x.permissions?.push)
          repos.push({
            fullName: x.full_name,
            private: x.private,
            defaultBranch: x.default_branch,
          });
      if (r.data.length < 100) break;
    }
    return { ok: true, repos };
  });

export function listBranches(
  db: Db,
  key: CryptoKey,
  urls: GithubUrls,
  userId: string,
  repo: string,
  fetchFn: typeof fetch = fetch,
) {
  if (!validRepo(repo)) return Promise.resolve<Fail>({ ok: false, error: "invalid" });
  return withGithub<{ ok: true; branches: string[]; defaultBranch: string }>(
    db,
    key,
    urls,
    userId,
    fetchFn,
    async (call) => {
      const info = await call("GET", `/repos/${repo}`);
      if (info.status === 404) return { ok: false, error: "repo_not_found" };
      if (info.status !== 200) return { ok: false, error: "github_failed" };
      const list = await call("GET", `/repos/${repo}/branches?per_page=100`);
      if (list.status !== 200) return { ok: false, error: "github_failed" };
      return {
        ok: true,
        branches: (list.data as { name: string }[]).map((b) => b.name),
        defaultBranch: info.data.default_branch,
      };
    },
  );
}

// ---- a file in a repository ------------------------------------------------------------------

type Checked = {
  repo: string;
  branch: string;
  path: string;
  mode: FilePublish["mode"];
  message: string | undefined;
  overwrite: boolean;
  images: Record<string, string>;
};

/** The request as a safe, tidy one, or null: nothing from it reaches GitHub before this passes. */
function checkFile(input: FilePublish): Checked | null {
  const path = typeof input.path === "string" ? validPath(input.path) : null;
  if (!path || !input.path || typeof input.repo !== "string" || !validRepo(input.repo)) return null;
  if (typeof input.branch !== "string" || !validBranch(input.branch)) return null;
  if (input.mode !== "commit" && input.mode !== "pull_request") return null;
  if (
    input.message !== undefined &&
    (typeof input.message !== "string" || input.message.length > 200)
  )
    return null;
  const images = input.images ?? {};
  if (typeof images !== "object" || images === null) return null;
  for (const [name, uri] of Object.entries(images))
    if (!imageFile(name) || typeof uri !== "string" || !isImageUri(uri)) return null;
  return {
    repo: input.repo,
    branch: input.branch,
    path,
    mode: input.mode,
    message: input.message?.replace(/\s+/g, " ").trim() || undefined,
    overwrite: input.overwrite === true,
    images,
  };
}

export async function publishFile(
  db: Db,
  key: CryptoKey,
  urls: GithubUrls,
  userId: string,
  input: FilePublish,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
): Promise<{ ok: true; result: PublishResult } | Fail> {
  const c = checkFile(input);
  if (!c) return { ok: false, error: "invalid" };
  // the request itself is capped, whatever the text ends up using
  const sent = Object.values(c.images);
  if (sent.length > MAX_IMAGES || sent.reduce((n, uri) => n + uri.length, 0) > MAX_IMAGE_BYTES)
    return { ok: false, error: "too_large" };
  const draft = typeof input.id === "string" ? await cloudDraft(db, userId, input.id) : null;
  if (!draft) return { ok: false, error: "not_found" };

  // the files that go with the text: the images it points at, and any that were pasted into it
  const inline = extractDataImages(draft.content);
  const store = {
    ...c.images,
    ...Object.fromEntries(inline.files.map((f) => [f.name, f.dataUri])),
  };
  const { content: text, used } = pointImagesAt(inline.md, store);
  const files = new Map<string, string>(); // repository path → data URI
  for (const name of used) files.set(imagePath(c.path, name), store[name]!);
  const size = [...files.values()].reduce((n, uri) => n + uri.length, 0);
  if (files.size > MAX_IMAGES || size > MAX_IMAGE_BYTES) return { ok: false, error: "too_large" };

  const hash = await sha256Hex(text);
  return withGithub(db, key, urls, userId, fetchFn, async (call) => {
    const repoInfo = await call("GET", `/repos/${c.repo}`);
    if (repoInfo.status === 404) return { ok: false, error: "repo_not_found" };
    if (repoInfo.status !== 200) return { ok: false, error: "github_failed" };
    if (!repoInfo.data.permissions?.push) return { ok: false, error: "no_access" };

    const ref = await call("GET", `/repos/${c.repo}/git/ref/heads/${encodePath(c.branch)}`);
    if (ref.status === 404) return { ok: false, error: "branch_not_found" };
    if (ref.status !== 200) return { ok: false, error: "github_failed" };
    const baseCommit: string = ref.data.object.sha;
    const commit = await call("GET", `/repos/${c.repo}/git/commits/${baseCommit}`);
    if (commit.status !== 200) return { ok: false, error: "github_failed" };

    // A file that is already there is only replaced if this draft put it there and nobody has
    // changed it since, or the writer says so.
    const there = await call(
      "GET",
      `/repos/${c.repo}/contents/${encodePath(c.path)}?ref=${encodeURIComponent(c.branch)}`,
    );
    if (there.status !== 404 && there.status !== 200) return { ok: false, error: "github_failed" };
    const exists = there.status === 200;
    const last = await lastOf(db, draft.id, "file");
    const ours = last?.repo === c.repo && last.path === c.path && last.fileSha === there.data?.sha;
    if (exists && !ours && !c.overwrite) return { ok: false, error: "exists" };

    const blob = async (content: string, encoding: "utf-8" | "base64") => {
      const r = await call("POST", `/repos/${c.repo}/git/blobs`, { content, encoding });
      if (r.status !== 201) throw new Error(`blob ${r.status}`);
      return r.data.sha as string;
    };
    const entries = [{ path: c.path, sha: await blob(text, "utf-8") }];
    for (const [path, uri] of files)
      entries.push({ path, sha: await blob(dataUriParts(uri)!.base64, "base64") });
    const tree = await call("POST", `/repos/${c.repo}/git/trees`, {
      base_tree: commit.data.tree.sha,
      tree: entries.map((e) => ({ ...e, mode: "100644", type: "blob" })),
    });
    if (tree.status !== 201) return { ok: false, error: "github_failed" };
    const message = c.message ?? `${exists ? "Update" : "Add"} ${c.path}`;
    const made = await call("POST", `/repos/${c.repo}/git/commits`, {
      message,
      tree: tree.data.sha,
      parents: [baseCommit],
    });
    if (made.status !== 201) return { ok: false, error: "github_failed" };
    const commitSha: string = made.data.sha;

    const result: PublishResult = {
      kind: "file",
      url: "",
      commitUrl: `${urls.web}/${c.repo}/commit/${commitSha}`,
    };
    let branch = c.branch;
    if (c.mode === "commit") {
      const moved = await call("PATCH", `/repos/${c.repo}/git/refs/heads/${encodePath(c.branch)}`, {
        sha: commitSha,
      });
      if (moved.status === 422) return { ok: false, error: "conflict" }; // the branch moved meanwhile
      if (moved.status !== 200) return { ok: false, error: "github_failed" };
      result.url = `${urls.web}/${c.repo}/blob/${c.branch}/${c.path}`;
    } else {
      branch = publishBranch(draft.title, now);
      const created = await call("POST", `/repos/${c.repo}/git/refs`, {
        ref: `refs/heads/${branch}`,
        sha: commitSha,
      });
      if (created.status !== 201) return { ok: false, error: "github_failed" };
      const pull = await call("POST", `/repos/${c.repo}/pulls`, {
        title: message,
        head: branch,
        base: c.branch,
        body: "",
      });
      if (pull.status !== 201) return { ok: false, error: "github_failed" };
      result.url = pull.data.html_url;
      result.pullUrl = pull.data.html_url;
    }

    await remember(db, {
      documentId: draft.id,
      kind: "file",
      repo: c.repo,
      branch: c.branch,
      path: c.path,
      // a pull request's file is not on the base branch until it is merged, so nothing to compare yet
      ...(c.mode === "commit" && { fileSha: entries[0]!.sha }),
      commitSha,
      url: result.url,
      contentHash: hash,
      now,
    });
    return { ok: true, result };
  });
}

// ---- a gist ----------------------------------------------------------------------------------

const GIST_FILE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,99}$/;

export async function publishGist(
  db: Db,
  key: CryptoKey,
  urls: GithubUrls,
  userId: string,
  input: GistPublish,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
): Promise<{ ok: true; result: PublishResult } | Fail> {
  const draft = typeof input.id === "string" ? await cloudDraft(db, userId, input.id) : null;
  if (!draft) return { ok: false, error: "not_found" };
  const slug =
    draft.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "draft";
  const filename = input.filename ?? `${slug}.md`;
  const description = input.description ?? "";
  if (typeof filename !== "string" || !GIST_FILE.test(filename) || filename.includes(".."))
    return { ok: false, error: "invalid" };
  if (typeof description !== "string" || description.length > 256)
    return { ok: false, error: "invalid" };
  if (input.public !== undefined && typeof input.public !== "boolean")
    return { ok: false, error: "invalid" };

  const hash = await sha256Hex(draft.content);
  return withGithub(db, key, urls, userId, fetchFn, async (call) => {
    const last = await lastOf(db, draft.id, "gist");
    let done: Reply | undefined;
    if (last?.gistId) {
      const oldName = last.path;
      done = await call("PATCH", `/gists/${encodeURIComponent(last.gistId)}`, {
        description,
        files: {
          [filename]: { content: draft.content },
          ...(oldName && oldName !== filename ? { [oldName]: null } : {}),
        },
      });
      if (done.status === 404)
        done = undefined; // deleted on GitHub: make a new one
      else if (done.status !== 200) return { ok: false, error: "github_failed" };
    }
    if (!done) {
      done = await call("POST", "/gists", {
        description,
        public: input.public === true,
        files: { [filename]: { content: draft.content } },
      });
      if (done.status !== 201) return { ok: false, error: "github_failed" };
    }
    const url = String(done.data.html_url);
    await remember(db, {
      documentId: draft.id,
      kind: "gist",
      gistId: String(done.data.id),
      path: filename,
      url,
      contentHash: hash,
      now,
    });
    return { ok: true, result: { kind: "gist", url } };
  });
}
