import { HttpError, call } from "@/lib/sync/api";
import type { FilePublish, GistPublish, Publication, PublishResult, RepoInfo } from "./protocol";

export type GithubStatus = {
  /** Whether this server can publish to GitHub at all. */
  available: boolean;
  connected: boolean;
  login?: string;
  /** Whether private repositories were allowed when connecting. */
  private?: boolean;
};

/** What the server says when a request is refused; anything else is `failed`. */
const CODES = [
  "not_found",
  "invalid",
  "not_connected",
  "repo_not_found",
  "branch_not_found",
  "no_access",
  "exists",
  "conflict",
  "too_large",
  "github_failed",
  "feature_unavailable",
] as const;
export type GithubErrorCode = (typeof CODES)[number] | "too_many" | "failed";

/** What went wrong with a GitHub request, in terms the dialog can explain. */
export class GithubError extends Error {
  constructor(readonly code: GithubErrorCode) {
    super(`GitHub request failed (${code})`);
  }
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// An ended session and an unconfirmed email pass through as their own errors (see sync/api.ts).
async function send<T>(path: string, init?: RequestInit) {
  try {
    return await call<T>(path, init);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    if (error.status === 429) throw new GithubError("too_many");
    const known = CODES.find((c) => c === error.code);
    throw new GithubError(known ?? "failed");
  }
}

/** Where the browser goes to allow publishing (it leaves the app and comes back to the editor). */
export const connectUrl = (privateRepos: boolean) =>
  `/api/github/connect${privateRepos ? "?private=1" : ""}`;

const repoPath = (repo: string) => repo.split("/").map(encodeURIComponent).join("/");

export const githubApi = {
  status: () => send<GithubStatus>("/api/github/connection"),
  disconnect: () => send<{ ok: true }>("/api/github/connection", { method: "DELETE" }),
  repos: async () => (await send<{ repos: RepoInfo[] }>("/api/github/repos")).repos,
  branches: (repo: string) =>
    send<{ branches: string[]; defaultBranch: string }>(
      `/api/github/repos/${repoPath(repo)}/branches`,
    ),
  /** What was last published from the draft (reads only our own database). */
  publications: async (id: string) =>
    (
      await send<{ publications: Publication[] }>(
        `/api/github/publications/${encodeURIComponent(id)}`,
      )
    ).publications,
  publishFile: async (input: FilePublish) =>
    (
      await send<{ result: PublishResult }>(
        "/api/github/publish",
        json("POST", { target: "file", ...input }),
      )
    ).result,
  publishGist: async (input: GistPublish) =>
    (
      await send<{ result: PublishResult }>(
        "/api/github/publish",
        json("POST", { target: "gist", ...input }),
      )
    ).result,
};
