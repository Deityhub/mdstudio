import { expect, test, type Page } from "@playwright/test";
import { openDialog, shared, startAndInvite, status, twoPeople } from "./collab-people";
import { editor } from "./sync-helpers";

// Comments and suggestions on the words of a draft edited together, in two real browsers.

async function bothInDraft(browser: Parameters<typeof twoPeople>[0]) {
  const people = await twoPeople(browser);
  await startAndInvite(people.a, people.beaAddress);
  await people.a.keyboard.press("Escape");
  await people.b.reload();
  await shared(people.b)
    .getByRole("button", { name: /^Notes/ })
    .click();
  await expect(status(people.b)).toHaveText(/Live/, { timeout: 15_000 });
  await expect(status(people.a)).toHaveText(/Live/, { timeout: 15_000 });
  return people;
}
const panel = (p: Page) => p.getByTestId("live-comments");
const openPanel = async (p: Page) => {
  if (!(await panel(p).isVisible()))
    await p.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(panel(p)).toBeVisible();
};
/** Selects a word in the editor, as a person double-clicking it does. */
const select = async (p: Page, word: string) => {
  await editor(p).getByText(word, { exact: false }).first().dblclick();
};

test("a comment on some words shows for the other person, on the words and in the list, and can be answered and resolved", async ({
  browser,
}) => {
  const { a, b, contexts } = await bothInDraft(browser);
  await openPanel(b);
  await select(b, "Start");
  await panel(b).getByRole("button", { name: "Comment on selection" }).click();
  await b.getByLabel("Your comment").fill("Start of what?");
  await b.getByRole("button", { name: "Comment", exact: true }).click();

  // the owner sees the words marked, and the thread
  await expect(a.locator(".cm-thread")).toHaveText("Start");
  await openPanel(a);
  const thread = panel(a).getByRole("listitem").filter({ hasText: "Start of what?" });
  await expect(thread).toBeVisible();
  // typing in front of the words moves the mark with them
  await editor(a).click();
  await a.keyboard.press("ControlOrMeta+Home");
  await a.keyboard.insertText("New first line\n");
  await expect(a.locator(".cm-thread")).toHaveText("Start");
  await expect(b.locator(".cm-thread")).toHaveText("Start");

  await thread.getByLabel(/^Reply to/).fill("The draft");
  await thread.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(panel(b).getByText("The draft")).toBeVisible();
  await thread.getByRole("button", { name: "Resolve" }).click();
  await expect(a.locator(".cm-thread")).toHaveCount(0); // resolved: no longer marked
  await expect(panel(b).getByRole("button", { name: "Show 1 closed" })).toBeVisible();
  for (const c of contexts) await c.close();
});

test("a suggestion is accepted by someone else and becomes an edit that their Undo takes back", async ({
  browser,
}) => {
  const { a, b, contexts } = await bothInDraft(browser);
  await openPanel(b);
  await select(b, "Start");
  await panel(b).getByRole("button", { name: "Suggest an edit" }).click();
  await b.getByLabel("Replace these words with").fill("Beginning");
  await b.getByRole("button", { name: "Suggest", exact: true }).click();

  await openPanel(a);
  const item = panel(a).getByRole("listitem").filter({ hasText: "Beginning" });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Accept" }).click();
  await expect(editor(a)).toContainText("Beginning");
  await expect(editor(b)).toContainText("Beginning");
  await expect(a.locator(".cm-thread")).toHaveCount(0);

  await editor(a).click();
  await a.keyboard.press("ControlOrMeta+z");
  await expect(editor(a)).toContainText("Start");
  await expect(editor(b)).toContainText("Start");
  for (const c of contexts) await c.close();
});

test("a suggestion on words that were edited meanwhile cannot be accepted", async ({ browser }) => {
  const { a, b, contexts } = await bothInDraft(browser);
  await openPanel(b);
  await select(b, "Start");
  await panel(b).getByRole("button", { name: "Suggest an edit" }).click();
  await b.getByLabel("Replace these words with").fill("Beginning");
  await b.getByRole("button", { name: "Suggest", exact: true }).click();
  await openPanel(a);
  const item = panel(a).getByRole("listitem").filter({ hasText: "Beginning" });
  await expect(item).toBeVisible();

  // the owner edits inside the words first
  await a.locator(".cm-thread").click();
  await a.keyboard.press("ArrowRight");
  await a.keyboard.insertText("X");
  await expect(item.getByText("(edited since)")).toBeVisible();
  await item.getByRole("button", { name: "Accept" }).click();
  await expect(a.getByText("The words were edited since")).toBeVisible();
  await expect(editor(a)).not.toContainText("Beginning");
  for (const c of contexts) await c.close();
});

test("stopping editing together keeps the open comments in the draft's History", async ({
  browser,
}) => {
  const { a, b, contexts } = await bothInDraft(browser);
  await openPanel(b);
  await select(b, "Start");
  await panel(b).getByRole("button", { name: "Comment on selection" }).click();
  await b.getByLabel("Your comment").fill("Please expand this");
  await b.getByRole("button", { name: "Comment", exact: true }).click();
  await openPanel(a);
  await expect(panel(a).getByText("Please expand this")).toBeVisible();

  const dialog = await openDialog(a);
  await expect(
    dialog.getByText(/Comments and suggestions end with editing together/),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Stop editing together" }).click();
  await expect(status(a)).toHaveCount(0, { timeout: 15_000 });

  const kept = await a.evaluate(
    () =>
      new Promise<string>((res) => {
        const r = indexedDB.open("mdstudio-db");
        r.onsuccess = () => {
          const q = r.result.transaction("mdstudio-store").objectStore("mdstudio-store").getAll();
          q.onsuccess = () => res(JSON.stringify(q.result));
        };
      }),
  );
  expect(kept).toContain("Comments and suggestions");
  expect(kept).toContain("Please expand this");
  for (const c of contexts) await c.close();
});

test("restoring a version in a draft edited together can be undone, and Bea's typing stays", async ({
  browser,
}) => {
  const { a, b, contexts } = await bothInDraft(browser);
  // a saved version, then the draft moves on
  await a.getByRole("button", { name: "History", exact: true }).click();
  await a.getByRole("button", { name: "Save a version now" }).click();
  await editor(a).click();
  await a.keyboard.press("ControlOrMeta+End");
  await a.keyboard.insertText("\n\nadded after the version");
  await expect(editor(b)).toContainText("added after the version");
  await a.waitForTimeout(700); // Undo joins changes made within half a second into one step

  // restore it, while Bea types elsewhere
  await a.getByRole("button", { name: /words/ }).first().click();
  await a.getByRole("button", { name: "Restore this version" }).click();
  await expect(editor(a)).not.toContainText("added after the version");
  await editor(b).click();
  await b.keyboard.press("ControlOrMeta+Home");
  await b.keyboard.insertText("Bea: ");
  await expect(editor(a)).toContainText("Bea: ");

  await editor(a).click();
  await a.keyboard.press("ControlOrMeta+z");
  await expect(editor(a)).toContainText("added after the version");
  await expect(editor(b)).toContainText("added after the version");
  await expect(editor(b)).toContainText("Bea: "); // hers stays
  for (const c of contexts) await c.close();
});
