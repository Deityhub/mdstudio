import { expect, test, type Page } from "@playwright/test";
import { shared, startAndInvite, status, twoPeople } from "./collab-people";
import { editor } from "./sync-helpers";

// Two people typing in the same place at the same time, with real keystrokes in two real browsers,
// must end with exactly the same text, and nothing may break while they do.

const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const KEYS = [
  "a",
  "b",
  "c",
  " ",
  "x",
  "y",
  ".",
  "z",
  "Backspace",
  "Delete",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "Enter",
  "ControlOrMeta+z",
];

/** What the editor shows, without the other person's cursor label. */
const shown = (page: Page) =>
  page.locator(".cm-content").evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy
      .querySelectorAll(".cm-ySelectionCaret, .cm-ySelectionInfo, .cm-widgetBuffer")
      .forEach((n) => n.remove());
    return [...copy.querySelectorAll(".cm-line")].map((l) => l.textContent).join("\n");
  });

test("two people typing at once, in the same place, end with the same text", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { a, b, contexts, beaAddress } = await twoPeople(browser);
  const problems: string[] = [];
  for (const p of [a, b]) {
    p.on("pageerror", (e) => problems.push(e.message));
    p.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  }
  await startAndInvite(a, beaAddress);
  await a.keyboard.press("Escape");
  await b.reload();
  await shared(b)
    .getByRole("button", { name: /^Notes/ })
    .click();
  await expect(status(b)).toHaveText(/Live/, { timeout: 15_000 });
  await expect(editor(b)).toContainText("Start");

  for (const p of [a, b]) {
    await editor(p).click();
    await p.keyboard.press("ControlOrMeta+End");
    await p.evaluate(
      () => ((document.querySelector(".cm-content") as HTMLElement).dataset["mark"] = "same"),
    );
  }
  const drive = async (page: Page, seed: number) => {
    const r = rng(seed);
    for (let i = 0; i < 200; i++) {
      await page.keyboard.press(KEYS[Math.floor(r() * KEYS.length)]!);
      if (r() < 0.3) await page.waitForTimeout(Math.floor(r() * 60));
    }
  };
  await Promise.all([drive(a, 21), drive(b, 33)]);
  await expect
    .poll(async () => (await shown(a)) === (await shown(b)), { timeout: 15_000 })
    .toBe(true);
  expect(problems).toEqual([]);
  // the editors were never rebuilt under the typists
  await expect(editor(a)).toHaveAttribute("data-mark", "same");
  await expect(editor(b)).toHaveAttribute("data-mark", "same");
  for (const c of contexts) await c.close();
});

test("someone closing their tab while others type loses nothing for the rest", async ({
  browser,
}) => {
  const { a, b, contexts, beaAddress } = await twoPeople(browser);
  await startAndInvite(a, beaAddress);
  await a.keyboard.press("Escape");
  await b.reload();
  await shared(b)
    .getByRole("button", { name: /^Notes/ })
    .click();
  await expect(status(b)).toHaveText(/Live/, { timeout: 15_000 });
  // a third tab of the owner joins and goes away abruptly, again and again
  for (let i = 0; i < 3; i++) {
    const extra = await contexts[0]!.newPage();
    await extra.goto(a.url());
    await expect(status(extra)).toHaveText(/Live/, { timeout: 15_000 });
    await editor(a).click();
    await a.keyboard.press("ControlOrMeta+End");
    await a.keyboard.insertText(` a${i}`);
    await extra.close();
    await editor(b).click();
    await b.keyboard.press("ControlOrMeta+End");
    await b.keyboard.insertText(` b${i}`);
  }
  await expect
    .poll(async () => (await shown(a)) === (await shown(b)), { timeout: 15_000 })
    .toBe(true);
  for (const word of ["a0", "a1", "a2", "b0", "b1", "b2"]) expect(await shown(a)).toContain(word);
  for (const c of contexts) await c.close();
});
