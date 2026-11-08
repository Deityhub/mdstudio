import { expect, test, type Browser, type Page } from "@playwright/test";
import { SITE } from "./mail-server";
import { account, type Account } from "./review-helpers";

// Publishing a cloud draft to GitHub through the API, against the fake GitHub (see
// playwright.config.ts). The editor's own dialog is covered in the next unit.
test.use({ baseURL: SITE });
const GITHUB = process.env["E2E_GITHUB_URL"]!;
const png = "data:image/png;base64,iVBORw0KGgo=";
const unique = () => Math.random().toString(36).slice(2, 8);

const fileOn = async (repo: string, branch: string, path: string) => {
  const r = await fetch(`${GITHUB}/__file?${new URLSearchParams({ repo, branch, path })}`);
  return r.ok ? ((await r.json()) as { content: string; encoding: string }) : null;
};

async function writer(
  playwright: typeof import("@playwright/test").playwright,
  browser: Browser,
  name: string,
  connect = true,
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
const publish = (page: Page, body: Record<string, unknown>) =>
  page.request.post("/api/github/publish", { data: body });

test("a draft is committed with its images beside it, then updated in place", async ({
  playwright,
  browser,
}) => {
  const { context, page, id, content } = await writer(playwright, browser, "gp-commit");
  const path = `posts/${unique()}.md`;
  const base = { target: "file", id, repo: "octo/blog", branch: "main", path, mode: "commit" };

  const first = await publish(page, { ...base, images: { "pic.png": png } });
  expect(first.status()).toBe(200);
  const { result } = await first.json();
  expect(result.url).toContain(`/octo/blog/blob/main/${path}`);
  expect((await fileOn("octo/blog", "main", path))?.content).toBe(content);
  const dir = path.slice(0, path.lastIndexOf("/") + 1);
  expect(await fileOn("octo/blog", "main", `${dir}images/pic.png`)).toMatchObject({
    content: "iVBORw0KGgo=",
    encoding: "base64",
  });

  // remembered, so the next publish edits the same file without asking
  const saved = await (await page.request.get(`/api/github/publications/${id}`)).json();
  expect(saved.publications).toMatchObject([{ kind: "file", repo: "octo/blog", path }]);
  expect((await publish(page, base)).status()).toBe(200);
  await context.close();
});

test("a file that is already there is only replaced when the writer says so", async ({
  playwright,
  browser,
}) => {
  const first = await writer(playwright, browser, "gp-exists-a");
  const second = await writer(playwright, browser, "gp-exists-b");
  const path = `shared-${unique()}.md`;
  const body = (id: string, over = {}) => ({
    target: "file",
    id,
    repo: "octo/blog",
    branch: "main",
    path,
    mode: "commit",
    ...over,
  });
  expect((await publish(first.page, body(first.id))).status()).toBe(200);
  // another draft aiming at the same path is not allowed to overwrite it unasked
  const refused = await publish(second.page, body(second.id));
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error).toBe("exists");
  expect((await publish(second.page, body(second.id, { overwrite: true }))).status()).toBe(200);
  await first.context.close();
  await second.context.close();
});

test("a pull request opens a new branch and leaves the base alone", async ({
  playwright,
  browser,
}) => {
  const { context, page, id } = await writer(playwright, browser, "gp-pr");
  const path = `pr-${unique()}.md`;
  const res = await publish(page, {
    target: "file",
    id,
    repo: "octo/blog",
    branch: "main",
    path,
    mode: "pull_request",
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).result.pullUrl).toMatch(/\/octo\/blog\/pull\/\d+$/);
  expect(await fileOn("octo/blog", "main", path)).toBeNull();
  const pulls = (await (await fetch(`${GITHUB}/__pulls?repo=octo/blog`)).json()) as {
    head: string;
    base: string;
  }[];
  expect(pulls.at(-1)).toMatchObject({ base: "main" });
  expect(pulls.at(-1)!.head).toMatch(/^mdstudio\/notes-\d{8}-\d{4}$/);
  await context.close();
});

test("a gist is made secret, then updated", async ({ playwright, browser }) => {
  const { context, page, id } = await writer(playwright, browser, "gp-gist");
  const first = await publish(page, { target: "gist", id });
  expect(first.status()).toBe(200);
  expect((await first.json()).result.url).toContain("gist.github.com");
  const second = await publish(page, { target: "gist", id, description: "Updated" });
  expect(second.status()).toBe(200);
  const kinds = (await (await page.request.get(`/api/github/publications/${id}`)).json())
    .publications;
  expect(kinds.map((p: { kind: string }) => p.kind)).toEqual(["gist"]);
  await context.close();
});

test("repositories and branches come from the writer's own GitHub", async ({
  playwright,
  browser,
}) => {
  const { context, page } = await writer(playwright, browser, "gp-lists");
  const repos = (await (await page.request.get("/api/github/repos")).json()).repos;
  expect(repos).toEqual([{ fullName: "octo/blog", private: false, defaultBranch: "main" }]); // not the read-only one
  const branches = await (await page.request.get("/api/github/repos/octo/blog/branches")).json();
  expect(branches).toMatchObject({ defaultBranch: "main" });
  expect(branches.branches).toContain("main");
  expect((await page.request.get("/api/github/repos/octo/missing/branches")).status()).toBe(404);
  await context.close();
});

test("it is refused without a connection, for someone else's draft, and cross-site", async ({
  playwright,
  browser,
}) => {
  const lone = await writer(playwright, browser, "gp-none", false);
  const body = {
    target: "file",
    id: lone.id,
    repo: "octo/blog",
    branch: "main",
    path: "x.md",
    mode: "commit",
  };
  const none = await publish(lone.page, body);
  expect(none.status()).toBe(409);
  expect((await none.json()).error).toBe("not_connected");

  const owner = await writer(playwright, browser, "gp-owner");
  const other = await writer(playwright, browser, "gp-other");
  expect((await publish(other.page, { ...body, id: owner.id })).status()).toBe(404);

  const cross = await other.page.request.post("/api/github/publish", {
    data: { ...body, id: other.id },
    headers: { origin: "https://evil.example" },
  });
  expect(cross.status()).toBe(403);
  expect(
    (await publish(other.page, { ...body, id: other.id, path: "../escape.md" })).status(),
  ).toBe(400);
  expect((await publish(other.page, { target: "nope" })).status()).toBe(400);
  await Promise.all([lone, owner, other].map((w) => w.context.close()));
});
