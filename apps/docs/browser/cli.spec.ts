/** Verifies that CLI discovery leads to an actionable workflow and back from exact command help. */
import { expect, test } from "@playwright/test";

test("CLI module connects discovery, a verified workflow, and command reference", async ({
  page,
}) => {
  await page.goto("/docs/modules");
  await page
    .getByRole("main")
    .getByRole("link", { name: "CLI Create, develop, and build an app", exact: true })
    .click();
  await expect(page).toHaveURL(/\/docs\/modules\/cli$/);
  await page.getByRole("link", { name: "Create and build an API", exact: true }).first().click();
  await expect(page).toHaveURL(/\/guides\/cli\/create-and-build-an-api$/);
  await expect(page.getByRole("main")).toContainText("bun run relkit add route /ping --mode route");
  await expect(
    page.getByRole("heading", { name: "5. Build and run production output" }),
  ).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "build", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/api\/cli#relkit-build$/);
  await expect(page.locator("#relkit-build")).toBeVisible();
  await page.getByRole("link", { name: "CLI module", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/modules\/cli$/);
});

test("CLI search and mobile navigation expose authored instructions", async ({ page }) => {
  await page.goto("/docs");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("combobox").fill("CLI");
  const result = page.locator('[data-blume-search-results] a[href="/docs/modules/cli"]').first();
  await expect(result).toBeVisible();
  await expect(result).toContainText("Modules");
  await result.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Primary", exact: true })
    .getByRole("link", { name: "Add application files", exact: true })
    .click();
  await expect(page).toHaveURL(/\/docs\/modules\/cli\/add-artifacts$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add application files");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
