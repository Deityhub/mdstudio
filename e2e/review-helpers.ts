import { expect, type APIRequestContext } from "@playwright/test";
import { SITE, asVisitor, linkIn, mailTo, signUp, unique } from "./mail-server";

export type Account = { request: APIRequestContext; email: string; id: string };

export async function account(
  playwright: typeof import("@playwright/test").playwright,
  name: string,
): Promise<Account> {
  const request = await playwright.request.newContext({ baseURL: SITE });
  const email = `${name}-${unique()}@example.com`;
  const ip = asVisitor();
  expect((await signUp(request, email, ip)).status()).toBe(200);
  await request.post("/api/auth/verify/resend", { data: { force: true } });
  const link = linkIn(await mailTo(email, /confirm/i));
  await request.get(link.pathname + link.search, { maxRedirects: 0 });
  const id = (await (await request.get("/api/auth/me")).json()).user.id as string;
  return { request, email, id };
}

/** Pushes a cloud draft and publishes it with the given settings. */
export async function shareDraft(owner: Account, settings: Record<string, unknown> = {}) {
  const id = `d${Math.random().toString(36).slice(2, 8)}`;
  await owner.request.post("/api/sync/push", {
    data: {
      docs: [
        {
          id: `${owner.id}:${id}`,
          baseVersion: 0,
          title: "Quarterly plan",
          content: "# Quarterly plan\n\nShip on Friday.",
          createdAt: Date.now(),
          editedAt: Date.now(),
        },
      ],
    },
  });
  const { share } = await (
    await owner.request.post("/api/share", { data: { id, days: 3 } })
  ).json();
  if (Object.keys(settings).length)
    expect((await owner.request.patch(`/api/share/${id}`, { data: settings })).status()).toBe(200);
  return { id, slug: share.slug as string };
}
