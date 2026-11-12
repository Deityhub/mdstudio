import { afterEach, describe, expect, it, vi } from "vitest";
import { collabApi, CollabError } from "./api";

const answer = (status: number, body: unknown = {}) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
afterEach(() => vi.unstubAllGlobals());

describe("collabApi", () => {
  it("reads what is shared with me", async () => {
    answer(200, { drafts: [{ ownerId: "o", id: "d", title: "T", ownerName: null, updatedAt: 1 }] });
    expect(await collabApi.shared()).toHaveLength(1);
  });

  it("sends an invitation as JSON and returns the list", async () => {
    answer(200, { editors: [{ id: "e1", email: "a@b.co", createdAt: 1 }], emailed: true });
    const r = await collabApi.invite("d1", "a@b.co");
    expect(r.emailed).toBe(true);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("/api/collab/d1/editors");
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ email: "a@b.co" }) });
  });

  it.each([
    [400, {}, "invalid"],
    [404, {}, "not_found"],
    [403, { error: "limit_reached" }, "limit_reached"],
    [403, { error: "collab_closed" }, "closed"],
    [429, {}, "too_many"],
    [503, { error: "collab_unavailable" }, "closed"],
    [500, {}, "failed"],
  ])("explains a %i answer", async (status, body, code) => {
    answer(status, body);
    await expect(collabApi.start("d1")).rejects.toEqual(new CollabError(code as never));
  });

  it("leaves a draft by its owner and id", async () => {
    answer(200, { ok: true });
    await collabApi.leave("o 1", "d1");
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/api/collab/doc/o%201/d1");
  });
});
