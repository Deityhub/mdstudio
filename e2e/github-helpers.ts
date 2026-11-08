import { expect, type Browser, type Page } from "@playwright/test";
import { SITE } from "./mail-server";
import { account, type Account } from "./review-helpers";

// Shared by the specs about publishing to GitHub (see playwright.config.ts for the fake GitHub).
export const GITHUB = process.env["E2E_GITHUB_URL"]!;
export const png = "data:image/png;base64,iVBORw0KGgo=";
export const unique = () => Math.random().toString(36).slice(2, 8);

export const fileOn = async (repo: string, branch: string, path: string) => {
  const r = await fetch(`${GITHUB}/__file?${new URLSearchParams({ repo, branch, path })}`);
  return r.ok ? ((await r.json()) as { content: string; encoding: string }) : null;
};

export async function writer(
  playwright: typeof import("@playwright/test").playwright,
  browser: Browser,
  name: string,
  { connect = true }: { connect?: boolean } = {},
) {
  const acct: Account = await account(playwright, name);
  const context = await browser.newContext({
    baseURL: SITE,
    storageState: await acct.request.storageState(),
  });
  const page = await context.newPage();
  if (connect) {
    await page.goto("/api/github/connect");
    await expect(page.getByText("GitHub connected")).toBeVisible();
  }
  const id = `d${unique()}`;
  const content = "# Notes\n\nA paragraph.\n\n![pic](images/pic.png)\n";
  await acct.request.post("/api/sync/push", {
    data: {
      docs: [
        {
          id: `${acct.id}:${id}`,
          baseVersion: 0,
          title: "Notes",
          content,
          createdAt: Date.now(),
          editedAt: Date.now(),
        },
      ],
    },
  });
  return { acct, context, page, id, content };
}
export const publish = (page: Page, body: Record<string, unknown>) =>
  page.request.post("/api/github/publish", { data: body });
