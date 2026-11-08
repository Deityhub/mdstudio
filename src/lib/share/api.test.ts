import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthExpiredError, UnverifiedError } from "@/lib/sync/api";
import { ShareError, commentsApi, ownerApi, peopleApi, shareApi } from "./api";

const reply = (body: unknown, status = 200) => Response.json(body, { status });
const mockFetch = (r: Response | (() => Response)) => {
  const fn = vi.fn(async (_path: string, _init?: RequestInit) =>
    typeof r === "function" ? r() : r.clone(),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
};
afterEach(() => vi.unstubAllGlobals());

const share = { id: "d1", slug: "abc123abc123", publishedAt: 1, expiresAt: 2, hash: "h", url: "u" };

describe("shareApi", () => {
  it("lists the links with the day limits", async () => {
    const fn = mockFetch(reply({ shares: [share], defaultDays: 4, maxDays: 7 }));
    expect(await shareApi.list()).toEqual({ shares: [share], defaultDays: 4, maxDays: 7 });
    expect(fn).toHaveBeenCalledWith("/api/share", undefined);
  });

  it("publishes a draft, sending the days only when given", async () => {
    const fn = mockFetch(reply({ share, created: true }));
    await shareApi.publish("d1");
    await shareApi.publish("d1", 3);
    const bodies = fn.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies).toEqual([{ id: "d1" }, { id: "d1", days: 3 }]);
    expect((fn.mock.calls[0]![1] as RequestInit).method).toBe("POST");
  });

  it("sends who may open the link and whether readers comment when publishing", async () => {
    const fn = mockFetch(reply({ share, created: true }));
    await shareApi.publish("d1", 3, { access: "people", comments: true });
    const body = JSON.parse((fn.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ id: "d1", days: 3, access: "people", comments: true });
  });

  it("changes settings with one request, sending only what changed", async () => {
    const fn = mockFetch(reply({ share }));
    await shareApi.update("d1", { access: "people" });
    await shareApi.update("d1", { comments: false });
    const bodies = fn.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies).toEqual([{ access: "people" }, { comments: false }]);
    expect((fn.mock.calls[0]![1] as RequestInit).method).toBe("PATCH");
  });

  it("changes the expiry and revokes with the draft's id in the address", async () => {
    const fn = mockFetch(reply({ share }));
    await shareApi.extend("d 1/x", 5);
    expect(fn.mock.calls[0]![0]).toBe("/api/share/d%201%2Fx");
    expect((fn.mock.calls[0]![1] as RequestInit).method).toBe("PATCH");
    mockFetch(reply({ ok: true }));
    await shareApi.revoke("d1");
  });

  it("names what went wrong", async () => {
    mockFetch(reply({ error: "not_found" }, 404));
    await expect(shareApi.publish("x")).rejects.toMatchObject({ code: "not_found" });
    mockFetch(reply({ error: "invalid" }, 400));
    await expect(shareApi.publish("x", 99)).rejects.toMatchObject({ code: "invalid" });
    mockFetch(reply({ error: "too_many_requests" }, 429));
    await expect(shareApi.publish("x")).rejects.toMatchObject({ code: "too_many" });
    mockFetch(reply({}, 500));
    const error = await shareApi.publish("x").catch((e) => e);
    expect(error).toBeInstanceOf(ShareError);
    expect(error.code).toBe("failed");
  });

  it("passes on an ended session and an unconfirmed email so the studio can react", async () => {
    mockFetch(reply({ error: "unauthorized" }, 401));
    await expect(shareApi.list()).rejects.toBeInstanceOf(AuthExpiredError);
    mockFetch(reply({ error: "email_unverified" }, 403));
    await expect(shareApi.list()).rejects.toBeInstanceOf(UnverifiedError);
  });
});

describe("commentsApi", () => {
  const comment = {
    id: "c1",
    parentId: null,
    author: "Bea",
    mine: true,
    line: 3,
    snippet: "s",
    body: "hi",
    outdated: false,
    resolved: false,
    createdAt: 1,
  };

  it("reads the comments of a link by its address", async () => {
    const fn = mockFetch(reply({ comments: [comment] }));
    expect(await commentsApi.list("abc DEF/1")).toEqual([comment]);
    expect(fn.mock.calls[0]![0]).toBe("/api/s/abc%20DEF%2F1/comments");
  });

  it("writes one, with the block it belongs to", async () => {
    const fn = mockFetch(reply({ comment }));
    await commentsApi.add("abc", { body: "hi", line: 3, snippet: "s", parentId: "p" });
    expect(JSON.parse((fn.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      body: "hi",
      line: 3,
      snippet: "s",
      parentId: "p",
    });
    expect((fn.mock.calls[0]![1] as RequestInit).method).toBe("POST");
  });

  it("removes one, and names a full thread and a forbidden write", async () => {
    const fn = mockFetch(reply({ ok: true }));
    await commentsApi.remove("abc", "c1");
    expect(fn.mock.calls[0]![0]).toBe("/api/s/abc/comments/c1");
    expect((fn.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
    mockFetch(reply({ error: "limit_reached" }, 409));
    await expect(commentsApi.add("abc", { body: "x", line: 1 })).rejects.toMatchObject({
      code: "limit_reached",
    });
    mockFetch(reply({ error: "forbidden" }, 403));
    await expect(commentsApi.add("abc", { body: "x", line: 1 })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("peopleApi", () => {
  const people = [{ id: "p1", email: "bea@x.co" }];

  it("lists, adds and removes the people a link is shared with", async () => {
    let fn = mockFetch(reply({ people }));
    expect(await peopleApi.list("d 1")).toEqual(people);
    expect(fn.mock.calls[0]![0]).toBe("/api/share/d%201/people");
    fn = mockFetch(reply({ people, emailed: true }));
    expect(await peopleApi.add("d1", "bea@x.co")).toEqual({ people, emailed: true });
    expect(JSON.parse((fn.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      email: "bea@x.co",
    });
    fn = mockFetch(reply({ ok: true }));
    await peopleApi.remove("d1", "p/1");
    expect(fn.mock.calls[0]![0]).toBe("/api/share/d1/people/p%2F1");
    expect((fn.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("names a full list, a bad address and a feature that is off", async () => {
    mockFetch(reply({ error: "limit_reached" }, 409));
    await expect(peopleApi.add("d1", "a@x.co")).rejects.toMatchObject({ code: "limit_reached" });
    mockFetch(reply({ error: "invalid" }, 400));
    await expect(peopleApi.add("d1", "nope")).rejects.toMatchObject({ code: "invalid" });
    mockFetch(reply({ error: "feature_unavailable" }, 403));
    await expect(peopleApi.add("d1", "a@x.co")).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("ownerApi", () => {
  it("reads every comment on a link by the draft's id, and resolves or deletes one", async () => {
    let fn = mockFetch(reply({ comments: [] }));
    expect(await ownerApi.comments("d 1")).toEqual([]);
    expect(fn.mock.calls[0]![0]).toBe("/api/share/d%201/comments");
    fn = mockFetch(reply({ ok: true }));
    await ownerApi.resolve("d1", "c1", true);
    expect(fn.mock.calls[0]![0]).toBe("/api/share/d1/comments/c1");
    expect((fn.mock.calls[0]![1] as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((fn.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      resolved: true,
    });
    await ownerApi.remove("d1", "c1");
    expect((fn.mock.calls[1]![1] as RequestInit).method).toBe("DELETE");
  });
});
