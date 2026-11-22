test("the AI writer keeps its buttons in view, and forgets a suggestion once it is applied", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 600 });
  await fakeOllama(page, JSON.stringify({ title: "Better title", description: "D", tags: ["a"] }));
  await startDraft(page);
  await page.getByRole("button", { name: "AI writer" }).click();
  await page.getByRole("button", { name: "Set up an integration" }).click();
  await addOllama(page);
  await page.getByRole("button", { name: "Suggest metadata" }).click();
  const apply = page.getByRole("button", { name: "Apply to current draft" });
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Better title");
  // the footer stays put however long the result is
  await expect(apply).toBeInViewport();
  await apply.click();
  await expect(page.getByLabel("Title", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "AI writer" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
});
