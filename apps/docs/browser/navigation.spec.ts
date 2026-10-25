/** Exercises the shared sidebar and landing brand at desktop and mobile breakpoints. */
import { expect, test } from "@playwright/test";

test("common links and section sublinks remain available without duplicate destinations", async ({
  page,
}) => {
  for (const route of [
    "/docs",
    "/docs/learn/create-an-app",
    "/docs/modules/storage/define",
    "/guides/storage/upload-product-images",
    "/docs/api/buckets",
  ]) {
    await page.goto(route);
    const sidebar = page.getByRole("complementary", { name: "Primary", exact: true });
    for (const name of [
      "Home",
      "Documentation",
      "GitHub",
      "Learn",
      "Modules",
      "Guides",
      "Reference",
    ]) {
      await expect(sidebar.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expect(
      sidebar.getByRole("link", { name: "Create and run an API", exact: true }),
    ).toBeVisible();
    const hrefs = await sidebar
      .locator("a[href]")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    await expect(sidebar.locator(`a[href="${route}"]`)).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "RELKIT", exact: true }).locator("svg"),
    ).toBeVisible();
  }
});

test("mobile readers can expand a different section with the keyboard and follow its sublink", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/learn/create-an-app");
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  const sidebar = page.getByRole("complementary", { name: "Primary", exact: true });
  const guides = sidebar.locator("summary").filter({ has: page.locator('a[href="/guides"]') });
  await guides.press("Enter");
  const storage = sidebar.locator("summary").filter({ hasText: "Storage" });
  await storage.press("Enter");
  await sidebar.getByRole("link", { name: "Upload product images", exact: true }).click();
  await expect(page).toHaveURL(/\/guides\/storage\/upload-product-images$/);
  await expect(
    page.getByRole("button", { name: "Toggle navigation", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
