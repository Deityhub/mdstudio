import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthExpiredError, UnverifiedError } from "@/lib/sync/api";
import { GithubError, connectUrl, githubApi } from "./api";

const reply = (body: unknown, status = 200) => Response.json(body, { status });
const mockFetch = (r: Response) => {
  const fn = vi.fn(async (_path: string, _init?: RequestInit) => r.clone());
  vi.stubGlobal("fetch", fn);
  return fn;
};
afterEach(() => vi.unstubAllGlobals());
const sent = (fn: ReturnType<typeof mockFetch>, i = 0) =>
  JSON.parse((fn.mock.calls[i]![1] as RequestInit).body as string);

describe("connectUrl", () => {
  it("asks for private repositories only when told to", () => {
    expect(connectUrl(false)).toBe("/api/github/connect");
    expect(connectUrl(true)).toBe("/api/github/connect?private=1");
  });
});

describe("githubApi", () => {
  it("reads the connection, and disconnects", async () => {
    let fn = mockFetch(reply({ available: true, connected: true, login: "octo", private: false }));
    expect(await githubApi.status()).toEqual({
      available: true,
      connected: true,
      login: "octo",
      private: false,
    });
    expect(fn.mock.calls[0]![0]).toBe("/api/github/connection");
    fn = mockFetch(reply({ ok: true }));
    await githubApi.disconnect();
    expect((fn.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("lists repositories and the branches of one, with the name in the address", async () => {
    mockFetch(reply({ repos: [{ fullName: "octo/blog", private: false, defaultBranch: "main" }] }));
    expect(await githubApi.repos()).toEqual([
      { fullName: "octo/blog", private: false, defaultBranch: "main" },
    ]);
    const fn = mockFetch(reply({ branches: ["main"], defaultBranch: "main" }));
    expect(await githubApi.branches("octo/my repo")).toEqual({
      branches: ["main"],
      defaultBranch: "main",
    });
    expect(fn.mock.calls[0]![0]).toBe("/api/github/repos/octo/my%20repo/branches");
  });

  it("reads what was published from a draft", async () => {
    const fn = mockFetch(reply({ publications: [{ kind: "gist", url: "u" }] }));
    expect(await githubApi.publications("d 1")).toEqual([{ kind: "gist", url: "u" }]);
    expect(fn.mock.calls[0]![0]).toBe("/api/github/publications/d%201");
  });

  it("publishes a file or a gist with one request, naming the target", async () => {
    const fn = mockFetch(reply({ result: { kind: "file", url: "u" } }));
    const file = {
      id: "d1",
      repo: "octo/blog",
      branch: "main",
      path: "a.md",
      mode: "commit" as const,
    };
    expect(await githubApi.publishFile(file)).toEqual({ kind: "file", url: "u" });
    await githubApi.publishGist({ id: "d1", public: true });
    expect(sent(fn, 0)).toEqual({ target: "file", ...file });
    expect(sent(fn, 1)).toEqual({ target: "gist", id: "d1", public: true });
    expect((fn.mock.calls[0]![1] as RequestInit).method).toBe("POST");
  });

  it("names what went wrong in the server's own words", async () => {
    for (const code of [
      "exists",
      "not_connected",
      "repo_not_found",
      "branch_not_found",
      "no_access",
      "conflict",
      "too_large",
      "invalid",
      "github_failed",
      "feature_unavailable",
    ]) {
      mockFetch(reply({ error: code }, 409));
      await expect(githubApi.repos()).rejects.toMatchObject({ code });
    }
    mockFetch(reply({ error: "too_many_requests" }, 429));
    await expect(githubApi.repos()).rejects.toMatchObject({ code: "too_many" });
    mockFetch(reply({}, 500));
    const error = await githubApi.repos().catch((e) => e);
    expect(error).toBeInstanceOf(GithubError);
    expect(error.code).toBe("failed");
  });

  it("passes on an ended session and an unconfirmed email so the studio can react", async () => {
    mockFetch(reply({ error: "unauthorized" }, 401));
    await expect(githubApi.status()).rejects.toBeInstanceOf(AuthExpiredError);
    mockFetch(reply({ error: "email_unverified" }, 403));
    await expect(githubApi.status()).rejects.toBeInstanceOf(UnverifiedError);
  });
});
